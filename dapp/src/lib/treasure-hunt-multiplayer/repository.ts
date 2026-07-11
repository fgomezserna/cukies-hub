import {
  MatchAlreadyExistsError,
  MatchNotFoundError,
  MatchRevisionConflictError,
} from './errors';
import type { Match } from './types';

export interface MatchRepository {
  create(match: Match): Promise<Match>;
  findByMatchId(matchId: string): Promise<Match | null>;
  findByRoomCode(roomCode: string): Promise<Match | null>;
  findNonTerminalByUserId(userId: string): Promise<Match | null>;
  findDue(now: number, limit: number): Promise<readonly Match[]>;
  save(match: Match, expectedRevision: number): Promise<Match>;
}

function cloneMatch(match: Match): Match {
  return JSON.parse(JSON.stringify(match)) as Match;
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly matches = new Map<string, Match>();
  private readonly roomCodes = new Map<string, string>();

  async create(match: Match): Promise<Match> {
    if (this.matches.has(match.matchId) || this.roomCodes.has(match.roomCode)) {
      throw new MatchAlreadyExistsError();
    }

    const stored = cloneMatch({ ...match, revision: 0 });
    this.matches.set(stored.matchId, stored);
    this.roomCodes.set(stored.roomCode, stored.matchId);
    return cloneMatch(stored);
  }

  async findByMatchId(matchId: string): Promise<Match | null> {
    const match = this.matches.get(matchId);
    return match ? cloneMatch(match) : null;
  }

  async findByRoomCode(roomCode: string): Promise<Match | null> {
    const matchId = this.roomCodes.get(roomCode);
    return matchId ? this.findByMatchId(matchId) : null;
  }

  async findNonTerminalByUserId(userId: string): Promise<Match | null> {
    const match = [...this.matches.values()].find(
      (candidate) =>
        candidate.status !== 'finished' &&
        candidate.status !== 'abandoned' &&
        candidate.players.some((player) => player.userId === userId),
    );
    return match ? cloneMatch(match) : null;
  }

  async findDue(now: number, limit: number): Promise<readonly Match[]> {
    return [...this.matches.values()]
      .filter(
        (match) =>
          match.status !== 'finished' &&
          match.status !== 'abandoned' &&
          match.nextReconcileAt !== null &&
          match.nextReconcileAt <= now,
      )
      .sort((left, right) => (left.nextReconcileAt ?? 0) - (right.nextReconcileAt ?? 0))
      .slice(0, limit)
      .map(cloneMatch);
  }

  async save(match: Match, expectedRevision: number): Promise<Match> {
    const current = this.matches.get(match.matchId);
    if (!current) {
      throw new MatchNotFoundError(match.matchId);
    }

    if (current.revision !== expectedRevision) {
      throw new MatchRevisionConflictError(match.matchId, expectedRevision);
    }

    const roomOwner = this.roomCodes.get(match.roomCode);
    if (roomOwner && roomOwner !== match.matchId) {
      throw new MatchAlreadyExistsError(`Room code ${match.roomCode} is already in use`);
    }

    if (current.roomCode !== match.roomCode) {
      this.roomCodes.delete(current.roomCode);
      this.roomCodes.set(match.roomCode, match.matchId);
    }

    const stored = cloneMatch({ ...match, revision: expectedRevision + 1 });
    this.matches.set(stored.matchId, stored);
    return cloneMatch(stored);
  }
}
