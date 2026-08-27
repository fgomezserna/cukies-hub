import "server-only";

import type { ClientSession, Db, OptionalUnlessRequiredId } from "mongodb";

import { DomainConflictError } from "../errors";
import {
  assertGameEconomyRule,
  stableGameEconomyHash,
} from "./rules";
import type {
  GameEconomyEvent,
  GameEconomyRule,
  GameEconomySession,
  GameEconomySessionStatus,
} from "./types";

export interface GameEconomyRepository {
  findActiveRule(
    gameId: string,
    at: Date,
    expectedVersion?: string
  ): Promise<GameEconomyRule | null>;
  findRuleVersion(
    gameId: string,
    version: string
  ): Promise<GameEconomyRule | null>;
  findSession(sessionId: string): Promise<GameEconomySession | null>;
  findSessionByCreateIdempotencyKey(
    idempotencyKey: string
  ): Promise<GameEconomySession | null>;
  insertSession(session: GameEconomySession): Promise<void>;
  replaceSession(
    previous: GameEconomySession,
    next: GameEconomySession
  ): Promise<GameEconomySession | null>;
  listExpiredSessions(
    now: Date,
    limit: number
  ): Promise<GameEconomySession[]>;
  listRecoverableSessions(
    now: Date,
    limit: number
  ): Promise<GameEconomySession[]>;
  advanceRewardPeriodGuard(periodId: string, now: Date): Promise<void>;
}

export type GameEconomyTransactionRunner = <T>(
  work: (repository: GameEconomyRepository) => Promise<T>
) => Promise<T>;

function duplicateKey(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
  );
}

export function createMongoGameEconomyRepository(
  db: Db,
  session: ClientSession
): GameEconomyRepository {
  const rules = db.collection<GameEconomyRule>("game_economy_rules");
  const sessions = db.collection<GameEconomySession>("game_economy_sessions");
  const events = db.collection<GameEconomyEvent>("game_economy_events");
  const rewardPeriodStates = db.collection<{
    _id: string;
    periodId: string;
    status: "open" | "sealed";
    allocationRevision: number;
    revision: number;
    sealId?: string;
    createdAt: Date;
    updatedAt: Date;
  }>("reward_period_states");
  const options = { session };

  function sessionEvent(
    previous: GameEconomySession | null,
    next: GameEconomySession,
  ): GameEconomyEvent {
    const eventId = stableGameEconomyHash({
      kind: "game-economy-session-event-id",
      sessionId: next.sessionId,
      toRevision: next.revision,
    });
    const immutable = {
      eventId,
      sessionId: next.sessionId,
      fromRevision: previous?.revision ?? null,
      toRevision: next.revision,
      fromStatus: previous?.status ?? null,
      toStatus: next.status,
      creditState: next.credit.state,
      cukieState: next.cukie.state,
      fenceToken: next.fenceToken,
      createdAt: next.updatedAt,
    };
    return {
      _id: eventId,
      ...immutable,
      payloadHash: stableGameEconomyHash({
        kind: "game-economy-session-event",
        ...immutable,
      }),
    };
  }

  return {
    async findActiveRule(gameId, at, expectedVersion) {
      const candidates = await rules
        .find(
          {
            gameId,
            active: true,
            activeFrom: { $lte: at },
            $or: [
              { activeUntil: { $exists: false } },
              { activeUntil: { $gt: at } },
            ],
          },
          options
        )
        .sort({ activeFrom: -1, _id: 1 })
        .limit(2)
        .toArray();
      if (candidates.length > 1) {
        throw new DomainConflictError(
          `Hay reglas activas solapadas para ${gameId}.`
        );
      }
      if (expectedVersion && candidates[0]?.version !== expectedVersion) {
        return null;
      }
      if (candidates[0]) assertGameEconomyRule(candidates[0]);
      return candidates[0] ?? null;
    },
    async findRuleVersion(gameId, version) {
      const rule = await rules.findOne({ gameId, version }, options);
      if (rule) assertGameEconomyRule(rule);
      return rule;
    },
    findSession: (sessionId) => sessions.findOne({ _id: sessionId }, options),
    findSessionByCreateIdempotencyKey: (idempotencyKey) =>
      sessions.findOne(
        { "createCommand.idempotencyKey": idempotencyKey },
        options
      ),
    async insertSession(value) {
      await sessions.insertOne(value, options);
      await events.insertOne(sessionEvent(null, value), options);
    },
    async replaceSession(previous, next) {
      const { _id: _id, ...replacement } = next;
      const replaced = await sessions.findOneAndReplace(
        {
          _id: previous._id,
          revision: previous.revision,
          fenceToken: previous.fenceToken,
          status: previous.status,
        },
        replacement as OptionalUnlessRequiredId<GameEconomySession>,
        { ...options, returnDocument: "after" }
      );
      if (replaced) await events.insertOne(sessionEvent(previous, replaced), options);
      return replaced;
    },
    listExpiredSessions(now, limit) {
      const nonTerminal: GameEconomySessionStatus[] = [
        "created",
        "resources_reserved",
        "started",
        "submitted",
        "validated",
      ];
      return sessions
        .find(
          { status: { $in: nonTerminal }, expiresAt: { $lte: now } },
          options
        )
        .sort({ expiresAt: 1, _id: 1 })
        .limit(limit)
        .toArray();
    },
    listRecoverableSessions(now, limit) {
      return sessions
        .find(
          {
            $or: [
              { status: "created" },
              { settlementIntent: { $exists: true }, settlementCommand: { $exists: false } },
              { terminalIntent: { $exists: true }, terminal: { $exists: false } },
              {
                status: "submitted",
                "operation.leaseExpiresAt": { $lte: now },
              },
            ],
          },
          options,
        )
        .sort({ updatedAt: 1, _id: 1 })
        .limit(limit)
        .toArray();
    },
    async advanceRewardPeriodGuard(periodId, now) {
      const current = await rewardPeriodStates.findOne({ _id: periodId }, options);
      if (current?.status === "sealed") {
        throw new DomainConflictError(
          `El periodo rewards ${periodId} ya esta sellado.`,
        );
      }
      if (!current) {
        try {
          await rewardPeriodStates.insertOne({
            _id: periodId,
            periodId,
            status: "open",
            allocationRevision: 0,
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }, options);
          return;
        } catch (error) {
          if (duplicateKey(error)) {
            throw new DomainConflictError(
              `El periodo rewards ${periodId} cambio durante el settlement.`,
            );
          }
          throw error;
        }
      }
      const result = await rewardPeriodStates.updateOne(
        { _id: periodId, status: "open", revision: current.revision },
        { $inc: { revision: 1 }, $set: { updatedAt: now } },
        options,
      );
      if (result.matchedCount !== 1) {
        throw new DomainConflictError(
          `El periodo rewards ${periodId} cambio durante el settlement.`,
        );
      }
    },
  };
}

export const mongoGameEconomyTransactionRunner: GameEconomyTransactionRunner =
  async (work) => {
    const { withEconomyTransaction } = await import(
      "@/lib/indexer-db/mongodb"
    );
    return withEconomyTransaction((db, session) =>
      work(createMongoGameEconomyRepository(db, session))
    );
  };

export function mapGameEconomyPersistenceError(error: unknown) {
  if (duplicateKey(error)) {
    return new DomainConflictError(
      "Conflicto de idempotencia o unicidad en una sesion de juego.",
      { persistenceFailure: "DUPLICATE_KEY", mongoCode: 11000 }
    );
  }
  return error;
}
