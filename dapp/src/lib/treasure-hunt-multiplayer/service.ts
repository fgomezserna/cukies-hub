import { randomBytes, randomUUID } from 'node:crypto';

import { createMatchRules } from './config';
import {
  GameSessionMatchConflictError,
  MatchAlreadyExistsError,
  MatchNotFoundError,
  MatchRevisionConflictError,
  MultiplayerDomainError,
  invalidInput,
  invalidSnapshot,
} from './errors';
import { createMatchPlayer, createWaitingMatch } from './match';
import { projectPublicMatch } from './projection';
import {
  forfeitMatchPlayer,
  isTerminalMatch,
  reconcileMatch,
  reconnectMatchPlayer,
} from './reconcile';
import type { MatchRepository } from './repository';
import { applyPlayerSnapshot } from './snapshots';
import type {
  Match,
  MatchIdentity,
  MatchPlayer,
  MatchRules,
  PublicMatch,
} from './types';
import { TREASURE_HUNT_RULES_VERSION } from './types';

export interface MultiplayerClock {
  now(): number;
}

export interface MultiplayerIdFactory {
  createMatchId(): string;
  createPlayerId(): string;
  createSeed(): string;
}

export interface MultiplayerServiceOptions {
  readonly clock?: MultiplayerClock;
  readonly idFactory?: MultiplayerIdFactory;
  readonly rules?: Partial<MatchRules>;
  readonly rulesVersion?: string;
  readonly maxCasRetries?: number;
}

export interface CreateOrJoinInput extends MatchIdentity {
  readonly roomCode: string;
}

export interface CreateOrJoinResult {
  readonly match: PublicMatch;
  readonly playerId: string;
  readonly slot: 0 | 1;
}

export interface PlayerOperationInput extends MatchIdentity {
  readonly matchId: string;
}

export interface SnapshotOperationInput extends PlayerOperationInput {
  readonly snapshot: unknown;
}

const SYSTEM_CLOCK: MultiplayerClock = { now: () => Date.now() };
const CRYPTO_ID_FACTORY: MultiplayerIdFactory = {
  createMatchId: () => `thm_${randomUUID()}`,
  createPlayerId: () => `thp_${randomUUID()}`,
  createSeed: () => randomBytes(32).toString('hex'),
};

function requireIdentifier(value: string, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 128) {
    throw invalidInput(`${field} must be a non-empty string of at most 128 characters`);
  }

  return value.trim();
}

function findPlayer(match: Match, identity: MatchIdentity): MatchPlayer | undefined {
  return match.players.find(
    (player) =>
      player.userId === identity.userId &&
      player.gameSessionId === identity.gameSessionId &&
      player.clientInstanceId === identity.clientInstanceId,
  );
}

function findPlayerByUserId(match: Match, userId: string): MatchPlayer | undefined {
  return match.players.find((player) => player.userId === userId);
}

export class TreasureHuntMultiplayerService {
  private readonly clock: MultiplayerClock;
  private readonly idFactory: MultiplayerIdFactory;
  private readonly rules: MatchRules;
  private readonly rulesVersion: string;
  private readonly maxCasRetries: number;

  constructor(
    private readonly repository: MatchRepository,
    options: MultiplayerServiceOptions = {},
  ) {
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.idFactory = options.idFactory ?? CRYPTO_ID_FACTORY;
    this.rules = createMatchRules(options.rules);
    this.rulesVersion = options.rulesVersion ?? TREASURE_HUNT_RULES_VERSION;
    this.maxCasRetries = options.maxCasRetries ?? 12;

    if (!Number.isSafeInteger(this.maxCasRetries) || this.maxCasRetries <= 0) {
      throw new TypeError('maxCasRetries must be a positive safe integer');
    }
  }

  private context(now: number) {
    return { now, createSeed: () => this.idFactory.createSeed() };
  }

  private normalizeIdentity(identity: MatchIdentity): MatchIdentity {
    return {
      userId: requireIdentifier(identity.userId, 'userId'),
      gameSessionId: requireIdentifier(identity.gameSessionId, 'gameSessionId'),
      clientInstanceId: requireIdentifier(identity.clientInstanceId, 'clientInstanceId'),
    };
  }

