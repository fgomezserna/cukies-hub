import { DomainConflictError } from "../errors";
import type {
  GameCukieResourcePort,
  GameCreditResourcePort,
  GameEconomyPorts,
  GameResultEvidencePort,
  GameResourceReservationResult,
  VerifiedGameResult,
} from "./ports";
import type {
  GameEconomyRepository,
  GameEconomyTransactionRunner,
} from "./repository";
import {
  buildGameRuleConfigHash,
  compareText,
  stableGameEconomyHash,
} from "./rules";
import {
  GAME_ECONOMY_RULE_SCOPE,
  type GameEconomyRule,
  type GameEconomySession,
  type GameEconomySessionStatus,
} from "./types";

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [
        key,
        clone(child),
      ])
    ) as T;
  }
  return value;
}

export function testGameEconomyRule(
  overrides: Partial<GameEconomyRule> = {}
): GameEconomyRule {
  const now = new Date("2026-07-01T00:00:00.000Z");
  const rule: GameEconomyRule = {
    _id: "arena:v1",
    scope: GAME_ECONOMY_RULE_SCOPE,
    gameId: "arena",
    version: "v1",
    active: true,
    activeFrom: now,
    sessionTtlMs: 10 * 60 * 1000,
    operationLeaseMs: 30_000,
    credit: {
      required: true,
      consumeOnSettle: true,
      costCode: "arena:start",
      creditRuleVersion: "credits-v1",
      creditRuleConfigHash: "c".repeat(64),
    },
    reward: {
      rewardRuleVersion: "rewards-v1",
      rewardRuleConfigHash: "d".repeat(64),
      maxConvertibleRaw: "1500",
    },
    cukie: {
      required: true,
      consumeOnSettle: false,
      minAssets: 1,
      maxAssets: 2,
      role: "competitor",
      selectionPolicy: "legacy_client_assets_v1",
    },
    calculation: {
      scoreCapRaw: "1000",
      weightNumeratorRaw: "3",
      weightDenominatorRaw: "2",
    },
    configHash: "",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
  rule._id = `${rule.gameId}:${rule.version}`;
  rule.configHash = overrides.configHash ?? buildGameRuleConfigHash(rule);
  return rule;
}

export class MemoryGameEconomyRepository implements GameEconomyRepository {
  state: {
    rules: GameEconomyRule[];
    sessions: GameEconomySession[];
    rewardPeriodStates: Array<{ periodId: string; status: "open" | "sealed"; revision: number }>;
  };
  private replaceFailure?: (
    previous: GameEconomySession,
    next: GameEconomySession
  ) => boolean;

  constructor(input: { rules?: GameEconomyRule[]; sessions?: GameEconomySession[] } = {}) {
    this.state = clone({
      rules: input.rules ?? [testGameEconomyRule()],
      sessions: input.sessions ?? [],
      rewardPeriodStates: [],
    });
  }

  snapshot() {
    return clone(this.state);
  }

  restore(snapshot: typeof this.state) {
    this.state = clone(snapshot);
  }

  failNextReplaceWhen(
    predicate: (
      previous: GameEconomySession,
      next: GameEconomySession
    ) => boolean
  ) {
    this.replaceFailure = predicate;
  }

  async findActiveRule(gameId: string, at: Date, expectedVersion?: string) {
    const matches = this.state.rules
      .filter(
        (rule) =>
          rule.gameId === gameId &&
          rule.active &&
          rule.activeFrom.getTime() <= at.getTime() &&
          (!rule.activeUntil || rule.activeUntil.getTime() > at.getTime())
      )
      .sort(
        (left, right) =>
          right.activeFrom.getTime() - left.activeFrom.getTime() ||
          compareText(left._id, right._id)
      );
    if (matches.length > 1) {
      throw new DomainConflictError(
        `Hay reglas activas solapadas para ${gameId}.`
      );
    }
    if (expectedVersion && matches[0]?.version !== expectedVersion) return null;
    return matches[0] ? clone(matches[0]) : null;
  }

  async findRuleVersion(gameId: string, version: string) {
    const rule = this.state.rules.find(
      (item) => item.gameId === gameId && item.version === version
    );
    return rule ? clone(rule) : null;
  }

  async findSession(sessionId: string) {
    const session = this.state.sessions.find((item) => item._id === sessionId);
    return session ? clone(session) : null;
  }

  async findSessionByCreateIdempotencyKey(idempotencyKey: string) {
    const session = this.state.sessions.find(
      (item) => item.createCommand.idempotencyKey === idempotencyKey
    );
    return session ? clone(session) : null;
  }

  async insertSession(session: GameEconomySession) {
    if (
      this.state.sessions.some(
        (item) =>
          item._id === session._id ||
          item.createCommand.idempotencyKey ===
            session.createCommand.idempotencyKey
      )
    ) {
      throw Object.assign(new Error("duplicate"), { code: 11000 });
    }
    this.state.sessions.push(clone(session));
  }

  async advanceRewardPeriodGuard(periodId: string) {
    const state = this.state.rewardPeriodStates.find((item) => item.periodId === periodId);
    if (state?.status === "sealed") {
      throw new DomainConflictError(`El periodo rewards ${periodId} ya esta sellado.`);
    }
    if (!state) {
      this.state.rewardPeriodStates.push({ periodId, status: "open", revision: 0 });
      return;
    }
    state.revision += 1;
  }

  async replaceSession(
    previous: GameEconomySession,
    next: GameEconomySession
  ) {
    if (this.replaceFailure?.(previous, next)) {
      this.replaceFailure = undefined;
      return null;
    }
    const index = this.state.sessions.findIndex(
      (item) =>
        item._id === previous._id &&
        item.revision === previous.revision &&
        item.fenceToken === previous.fenceToken &&
        item.status === previous.status
    );
    if (index < 0) return null;
    if (
      next.validation?.evidenceId &&
      this.state.sessions.some(
        (item, candidateIndex) =>
          candidateIndex !== index &&
          item.validation?.evidenceId === next.validation?.evidenceId
      )
    ) {
      throw Object.assign(new Error("duplicate evidence"), { code: 11000 });
    }
    this.state.sessions[index] = clone(next);
    return clone(next);
  }

  async listExpiredSessions(now: Date, limit: number) {
    const nonTerminal = new Set<GameEconomySessionStatus>([
      "created",
      "resources_reserved",
      "started",
      "submitted",
      "validated",
    ]);
    return clone(
      this.state.sessions
        .filter(
          (item) =>
            nonTerminal.has(item.status) &&
            item.expiresAt.getTime() <= now.getTime()
        )
        .sort(
          (left, right) =>
            left.expiresAt.getTime() - right.expiresAt.getTime() ||
            compareText(left._id, right._id)
        )
        .slice(0, limit)
    );
  }

  async listRecoverableSessions(now: Date, limit: number) {
    return clone(
      this.state.sessions
        .filter((item) => (
          item.status === "created"
          || Boolean(item.settlementIntent && !item.settlementCommand)
          || Boolean(item.terminalIntent && !item.terminal)
          || Boolean(
            item.status === "submitted"
            && item.operation
            && item.operation.leaseExpiresAt.getTime() <= now.getTime()
          )
        ))
        .sort((left, right) => (
          left.updatedAt.getTime() - right.updatedAt.getTime()
          || compareText(left._id, right._id)
        ))
        .slice(0, limit),
    );
  }
}

export function createMemoryGameEconomyRunner(
  repository: MemoryGameEconomyRepository
): GameEconomyTransactionRunner {
  let queue: Promise<void> = Promise.resolve();
  return (work) => {
    const execution = queue.then(async () => {
      const snapshot = repository.snapshot();
      try {
        return await work(repository);
      } catch (error) {
        repository.restore(snapshot);
        throw error;
      }
    });
    queue = execution.then(
      () => undefined,
      () => undefined
    );
    return execution;
  };
}

type ResourceKind = "credit" | "cukie";
type PortAction = "reserve" | "consume" | "release";

export class MemoryGameResourcePorts {
  readonly calls: Array<{
    resource: ResourceKind;
    action: PortAction;
    idempotencyKey: string;
  }> = [];
  readonly reservations = new Map<string, GameResourceReservationResult>();
  readonly consumed = new Set<string>();
  readonly released = new Set<string>();
  readonly terminalOutcomes = new Map<string, "consumed" | "released">();
  readonly requestHashes = new Map<string, string>();
  readonly fences = new Map<string, number>();
  readonly failNext = new Map<string, Error>();

  fail(resource: ResourceKind, action: PortAction, error = new Error("port failure")) {
    this.failNext.set(`${resource}:${action}`, error);
  }

  private maybeFail(resource: ResourceKind, action: PortAction) {
    const key = `${resource}:${action}`;
    const error = this.failNext.get(key);
    if (error) {
      this.failNext.delete(key);
      throw error;
    }
  }

  private async reserve(
    resource: ResourceKind,
    input: { idempotencyKey: string; requestHash: string; fenceToken: number }
  ) {
    this.calls.push({ resource, action: "reserve", idempotencyKey: input.idempotencyKey });
    this.maybeFail(resource, "reserve");
    const previousHash = this.requestHashes.get(input.idempotencyKey);
    if (previousHash && previousHash !== input.requestHash) {
      throw new DomainConflictError("Reserva reutilizada con otro requestHash.");
    }
    const previousFence = this.fences.get(input.idempotencyKey) ?? -1;
    if (input.fenceToken < previousFence) {
      throw new DomainConflictError("Fence externo obsoleto.");
    }
    this.requestHashes.set(input.idempotencyKey, input.requestHash);
    this.fences.set(input.idempotencyKey, input.fenceToken);
    const existing = this.reservations.get(input.idempotencyKey);
    if (existing) return clone(existing);
    const result = {
      reservationId: `${resource}:${stableGameEconomyHash(input.idempotencyKey)}`,
      evidenceHash: stableGameEconomyHash({ resource, key: input.idempotencyKey }),
    };
    this.reservations.set(input.idempotencyKey, result);
    return clone(result);
  }

  private async finish(
    resource: ResourceKind,
    action: "consume" | "release",
    input: {
      idempotencyKey: string;
      reservationId: string | null;
      reservationIdempotencyKey: string;
      fenceToken: number;
      expectedOutcome: "consumed" | "released";
    }
  ) {
    this.calls.push({ resource, action, idempotencyKey: input.idempotencyKey });
    this.maybeFail(resource, action);
    const expectedOutcome = action === "consume" ? "consumed" : "released";
    if (input.expectedOutcome !== expectedOutcome) {
      throw new DomainConflictError("Outcome externo incoherente.");
    }
    const previousFence = this.fences.get(input.reservationIdempotencyKey) ?? -1;
    if (input.fenceToken < previousFence) {
      throw new DomainConflictError("Fence externo obsoleto.");
    }
    this.fences.set(input.reservationIdempotencyKey, input.fenceToken);
    const reservation = this.reservations.get(
      input.reservationIdempotencyKey
    ) ?? null;
    if (
      input.reservationId &&
      reservation?.reservationId !== input.reservationId
    ) {
      throw new DomainConflictError("reservationId externo no coincide.");
    }
    if (!reservation) {
      if (action === "consume") {
        throw new DomainConflictError("No existe reserva para consumir.");
      }
      return { outcome: expectedOutcome, reservation: null } as const;
    }
    const previousOutcome = this.terminalOutcomes.get(
      reservation.reservationId
    );
    if (previousOutcome && previousOutcome !== expectedOutcome) {
      throw new DomainConflictError(
        `La reserva ya termino como ${previousOutcome}.`
      );
    }
    this.terminalOutcomes.set(reservation.reservationId, expectedOutcome);
    (action === "consume" ? this.consumed : this.released).add(
      reservation.reservationId
    );
    return { outcome: expectedOutcome, reservation: clone(reservation) } as const;
  }

  creditPort(): GameCreditResourcePort {
    return {
      reserve: (input) => this.reserve("credit", input),
      consume: (input) => this.finish("credit", "consume", input),
      release: (input) => this.finish("credit", "release", input),
    };
  }

  cukiePort(): GameCukieResourcePort {
    return {
      reserve: (input) => this.reserve("cukie", input),
      consume: (input) => this.finish("cukie", "consume", input),
      release: (input) => this.finish("cukie", "release", input),
    };
  }
}

export class MemoryGameEvidencePort implements GameResultEvidencePort {
  result: VerifiedGameResult = {
    authorization: "server_authorized",
    evidenceId: "evidence-1",
    evidenceHash: "e".repeat(64),
    scoreRaw: "500",
  };
  error: Error | null = null;
  calls = 0;

  async verify() {
    this.calls += 1;
    if (this.error) throw this.error;
    return clone(this.result);
  }
}

export function createMemoryGameEconomyPorts(input: {
  resources?: MemoryGameResourcePorts;
  evidence?: MemoryGameEvidencePort;
} = {}): GameEconomyPorts & {
  resources: MemoryGameResourcePorts;
  evidence: MemoryGameEvidencePort;
} {
  const resources = input.resources ?? new MemoryGameResourcePorts();
  const evidence = input.evidence ?? new MemoryGameEvidencePort();
  return {
    credits: resources.creditPort(),
    cukies: resources.cukiePort(),
    evidence,
    resources,
  };
}