  private async saveWithRetry(
    matchId: string,
    mutate: (current: Match, now: number) => Match,
  ): Promise<Match> {
    for (let attempt = 0; attempt < this.maxCasRetries; attempt += 1) {
      const current = await this.repository.findByMatchId(matchId);
      if (!current) {
        throw new MatchNotFoundError(matchId);
      }

      const next = mutate(current, this.clock.now());
      if (next === current) {
        return current;
      }

      try {
        return await this.repository.save(next, current.revision);
      } catch (error) {
        if (error instanceof MatchRevisionConflictError) {
          continue;
        }
        throw error;
      }
    }

    throw new MultiplayerDomainError(
      'CONCURRENT_UPDATE_LIMIT',
      `Match ${matchId} could not be updated after ${this.maxCasRetries} CAS retries`,
      409,
    );
  }

  async createOrJoin(input: CreateOrJoinInput): Promise<CreateOrJoinResult> {
    const identity = this.normalizeIdentity(input);
    const roomCode = requireIdentifier(input.roomCode, 'roomCode');

    for (let attempt = 0; attempt < this.maxCasRetries; attempt += 1) {
      let existing = await this.repository.findByRoomCode(roomCode);
      const now = this.clock.now();

      if (!existing) {
        if (await this.repository.findNonTerminalByUserId(identity.userId)) {
          throw new MultiplayerDomainError(
            'PLAYER_ACTIVE_MATCH',
            'Player already has a non-terminal match',
            409,
          );
        }
        const playerId = this.idFactory.createPlayerId();
        const match = createWaitingMatch({
          matchId: this.idFactory.createMatchId(),
          roomCode,
          firstPlayer: { ...identity, playerId },
          rules: this.rules,
          rulesVersion: this.rulesVersion,
          now,
        });

        try {
          const created = await this.repository.create(match);
          return { match: projectPublicMatch(created), playerId, slot: 0 };
        } catch (error) {
          if (error instanceof MatchAlreadyExistsError) {
            continue;
          }
          throw error;
        }
      }

      const reconciledExisting = reconcileMatch(existing, this.context(now));
      if (reconciledExisting !== existing) {
        try {
          existing = await this.repository.save(reconciledExisting, existing.revision);
        } catch (error) {
          if (error instanceof MatchRevisionConflictError) {
            continue;
          }
          throw error;
        }
      }

      const alreadyJoined = findPlayer(existing, identity);
      if (alreadyJoined) {
        const next = reconcileMatch(
          reconnectMatchPlayer(
            reconcileMatch(existing, this.context(now)),
            alreadyJoined.playerId,
            now,
          ),
          this.context(now),
        );
        if (next === existing) {
          return {
            match: projectPublicMatch(existing),
            playerId: alreadyJoined.playerId,
            slot: alreadyJoined.slot,
          };
        }

        try {
          const reconnected = await this.repository.save(next, existing.revision);
          return {
            match: projectPublicMatch(reconnected),
            playerId: alreadyJoined.playerId,
            slot: alreadyJoined.slot,
          };
        } catch (error) {
          if (error instanceof MatchRevisionConflictError) {
            continue;
          }
          throw error;
        }
      }

      const sameUser = findPlayerByUserId(existing, identity.userId);
      if (sameUser) {
        if (sameUser.gameSessionId !== identity.gameSessionId) {
          throw new GameSessionMatchConflictError(
            'A player cannot rotate GameSession inside an existing match',
          );
        }
        if (isTerminalMatch(existing)) {
          const activeSessionMatch = await this.repository.findNonTerminalByGameSession(
            identity.userId,
            identity.gameSessionId,
          );
          if (activeSessionMatch && activeSessionMatch.matchId !== existing.matchId) {
            throw new GameSessionMatchConflictError();
          }
          const adopted: Match = {
            ...existing,
            players: existing.players.map((player) =>
              player.playerId === sameUser.playerId
                ? { ...player, clientInstanceId: identity.clientInstanceId }
                : player,
            ),
            updatedAt: now,
          };
          try {
            const saved = await this.repository.save(adopted, existing.revision);
            return {
              match: projectPublicMatch(saved),
              playerId: sameUser.playerId,
              slot: sameUser.slot,
            };
          } catch (error) {
            if (error instanceof MatchRevisionConflictError) {
              continue;
            }
            throw error;
          }
        }

        if (existing.status === 'waiting') {
          const rotated: Match = {
            ...existing,
            players: existing.players.map((player) =>
              player.playerId === sameUser.playerId
                ? {
                    ...player,
                    clientInstanceId: identity.clientInstanceId,
                    presence: 'online' as const,
                    lastHeartbeatAt: now,
                    offlineSince: null,
                    reconnectAccountedAt: null,
                    reconnectBudgetRemainingMs: existing.rules.reconnectBudgetMs,
                    lastSnapshotAcceptedAt: null,
                  }
                : player,
            ),
            updatedAt: now,
          };
          try {
            const saved = await this.repository.save(
              reconcileMatch(rotated, this.context(now)),
              existing.revision,
            );
            return {
              match: projectPublicMatch(saved),
              playerId: sameUser.playerId,
              slot: sameUser.slot,
            };
          } catch (error) {
            if (error instanceof MatchRevisionConflictError) {
              continue;
            }
            throw error;
          }
        }

        const rotated: Match = {
          ...existing,
          players: existing.players.map((player) =>
            player.playerId === sameUser.playerId
              ? {
                  ...player,
                  clientInstanceId: identity.clientInstanceId,
                }
              : player,
          ),
          updatedAt: now,
        };
        try {
          const forfeited = await this.repository.save(
            forfeitMatchPlayer(rotated, sameUser.playerId, now),
            existing.revision,
          );
          return {
            match: projectPublicMatch(forfeited),
            playerId: sameUser.playerId,
            slot: sameUser.slot,
          };
        } catch (error) {
          if (error instanceof MatchRevisionConflictError) {
            continue;
          }
          throw error;
        }
      }

      if (existing.players.length >= 2) {
        throw new MultiplayerDomainError('MATCH_FULL', `Room ${roomCode} already has two players`, 409);
      }

      if (isTerminalMatch(existing)) {
        throw new MultiplayerDomainError('MATCH_TERMINAL', `Match ${existing.matchId} is terminal`, 409);
      }

      const activeMatch = await this.repository.findNonTerminalByUserId(identity.userId);
      if (activeMatch && activeMatch.matchId !== existing.matchId) {
        throw new MultiplayerDomainError(
          'PLAYER_ACTIVE_MATCH',
          'Player already has a non-terminal match',
          409,
        );
      }

      const playerId = this.idFactory.createPlayerId();
      const joined: Match = {
        ...existing,
        players: [
          ...existing.players,
          createMatchPlayer({
            ...identity,
            playerId,
            slot: 1,
            rules: existing.rules,
            now,
          }),
        ],
        activeUserIds: [...existing.activeUserIds, identity.userId],
        updatedAt: now,
      };
      const reconciled = reconcileMatch(joined, this.context(now));

      try {
        const saved = await this.repository.save(reconciled, existing.revision);
        return { match: projectPublicMatch(saved), playerId, slot: 1 };
      } catch (error) {
        if (error instanceof MatchRevisionConflictError) {
          continue;
        }
        throw error;
      }
    }

    throw new MultiplayerDomainError(
      'CONCURRENT_UPDATE_LIMIT',
      `Room ${roomCode} could not be joined after ${this.maxCasRetries} CAS retries`,
      409,
    );
  }

  async updateSnapshot(input: SnapshotOperationInput): Promise<PublicMatch> {
    const matchId = requireIdentifier(input.matchId, 'matchId');
    const identity = this.normalizeIdentity(input);
    const updated = await this.saveWithRetry(matchId, (current, now) => {
      let next = reconcileMatch(current, this.context(now));
      const player = findPlayer(next, identity);
      if (!player) {
        throw new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404);
      }
      if (isTerminalMatch(next)) {
        return next;
      }
      if (next.status !== 'running' && next.status !== 'sudden_death') {
        throw invalidSnapshot(`snapshots are not accepted while match status is ${next.status}`);
      }
      if (next.startAt === null) {
        throw invalidSnapshot('match startAt is required before accepting snapshots');
      }
      const startAt = next.startAt;
      if (next.pendingElimination?.playerId === player.playerId) {
        throw invalidSnapshot('the first-out player snapshot is frozen');
      }
      if (
        next.status === 'sudden_death' &&
        next.suddenDeath?.leaderPlayerId === player.playerId
      ) {
        throw invalidSnapshot('the sudden-death leader snapshot is frozen');
      }

      next = reconnectMatchPlayer(next, player.playerId, now);
      next = {
        ...next,
        players: next.players.map((candidate) =>
          candidate.playerId === player.playerId
            ? applyPlayerSnapshot(candidate, input.snapshot, next.rules, {
                now,
                startAt,
              })
            : candidate,
        ),
        updatedAt: now,
      };
      return reconcileMatch(next, this.context(now));
    });

    return projectPublicMatch(updated);
  }

  async heartbeat(input: PlayerOperationInput): Promise<PublicMatch> {
    const matchId = requireIdentifier(input.matchId, 'matchId');
    const identity = this.normalizeIdentity(input);
    const updated = await this.saveWithRetry(matchId, (current, now) => {
      let next = reconcileMatch(current, this.context(now));
      const player = findPlayer(next, identity);
      if (!player) {
        throw new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404);
      }
      if (isTerminalMatch(next)) {
        return next;
      }

      next = reconnectMatchPlayer(next, player.playerId, now);
      return reconcileMatch(next, this.context(now));
    });

    return projectPublicMatch(updated);
  }

  async forfeit(input: PlayerOperationInput): Promise<PublicMatch> {
    const matchId = requireIdentifier(input.matchId, 'matchId');
    const identity = this.normalizeIdentity(input);
    const updated = await this.saveWithRetry(matchId, (current, now) => {
      const player = findPlayer(current, identity);
      if (!player) {
        throw new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404);
      }
      return isTerminalMatch(current)
        ? current
        : forfeitMatchPlayer(current, player.playerId, now);
    });
    return projectPublicMatch(updated);
  }

  async releaseForParticipant(identityInput: MatchIdentity): Promise<PublicMatch | null> {
    const identity = this.normalizeIdentity(identityInput);
    const active = await this.repository.findNonTerminalByGameSession(
      identity.userId,
      identity.gameSessionId,
    );
    if (active) {
      const updated = await this.saveWithRetry(active.matchId, (current, now) => {
        const player = findPlayer(current, identity);
        if (!player) {
          throw new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404);
        }
        return isTerminalMatch(current)
          ? current
          : forfeitMatchPlayer(current, player.playerId, now);
      });
      return projectPublicMatch(updated);
    }

    const bound = await this.repository.findByGameSession(
      identity.userId,
      identity.gameSessionId,
    );
    if (!bound) {
      return null;
    }
    if (!findPlayer(bound, identity)) {
      throw new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404);
    }
    return projectPublicMatch(bound);
  }

  async reconcile(matchIdInput: string): Promise<PublicMatch> {
    const matchId = requireIdentifier(matchIdInput, 'matchId');
    const updated = await this.saveWithRetry(matchId, (current, now) =>
      reconcileMatch(current, this.context(now)),
    );
    return projectPublicMatch(updated);
  }

  async reconcileForParticipant(input: PlayerOperationInput): Promise<PublicMatch> {
    const matchId = requireIdentifier(input.matchId, 'matchId');
    const identity = this.normalizeIdentity(input);
    const updated = await this.saveWithRetry(matchId, (current, now) => {
      if (!findPlayer(current, identity)) {
        throw new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404);
      }

      return reconcileMatch(current, this.context(now));
    });

    return projectPublicMatch(updated);
  }

  async getForParticipant(input: PlayerOperationInput): Promise<PublicMatch> {
    return this.reconcileForParticipant(input);
  }

  async sweepDue(limit = 100): Promise<number> {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 500) {
      throw new TypeError('sweep limit must be an integer between 1 and 500');
    }

    const due = await this.repository.findDue(this.clock.now(), limit);
    let reconciled = 0;
    for (const match of due) {
      try {
        await this.reconcile(match.matchId);
        reconciled += 1;
      } catch (error) {
        if (!(error instanceof MatchNotFoundError)) {
          throw error;
        }
      }
    }
    return reconciled;
  }
}
