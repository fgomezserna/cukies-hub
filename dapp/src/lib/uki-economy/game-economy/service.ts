import "server-only";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  StaleFenceError,
} from "../errors";
import { getIsoWeekPeriodId } from "../periods";
import type {
  GameCukieResourcePort,
  GameCreditResourcePort,
  GameEconomyPorts,
  GameResourceReservationResult,
} from "./ports";
import {
  assertGameEconomyRuleSnapshot,
  assertGameSessionIntegrity,
  buildGameCreateRequestHash,
  buildGameResourceReservationRequestHash,
  buildGameResourceReservationResultHash,
  buildGameSettlementRequestHash,
  buildGameStartRequestHash,
  buildGameSubmissionRequestHash,
  buildGameTerminalRequestHash,
  buildGameValidationRequestHash,
  buildGameValidationResultHash,
  calculateGameScore,
  canonicalCukieAssetIds,
  compareText,
  gameSessionId,
  stableGameEconomyHash,
  toGameRuleSnapshot,
  validGameDate,
  validGameText,
  validGameWallet,
} from "./rules";
import {
  mapGameEconomyPersistenceError,
  mongoGameEconomyTransactionRunner,
  type GameEconomyRepository,
  type GameEconomyTransactionRunner,
} from "./repository";
import type {
  GameEconomyCommandReceipt,
  GameEconomyOperationKind,
  GameEconomyResource,
  GameEconomyResourceKind,
  GameEconomySession,
  GameEconomySessionStatus,
  GameEconomyTerminal,
} from "./types";

const TERMINAL_STATUSES = new Set<GameEconomySessionStatus>([
  "settled",
  "expired",
  "rejected",
]);

export type CreateGameSessionInput = {
  walletAddress: string;
  gameId: string;
  cukieAssetIds: string[];
  expectedRuleVersion?: string;
  idempotencyKey: string;
  now: Date;
};

export type StartGameSessionInput = {
  sessionId: string;
  walletAddress: string;
  idempotencyKey: string;
  expectedRevision: number;
  now: Date;
};

export type SubmitGameResultInput = StartGameSessionInput & {
  evidenceReference: string;
  payloadHash: string;
};

export type ValidateGameResultInput = {
  sessionId: string;
  idempotencyKey: string;
  expectedRevision: number;
  now: Date;
};

export type SettleGameSessionInput = ValidateGameResultInput;

export type RejectGameSessionInput = ValidateGameResultInput & {
  reasonCode: string;
};

export type ExpireGameSessionInput = {
  sessionId: string;
  idempotencyKey: string;
  expectedRevision?: number;
  now: Date;
};

export type ExpireGameSessionsBatchInput = {
  now: Date;
  limit?: number;
};

export type RecoverGameSessionsBatchInput = ExpireGameSessionsBatchInput;

function validRevision(value: unknown, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new DomainValidationError(
      "expectedRevision debe ser un entero no negativo."
    );
  }
  return value;
}

function validHash(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser un SHA-256 canonico.`);
  }
  return value;
}

function preliminarilyCanonicalAssetIds(values: unknown) {
  if (!Array.isArray(values)) {
    throw new DomainValidationError("cukieAssetIds debe ser una lista.");
  }
  const result = values.map((value, index) =>
    validGameText(value, `cukieAssetIds.${index}`)
  );
  if (new Set(result).size !== result.length) {
    throw new DomainValidationError("cukieAssetIds contiene duplicados.");
  }
  return result.sort(compareText);
}

function commandReceipt(
  idempotencyKey: string,
  requestHash: string,
  completedAt: Date,
  resultingRevision: number
): GameEconomyCommandReceipt {
  return {
    idempotencyKey,
    requestHash,
    completedAt,
    resultingRevision,
  };
}

function assertCommandReplay(
  command: GameEconomyCommandReceipt,
  idempotencyKey: string,
  requestHash: string
) {
  if (
    command.idempotencyKey !== idempotencyKey ||
    command.requestHash !== requestHash
  ) {
    throw new DomainConflictError(
      "La clave de idempotencia ya se utilizo con otro payload."
    );
  }
}

function initialResource(
  kind: GameEconomyResourceKind,
  required: boolean,
  sessionId: string,
  reservationRequestHash: string,
  now: Date
): GameEconomyResource {
  return {
    kind,
    state: required ? "pending" : "not_required",
    reservationId: null,
    evidenceHash: null,
    operationIdempotencyKey: `${sessionId}:${kind}`,
    reservationRequestHash,
    reservationResultHash: null,
    updatedAt: now,
  };
}

function resourceFor(
  session: GameEconomySession,
  kind: GameEconomyResourceKind
) {
  return kind === "credit" ? session.credit : session.cukie;
}

function withResource(
  session: GameEconomySession,
  kind: GameEconomyResourceKind,
  resource: GameEconomyResource
) {
  return kind === "credit"
    ? { ...session, credit: resource }
    : { ...session, cukie: resource };
}

function validReservationResult(
  result: GameResourceReservationResult,
  kind: GameEconomyResourceKind
) {
  const reservationId = validGameText(
    result?.reservationId,
    `${kind}.reservationId`
  );
  const evidenceHash = validHash(result?.evidenceHash, `${kind}.evidenceHash`);
  return { reservationId, evidenceHash };
}

function operationOwner(
  kind: GameEconomyOperationKind,
  idempotencyKey: string,
  requestHash: string
) {
  return `${kind}:${stableGameEconomyHash({ idempotencyKey, requestHash })}`;
}

function sessionExpired(session: GameEconomySession, now: Date) {
  return now.getTime() >= session.expiresAt.getTime();
}

async function loadBoundSession(
  repository: GameEconomyRepository,
  sessionId: string,
  allowRuleDriftForCleanup = false
) {
  const session = await repository.findSession(sessionId);
  if (!session) {
    throw new DomainNotFoundError(`No existe la sesion ${sessionId}.`);
  }
  assertGameSessionIntegrity(session);
  const persistedRule = await repository.findRuleVersion(
    session.gameId,
    session.rule.version
  );
  if (
    !persistedRule ||
    persistedRule.configHash !== session.rule.configHash ||
    stableGameEconomyHash(persistedRule.credit) !==
      stableGameEconomyHash(session.rule.credit) ||
    stableGameEconomyHash(persistedRule.reward) !==
      stableGameEconomyHash(session.rule.reward) ||
    stableGameEconomyHash(persistedRule.cukie) !==
      stableGameEconomyHash(session.rule.cukie) ||
    stableGameEconomyHash(persistedRule.calculation) !==
      stableGameEconomyHash(session.rule.calculation)
  ) {
    if (allowRuleDriftForCleanup) return session;
    throw new DomainConflictError(
      `La configuracion ligada a ${session.sessionId} no esta disponible o ha cambiado.`
    );
  }
  return session;
}

async function replaceOrThrow(
  repository: GameEconomyRepository,
  previous: GameEconomySession,
  next: GameEconomySession
) {
  assertGameSessionIntegrity(next);
  let replaced: GameEconomySession | null;
  try {
    replaced = await repository.replaceSession(previous, next);
  } catch (error) {
    throw mapGameEconomyPersistenceError(error);
  }
  if (!replaced) {
    throw new StaleFenceError(
      `La sesion ${previous.sessionId} cambio durante la operacion.`
    );
  }
  return replaced;
}

export function createGameEconomyService(
  runner: GameEconomyTransactionRunner,
  ports: GameEconomyPorts
) {
  async function claimOperation(input: {
    sessionId: string;
    kind: GameEconomyOperationKind;
    owner: string;
    allowedStatuses: GameEconomySessionStatus[];
    expectedRevision?: number;
    allowRuleDriftForCleanup?: boolean;
    decision?:
      | {
          kind: "settle";
          idempotencyKey: string;
          requestHash: string;
        }
      | {
          kind: "terminal";
          status: "expired" | "rejected";
          reasonCode: string;
          idempotencyKey: string;
          requestHash: string;
        };
    now: Date;
  }) {
    return runner(async (repository) => {
      const current = await loadBoundSession(
        repository,
        input.sessionId,
        input.allowRuleDriftForCleanup
      );
      if (!input.allowedStatuses.includes(current.status)) {
        throw new DomainConflictError(
          `No se puede ejecutar ${input.kind} desde ${current.status}.`
        );
      }
      let decisionAlreadyPersisted = false;
      let decisionPatch: Partial<GameEconomySession> = {};
      if (input.decision?.kind === "settle") {
        if (current.terminalIntent) {
          throw new DomainConflictError(
            `La sesion ya decidio ${current.terminalIntent.status}.`
          );
        }
        if (current.settlementIntent) {
          if (
            current.settlementIntent.idempotencyKey !==
              input.decision.idempotencyKey ||
            current.settlementIntent.requestHash !== input.decision.requestHash
          ) {
            throw new DomainConflictError(
              "La liquidacion ya fue iniciada por otra solicitud."
            );
          }
          decisionAlreadyPersisted = true;
        } else {
          decisionPatch = {
            settlementIntent: {
              idempotencyKey: input.decision.idempotencyKey,
              requestHash: input.decision.requestHash,
              decidedAt: input.now,
            },
          };
        }
      }
      if (input.decision?.kind === "terminal") {
        if (current.settlementIntent) {
          throw new DomainConflictError(
            "La liquidacion ya comenzo y es la unica decision terminal permitida."
          );
        }
        if (current.terminalIntent) {
          if (
            current.terminalIntent.idempotencyKey !==
              input.decision.idempotencyKey ||
            current.terminalIntent.requestHash !== input.decision.requestHash ||
            current.terminalIntent.status !== input.decision.status ||
            current.terminalIntent.reasonCode !== input.decision.reasonCode
          ) {
            throw new DomainConflictError(
              "La sesion ya tiene otra decision terminal."
            );
          }
          decisionAlreadyPersisted = true;
        } else {
          decisionPatch = {
            terminalIntent: {
              status: input.decision.status,
              reasonCode: input.decision.reasonCode,
              idempotencyKey: input.decision.idempotencyKey,
              requestHash: input.decision.requestHash,
              decidedAt: input.now,
            },
          };
        }
      }
      if (
        current.operation?.kind === input.kind &&
        current.operation.owner === input.owner &&
        current.operation.leaseExpiresAt.getTime() > input.now.getTime() &&
        (input.decision === undefined || decisionAlreadyPersisted)
      ) {
        return current;
      }
      const reclaimsSameIdempotentOperation =
        current.operation?.kind === input.kind &&
        current.operation.owner === input.owner;
      if (
        input.expectedRevision !== undefined &&
        current.revision !== input.expectedRevision &&
        !reclaimsSameIdempotentOperation &&
        !decisionAlreadyPersisted
      ) {
        throw new StaleFenceError(
          `Revision esperada ${input.expectedRevision}; actual ${current.revision}.`
        );
      }
      if (
        current.operation &&
        current.operation.leaseExpiresAt.getTime() > input.now.getTime()
      ) {
        throw new DomainConflictError(
          `La sesion tiene ${current.operation.kind} en curso.`
        );
      }
      const fenceToken = current.fenceToken + 1;
      const next: GameEconomySession = {
        ...current,
        ...decisionPatch,
        operation: {
          kind: input.kind,
          owner: input.owner,
          fenceToken,
          acquiredAt: input.now,
          leaseExpiresAt: new Date(
            input.now.getTime() + current.rule.operationLeaseMs
          ),
        },
        fenceToken,
        revision: current.revision + 1,
        updatedAt: input.now,
      };
      if (input.decision?.kind === "settle") {
        await repository.advanceRewardPeriodGuard(
          getIsoWeekPeriodId(current.settlementIntent?.decidedAt ?? input.now),
          input.now,
        );
      }
      return replaceOrThrow(repository, current, next);
    });
  }

  async function persistFenced(
    sessionId: string,
    fenceToken: number,
    kind: GameEconomyOperationKind,
    owner: string,
    now: Date,
    mutate: (session: GameEconomySession) => GameEconomySession,
    allowRuleDriftForCleanup = false,
    beforeReplace?: (repository: GameEconomyRepository) => Promise<void>,
  ) {
    return runner(async (repository) => {
      const current = await loadBoundSession(
        repository,
        sessionId,
        allowRuleDriftForCleanup
      );
      if (
        !current.operation ||
        current.operation.fenceToken !== fenceToken ||
        current.operation.kind !== kind ||
        current.operation.owner !== owner
      ) {
        throw new StaleFenceError(`Fence obsoleto para ${sessionId}.`);
      }
      const mutated = mutate(current);
      const next: GameEconomySession = {
        ...mutated,
        revision: current.revision + 1,
        updatedAt: now,
      };
      if (beforeReplace) await beforeReplace(repository);
      return replaceOrThrow(repository, current, next);
    });
  }

  async function reserveOne(
    session: GameEconomySession,
    operationKind: "reserve",
    owner: string,
    kind: GameEconomyResourceKind,
    now: Date
  ) {
    const resource = resourceFor(session, kind);
    if (resource.state === "active" || resource.state === "not_required") {
      return session;
    }
    if (resource.state !== "pending") {
      throw new DomainConflictError(
        `No se puede reservar ${kind} desde ${resource.state}.`
      );
    }
    const result =
      kind === "credit"
        ? await ports.credits.reserve({
            sessionId: session.sessionId,
            walletNormalized: session.walletNormalized,
            gameId: session.gameId,
            costCode: session.rule.credit.costCode,
            creditRuleVersion: session.rule.credit.creditRuleVersion,
            creditRuleConfigHash: session.rule.credit.creditRuleConfigHash,
            idempotencyKey: `${resource.operationIdempotencyKey}:reserve`,
            requestHash: resource.reservationRequestHash,
            fenceToken: session.operation!.fenceToken,
            expiresAt: session.expiresAt,
          })
        : await ports.cukies.reserve({
            sessionId: session.sessionId,
            walletNormalized: session.walletNormalized,
            gameId: session.gameId,
            role: session.rule.cukie.role,
            selectionPolicy: session.rule.cukie.selectionPolicy,
            assetIds: [...session.cukieAssetIds],
            idempotencyKey: `${resource.operationIdempotencyKey}:reserve`,
            requestHash: resource.reservationRequestHash,
            fenceToken: session.operation!.fenceToken,
            expiresAt: session.expiresAt,
          });
    const verified = validReservationResult(result, kind);
    return persistFenced(
      session.sessionId,
      session.operation!.fenceToken,
      operationKind,
      owner,
      now,
      (current) => {
        const latest = resourceFor(current, kind);
        if (latest.state === "active") {
          if (
            latest.reservationId !== verified.reservationId ||
            latest.evidenceHash !== verified.evidenceHash
          ) {
            throw new DomainConflictError(
              `La reserva idempotente de ${kind} devolvio otra identidad.`
            );
          }
          return current;
        }
        if (latest.state !== "pending") {
          throw new DomainConflictError(
            `El recurso ${kind} cambio durante la reserva.`
          );
        }
        return withResource(current, kind, {
          ...latest,
          state: "active",
          reservationId: verified.reservationId,
          evidenceHash: verified.evidenceHash,
          reservationResultHash: buildGameResourceReservationResultHash({
            requestHash: latest.reservationRequestHash,
            reservationId: verified.reservationId,
            evidenceHash: verified.evidenceHash,
          }),
          updatedAt: now,
        });
      }
    );
  }

  function finishPort(kind: GameEconomyResourceKind) {
    return kind === "credit" ? ports.credits : ports.cukies;
  }

  async function finishOne(input: {
    session: GameEconomySession;
    operationKind: "compensate" | "settle" | "release";
    owner: string;
    kind: GameEconomyResourceKind;
    action: "consume" | "release";
    now: Date;
  }) {
    const resource = resourceFor(input.session, input.kind);
    const targetState = input.action === "consume" ? "consumed" : "released";
    if (resource.state === targetState || resource.state === "not_required") {
      return input.session;
    }
    const canResolveUnpersistedReservation =
      resource.state === "pending" && input.action === "release";
    if (
      !canResolveUnpersistedReservation &&
      (resource.state !== "active" || !resource.reservationId)
    ) {
      throw new DomainConflictError(
        `No se puede ${input.action} ${input.kind} desde ${resource.state}.`
      );
    }
    const port: GameCreditResourcePort | GameCukieResourcePort = finishPort(
      input.kind
    );
    const finished = await port[input.action]({
      sessionId: input.session.sessionId,
      reservationId: resource.reservationId,
      reservationIdempotencyKey: `${resource.operationIdempotencyKey}:reserve`,
      idempotencyKey: `${resource.operationIdempotencyKey}:${input.action}`,
      fenceToken: input.session.operation!.fenceToken,
      expectedOutcome: targetState,
      committedAt:
        input.operationKind === "settle"
          ? input.session.settlementIntent?.decidedAt
          : undefined,
      now: input.now,
    });
    if (!finished || finished.outcome !== targetState) {
      throw new DomainConflictError(
        `El puerto de ${input.kind} no confirmo ${targetState}.`
      );
    }
    const resolvedReservation = finished.reservation
      ? validReservationResult(finished.reservation, input.kind)
      : null;
    if (
      resource.state === "active" &&
      (!resolvedReservation ||
        resolvedReservation.reservationId !== resource.reservationId ||
        resolvedReservation.evidenceHash !== resource.evidenceHash)
    ) {
      throw new DomainConflictError(
        `El outcome de ${input.kind} no corresponde a su reserva.`
      );
    }
    return persistFenced(
      input.session.sessionId,
      input.session.operation!.fenceToken,
      input.operationKind,
      input.owner,
      input.now,
      (current) => {
        const latest = resourceFor(current, input.kind);
        if (latest.state === targetState) return current;
        if (
          latest.state !== resource.state ||
          latest.reservationId !== resource.reservationId
        ) {
          throw new DomainConflictError(
            `${input.kind} cambio durante ${input.action}.`
          );
        }
        return withResource(current, input.kind, {
          ...latest,
          state: targetState,
          reservationId:
            latest.reservationId ?? resolvedReservation?.reservationId ?? null,
          evidenceHash:
            latest.evidenceHash ?? resolvedReservation?.evidenceHash ?? null,
          reservationResultHash: resolvedReservation
            ? buildGameResourceReservationResultHash({
                requestHash: latest.reservationRequestHash,
                reservationId: resolvedReservation.reservationId,
                evidenceHash: resolvedReservation.evidenceHash,
              })
            : latest.reservationResultHash,
          updatedAt: input.now,
        });
      },
      input.operationKind !== "settle" || Boolean(input.session.settlementIntent)
    );
  }

  async function switchToCompensation(
    session: GameEconomySession,
    reserveOwner: string,
    compensationOwner: string,
    now: Date
  ) {
    return persistFenced(
      session.sessionId,
      session.operation!.fenceToken,
      "reserve",
      reserveOwner,
      now,
      (current) => ({
        ...current,
        reservationPhase: "compensating",
        fenceToken: current.fenceToken + 1,
        operation: {
          kind: "compensate",
          owner: compensationOwner,
          fenceToken: current.fenceToken + 1,
          acquiredAt: now,
          leaseExpiresAt: new Date(
            now.getTime() + current.rule.operationLeaseMs
          ),
        },
      }),
      true
    );
  }

  async function compensateReservation(
    session: GameEconomySession,
    owner: string,
    now: Date
  ) {
    let current = session;
    if (
      current.operation?.kind !== "compensate" ||
      current.operation.owner !== owner ||
      current.operation.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      current = await claimOperation({
        sessionId: current.sessionId,
        kind: "compensate",
        owner,
        allowedStatuses: ["created"],
        allowRuleDriftForCleanup: true,
        now,
      });
    }
    current = await finishOne({
      session: current,
      operationKind: "compensate",
      owner,
      kind: "credit",
      action: "release",
      now,
    });
    current = await finishOne({
      session: current,
      operationKind: "compensate",
      owner,
      kind: "cukie",
      action: "release",
      now,
    });
    return persistFenced(
      current.sessionId,
      current.operation!.fenceToken,
      "compensate",
      owner,
      now,
      (latest) => {
        const compensationKey = `compensate:${stableGameEconomyHash({
          createIdempotencyKey: latest.createCommand.idempotencyKey,
        })}`;
        const compensationRequestHash = buildGameTerminalRequestHash({
          sessionId: latest.sessionId,
          status: "rejected",
          reasonCode: "resource_reservation_failed",
        });
        return {
          ...latest,
          status: "rejected",
          operation: undefined,
          terminalIntent: {
            status: "rejected",
            reasonCode: "resource_reservation_failed",
            idempotencyKey: compensationKey,
            requestHash: compensationRequestHash,
            decidedAt: now,
          },
          terminal: {
            reasonCode: "resource_reservation_failed",
            terminalAt: now,
            command: commandReceipt(
              compensationKey,
              compensationRequestHash,
              now,
              latest.revision + 1
            ),
          },
        };
      },
      true,
    );
  }

  async function driveReservation(
    initial: GameEconomySession,
    now: Date
  ) {
    if (initial.status !== "created") return initial;
    const reserveRequestHash = stableGameEconomyHash({
      sessionId: initial.sessionId,
      ruleConfigHash: initial.rule.configHash,
    });
    const reserveOwner = operationOwner(
      "reserve",
      initial.createCommand.idempotencyKey,
      reserveRequestHash
    );
    const compensationOwner = operationOwner(
      "compensate",
      initial.createCommand.idempotencyKey,
      reserveRequestHash
    );
    if (initial.reservationPhase === "compensating") {
      return compensateReservation(initial, compensationOwner, now);
    }
    let current = initial;
    try {
      current = await claimOperation({
        sessionId: initial.sessionId,
        kind: "reserve",
        owner: reserveOwner,
        allowedStatuses: ["created"],
        now,
      });
      current = await reserveOne(current, "reserve", reserveOwner, "credit", now);
      current = await reserveOne(current, "reserve", reserveOwner, "cukie", now);
      return persistFenced(
        current.sessionId,
        current.operation!.fenceToken,
        "reserve",
        reserveOwner,
        now,
        (latest) => ({
          ...latest,
          status: "resources_reserved",
          reservationPhase: "ready",
          operation: undefined,
        })
      );
    } catch (error) {
      try {
        const latest = await runner((repository) =>
          loadBoundSession(repository, initial.sessionId, true)
        );
        if (latest.status === "created") {
          let compensating = latest;
          if (latest.reservationPhase !== "compensating") {
            if (
              latest.operation?.kind === "reserve" &&
              latest.operation.owner === reserveOwner
            ) {
              compensating = await switchToCompensation(
                latest,
                reserveOwner,
                compensationOwner,
                now
              );
            } else {
              const claimedCompensation = await claimOperation({
                sessionId: latest.sessionId,
                kind: "compensate",
                owner: compensationOwner,
                allowedStatuses: ["created"],
                allowRuleDriftForCleanup: true,
                now,
              });
              compensating = await persistFenced(
                claimedCompensation.sessionId,
                claimedCompensation.operation!.fenceToken,
                "compensate",
                compensationOwner,
                now,
                (value) => ({
                  ...value,
                  reservationPhase: "compensating",
                }),
                true
              );
            }
          }
          await compensateReservation(compensating, compensationOwner, now);
        }
      } catch {
        // La sesion conserva phase=compensating y los pasos idempotentes para reanudar.
      }
      throw error;
    }
  }

  async function createSession(input: CreateGameSessionInput) {
    const now = validGameDate(input.now, "now");
    const walletNormalized = validGameWallet(input.walletAddress);
    const gameId = validGameText(input.gameId, "gameId");
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const expectedRuleVersion = input.expectedRuleVersion
      ? validGameText(input.expectedRuleVersion, "expectedRuleVersion")
      : undefined;
    const preliminaryAssets = preliminarilyCanonicalAssetIds(
      input.cukieAssetIds
    );
    const requestHash = buildGameCreateRequestHash({
      walletNormalized,
      gameId,
      cukieAssetIds: preliminaryAssets,
      expectedRuleVersion: expectedRuleVersion ?? null,
    });
    const existing = await runner((repository) =>
      repository.findSessionByCreateIdempotencyKey(idempotencyKey)
    );
    if (existing) {
      assertGameSessionIntegrity(existing);
      assertCommandReplay(existing.createCommand, idempotencyKey, requestHash);
      if (existing.status === "created") {
        return driveReservation(existing, now);
      }
      return existing;
    }

    let created: GameEconomySession;
    try {
      created = await runner(async (repository) => {
        const replay = await repository.findSessionByCreateIdempotencyKey(
          idempotencyKey
        );
        if (replay) {
          assertCommandReplay(replay.createCommand, idempotencyKey, requestHash);
          return replay;
        }
        const rule = await repository.findActiveRule(
          gameId,
          now,
          expectedRuleVersion
        );
        if (!rule) {
          throw new DomainConflictError(
            `No existe una regla activa autorizada para ${gameId}.`
          );
        }
        const snapshot = toGameRuleSnapshot(rule);
        assertGameEconomyRuleSnapshot(snapshot);
        const cukieAssetIds = canonicalCukieAssetIds(
          preliminaryAssets,
          snapshot
        );
        const sessionId = gameSessionId(idempotencyKey, requestHash);
        const expiresAt = new Date(now.getTime() + snapshot.sessionTtlMs);
        const resourceHashInput = {
          sessionId,
          walletNormalized,
          gameId,
          rule: snapshot,
          cukieAssetIds,
          expiresAt,
        };
        const value: GameEconomySession = {
          _id: sessionId,
          sessionId,
          walletNormalized,
          gameId,
          expectedRuleVersion: expectedRuleVersion ?? null,
          status: "created",
          rule: snapshot,
          cukieAssetIds,
          credit: initialResource(
            "credit",
            snapshot.credit.required,
            sessionId,
            buildGameResourceReservationRequestHash({
              kind: "credit",
              ...resourceHashInput,
            }),
            now
          ),
          cukie: initialResource(
            "cukie",
            snapshot.cukie.required,
            sessionId,
            buildGameResourceReservationRequestHash({
              kind: "cukie",
              ...resourceHashInput,
            }),
            now
          ),
          reservationPhase: "reserving",
          createCommand: commandReceipt(
            idempotencyKey,
            requestHash,
            now,
            0
          ),
          revision: 0,
          fenceToken: 0,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        };
        assertGameSessionIntegrity(value);
        await repository.insertSession(value);
        return value;
      });
    } catch (error) {
      const mapped = mapGameEconomyPersistenceError(error);
      if (
        mapped instanceof DomainConflictError &&
        mapped.details?.persistenceFailure === "DUPLICATE_KEY"
      ) {
        const winner = await runner((repository) =>
          repository.findSessionByCreateIdempotencyKey(idempotencyKey)
        );
        if (!winner) throw mapped;
        assertGameSessionIntegrity(winner);
        assertCommandReplay(winner.createCommand, idempotencyKey, requestHash);
        created = winner;
      } else {
        throw mapped;
      }
    }
    if (created.status !== "created") return created;
    return driveReservation(created, now);
  }

  async function startSession(input: StartGameSessionInput) {
    const now = validGameDate(input.now, "now");
    const sessionId = validGameText(input.sessionId, "sessionId");
    const walletNormalized = validGameWallet(input.walletAddress);
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const expectedRevision = validRevision(input.expectedRevision)!;
    const requestHash = buildGameStartRequestHash({
      sessionId,
      walletNormalized,
    });
    return runner(async (repository) => {
      const current = await loadBoundSession(repository, sessionId);
      if (current.startCommand) {
        assertCommandReplay(current.startCommand, idempotencyKey, requestHash);
        return current;
      }
      if (current.walletNormalized !== walletNormalized) {
        throw new DomainNotFoundError(`No existe la sesion ${sessionId}.`);
      }
      if (current.revision !== expectedRevision) {
        throw new StaleFenceError("Revision de inicio obsoleta.");
      }
      if (current.status !== "resources_reserved") {
        throw new DomainConflictError(
          `No se puede iniciar desde ${current.status}.`
        );
      }
      if (sessionExpired(current, now)) {
        throw new DomainConflictError("La sesion ha expirado.");
      }
      const nextRevision = current.revision + 1;
      return replaceOrThrow(repository, current, {
        ...current,
        status: "started",
        startCommand: commandReceipt(
          idempotencyKey,
          requestHash,
          now,
          nextRevision
        ),
        startedAt: now,
        revision: nextRevision,
        updatedAt: now,
      });
    });
  }

  async function submitResult(input: SubmitGameResultInput) {
    const now = validGameDate(input.now, "now");
    const sessionId = validGameText(input.sessionId, "sessionId");
    const walletNormalized = validGameWallet(input.walletAddress);
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const evidenceReference = validGameText(
      input.evidenceReference,
      "evidenceReference"
    );
    const payloadHash = validHash(input.payloadHash, "payloadHash");
    const expectedRevision = validRevision(input.expectedRevision)!;
    const requestHash = buildGameSubmissionRequestHash({
      sessionId,
      walletNormalized,
      evidenceReference,
      payloadHash,
    });
    return runner(async (repository) => {
      const current = await loadBoundSession(repository, sessionId);
      if (current.submission) {
        assertCommandReplay(
          current.submission.command,
          idempotencyKey,
          requestHash
        );
        return current;
      }
      if (current.walletNormalized !== walletNormalized) {
        throw new DomainNotFoundError(`No existe la sesion ${sessionId}.`);
      }
      if (current.revision !== expectedRevision) {
        throw new StaleFenceError("Revision de envio obsoleta.");
      }
      if (current.status !== "started" || !current.startedAt) {
        throw new DomainConflictError(
          `No se puede enviar resultado desde ${current.status}.`
        );
      }
      if (sessionExpired(current, now)) {
        throw new DomainConflictError("La sesion ha expirado.");
      }
      const nextRevision = current.revision + 1;
      return replaceOrThrow(repository, current, {
        ...current,
        status: "submitted",
        submission: {
          evidenceReference,
          payloadHash,
          submittedAt: now,
          command: commandReceipt(
            idempotencyKey,
            requestHash,
            now,
            nextRevision
          ),
        },
        revision: nextRevision,
        updatedAt: now,
      });
    });
  }

  async function validateResult(input: ValidateGameResultInput) {
    const now = validGameDate(input.now, "now");
    const sessionId = validGameText(input.sessionId, "sessionId");
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const expectedRevision = validRevision(input.expectedRevision)!;
    const requestHash = buildGameValidationRequestHash(sessionId);
    const existing = await runner((repository) =>
      loadBoundSession(repository, sessionId)
    );
    if (existing.validation) {
      assertCommandReplay(
        existing.validation.command,
        idempotencyKey,
        requestHash
      );
      return existing;
    }
    if (
      existing.status !== "submitted" ||
      !existing.submission ||
      !existing.startedAt
    ) {
      throw new DomainConflictError(
        `No se puede validar desde ${existing.status}.`
      );
    }
    if (sessionExpired(existing, now)) {
      throw new DomainConflictError("La sesion ha expirado.");
    }
    const owner = operationOwner("validate", idempotencyKey, requestHash);
    const claimed = await claimOperation({
      sessionId,
      kind: "validate",
      owner,
      allowedStatuses: ["submitted"],
      expectedRevision,
      now,
    });
    const verified = await ports.evidence.verify({
      sessionId,
      walletNormalized: claimed.walletNormalized,
      gameId: claimed.gameId,
      ruleVersion: claimed.rule.version,
      ruleConfigHash: claimed.rule.configHash,
      evidenceReference: claimed.submission!.evidenceReference,
      submissionPayloadHash: claimed.submission!.payloadHash,
      startedAt: claimed.startedAt!,
      submittedAt: claimed.submission!.submittedAt,
    });
    if (verified?.authorization !== "server_authorized") {
      throw new DomainConflictError(
        "La evidencia no fue autorizada por el verificador de servidor."
      );
    }
    const evidenceId = validGameText(verified.evidenceId, "evidenceId");
    const evidenceHash = validHash(verified.evidenceHash, "evidenceHash");
    const score = calculateGameScore(claimed.rule.calculation, verified.scoreRaw);
    const resultHash = buildGameValidationResultHash({
      sessionId,
      ruleConfigHash: claimed.rule.configHash,
      submissionEvidenceReference: claimed.submission!.evidenceReference,
      submissionPayloadHash: claimed.submission!.payloadHash,
      evidenceId,
      evidenceHash,
      ...score,
    });
    return persistFenced(
      sessionId,
      claimed.operation!.fenceToken,
      "validate",
      owner,
      now,
      (current) => {
        if (current.validation) {
          assertCommandReplay(
            current.validation.command,
            idempotencyKey,
            requestHash
          );
          return current;
        }
        const nextRevision = current.revision + 1;
        return {
          ...current,
          status: "validated",
          validation: {
            evidenceId,
            evidenceHash,
            ...score,
            resultHash,
            verifiedAt: now,
            verifier: "server_authorized",
            command: commandReceipt(
              idempotencyKey,
              requestHash,
              now,
              nextRevision
            ),
          },
          operation: undefined,
        };
      }
    );
  }

  async function settleSession(input: SettleGameSessionInput) {
    const now = validGameDate(input.now, "now");
    const sessionId = validGameText(input.sessionId, "sessionId");
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const expectedRevision = validRevision(input.expectedRevision)!;
    const requestHash = buildGameSettlementRequestHash(sessionId);
    const existing = await runner((repository) =>
      loadBoundSession(repository, sessionId, true)
    );
    if (existing.settlementCommand) {
      assertCommandReplay(
        existing.settlementCommand,
        idempotencyKey,
        requestHash
      );
      return existing;
    }
    if (!existing.settlementIntent) {
      await runner((repository) => loadBoundSession(repository, sessionId));
    }
    if (existing.status !== "validated" || !existing.validation) {
      throw new DomainConflictError(
        `No se puede liquidar desde ${existing.status}.`
      );
    }
    if (sessionExpired(existing, now) && !existing.settlementIntent) {
      throw new DomainConflictError(
        "La sesion expiro antes de iniciar la liquidacion."
      );
    }
    if (existing.terminalIntent) {
      throw new DomainConflictError(
        `La sesion ya decidio ${existing.terminalIntent.status}.`
      );
    }
    const owner = operationOwner("settle", idempotencyKey, requestHash);
    let current = await claimOperation({
      sessionId,
      kind: "settle",
      owner,
      allowedStatuses: ["validated"],
      expectedRevision,
      allowRuleDriftForCleanup: Boolean(existing.settlementIntent),
      decision: {
        kind: "settle",
        idempotencyKey,
        requestHash,
      },
      now,
    });
    current = await finishOne({
      session: current,
      operationKind: "settle",
      owner,
      kind: "credit",
      action: current.rule.credit.consumeOnSettle ? "consume" : "release",
      now,
    });
    current = await finishOne({
      session: current,
      operationKind: "settle",
      owner,
      kind: "cukie",
      action: current.rule.cukie.consumeOnSettle ? "consume" : "release",
      now,
    });
    return persistFenced(
      sessionId,
      current.operation!.fenceToken,
      "settle",
      owner,
      now,
      (latest) => {
        const nextRevision = latest.revision + 1;
        return {
          ...latest,
          status: "settled",
          settlementCommand: commandReceipt(
            idempotencyKey,
            requestHash,
            now,
            nextRevision
          ),
          settledAt: now,
          operation: undefined,
        };
      },
      true,
      (repository) => repository.advanceRewardPeriodGuard(
        getIsoWeekPeriodId(now),
        now,
      ),
    );
  }

  async function terminalRelease(input: {
    session: GameEconomySession;
    status: "expired" | "rejected";
    reasonCode: string;
    idempotencyKey: string;
    requestHash: string;
    expectedRevision?: number;
    now: Date;
  }) {
    if (input.session.terminal) {
      assertCommandReplay(
        input.session.terminal.command,
        input.idempotencyKey,
        input.requestHash
      );
      return input.session;
    }
    if (input.session.settlementIntent) {
      throw new DomainConflictError(
        "La liquidacion ya comenzo y no puede cambiar a release."
      );
    }
    if (input.session.credit.state === "consumed" || input.session.cukie.state === "consumed") {
      throw new DomainConflictError(
        "La sesion tiene una liquidacion parcial; debe reanudarse settle."
      );
    }
    const owner = operationOwner(
      "release",
      input.idempotencyKey,
      input.requestHash
    );
    let current = await claimOperation({
      sessionId: input.session.sessionId,
      kind: "release",
      owner,
      allowedStatuses: [
        "created",
        "resources_reserved",
        "started",
        "submitted",
        "validated",
      ],
      expectedRevision: input.expectedRevision,
      allowRuleDriftForCleanup: true,
      decision: {
        kind: "terminal",
        status: input.status,
        reasonCode: input.reasonCode,
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
      },
      now: input.now,
    });
    current = await finishOne({
      session: current,
      operationKind: "release",
      owner,
      kind: "credit",
      action: "release",
      now: input.now,
    });
    current = await finishOne({
      session: current,
      operationKind: "release",
      owner,
      kind: "cukie",
      action: "release",
      now: input.now,
    });
    return persistFenced(
      current.sessionId,
      current.operation!.fenceToken,
      "release",
      owner,
      input.now,
      (latest) => {
        const nextRevision = latest.revision + 1;
        const terminal: GameEconomyTerminal = {
          reasonCode: input.reasonCode,
          terminalAt: input.now,
          command: commandReceipt(
            input.idempotencyKey,
            input.requestHash,
            input.now,
            nextRevision
          ),
        };
        return {
          ...latest,
          status: input.status,
          terminal,
          operation: undefined,
        };
      },
      true
    );
  }

  async function rejectSession(input: RejectGameSessionInput) {
    const now = validGameDate(input.now, "now");
    const sessionId = validGameText(input.sessionId, "sessionId");
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const reasonCode = validGameText(input.reasonCode, "reasonCode");
    const expectedRevision = validRevision(input.expectedRevision)!;
    const requestHash = buildGameTerminalRequestHash({
      sessionId,
      status: "rejected",
      reasonCode,
    });
    const current = await runner((repository) =>
      loadBoundSession(repository, sessionId, true)
    );
    if (TERMINAL_STATUSES.has(current.status) && !current.terminal) {
      throw new DomainConflictError(`La sesion ya termino como ${current.status}.`);
    }
    return terminalRelease({
      session: current,
      status: "rejected",
      reasonCode,
      idempotencyKey,
      requestHash,
      expectedRevision,
      now,
    });
  }

  async function expireSession(input: ExpireGameSessionInput) {
    const now = validGameDate(input.now, "now");
    const sessionId = validGameText(input.sessionId, "sessionId");
    const idempotencyKey = validGameText(
      input.idempotencyKey,
      "idempotencyKey"
    );
    const expectedRevision = validRevision(input.expectedRevision, true);
    const requestHash = buildGameTerminalRequestHash({
      sessionId,
      status: "expired",
      reasonCode: "timeout",
    });
    const current = await runner((repository) =>
      loadBoundSession(repository, sessionId, true)
    );
    if (current.terminal) {
      assertCommandReplay(current.terminal.command, idempotencyKey, requestHash);
      return current;
    }
    if (!sessionExpired(current, now)) {
      throw new DomainConflictError("La sesion aun no ha expirado.");
    }
    return terminalRelease({
      session: current,
      status: "expired",
      reasonCode: "timeout",
      idempotencyKey,
      requestHash,
      expectedRevision,
      now,
    });
  }

  async function expireBatch(input: ExpireGameSessionsBatchInput) {
    const now = validGameDate(input.now, "now");
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new DomainValidationError("limit debe estar entre 1 y 100.");
    }
    const candidates = await runner((repository) =>
      repository.listExpiredSessions(now, limit)
    );
    const sessions: GameEconomySession[] = [];
    const failures: Array<{ sessionId: string; code: string }> = [];
    for (const candidate of candidates) {
      try {
        if (candidate.settlementIntent) {
          sessions.push(
            await settleSession({
              sessionId: candidate.sessionId,
              idempotencyKey: candidate.settlementIntent.idempotencyKey,
              expectedRevision: candidate.revision,
              now,
            })
          );
        } else if (candidate.terminalIntent?.status === "rejected") {
          sessions.push(
            await rejectSession({
              sessionId: candidate.sessionId,
              idempotencyKey: candidate.terminalIntent.idempotencyKey,
              reasonCode: candidate.terminalIntent.reasonCode,
              expectedRevision: candidate.revision,
              now,
            })
          );
        } else {
          sessions.push(
            await expireSession({
              sessionId: candidate.sessionId,
              idempotencyKey:
                candidate.terminalIntent?.idempotencyKey ??
                `expire:${candidate.sessionId}`,
              expectedRevision: candidate.revision,
              now,
            })
          );
        }
      } catch (error) {
        failures.push({
          sessionId: candidate.sessionId,
          code:
            error && typeof error === "object" && "code" in error
              ? String(error.code)
              : "EXTERNAL_RESOURCE_FAILURE",
        });
      }
    }
    return { sessions, failures };
  }

  async function recoverBatch(input: RecoverGameSessionsBatchInput) {
    const now = validGameDate(input.now, "now");
    const limit = input.limit ?? 50;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new DomainValidationError("limit debe estar entre 1 y 100.");
    }
    const candidates = await runner((repository) =>
      repository.listRecoverableSessions(now, limit)
    );
    const sessions: GameEconomySession[] = [];
    const failures: Array<{ sessionId: string; code: string }> = [];
    for (const candidate of candidates) {
      try {
        if (candidate.settlementIntent) {
          sessions.push(await settleSession({
            sessionId: candidate.sessionId,
            idempotencyKey: candidate.settlementIntent.idempotencyKey,
            expectedRevision: candidate.revision,
            now,
          }));
        } else if (candidate.terminalIntent?.status === "rejected") {
          sessions.push(await rejectSession({
            sessionId: candidate.sessionId,
            idempotencyKey: candidate.terminalIntent.idempotencyKey,
            reasonCode: candidate.terminalIntent.reasonCode,
            expectedRevision: candidate.revision,
            now,
          }));
        } else if (candidate.terminalIntent?.status === "expired") {
          sessions.push(await expireSession({
            sessionId: candidate.sessionId,
            idempotencyKey: candidate.terminalIntent.idempotencyKey,
            expectedRevision: candidate.revision,
            now,
          }));
        } else if (sessionExpired(candidate, now)) {
          sessions.push(await expireSession({
            sessionId: candidate.sessionId,
            idempotencyKey: `expire:${candidate.sessionId}`,
            expectedRevision: candidate.revision,
            now,
          }));
        } else if (candidate.status === "created") {
          sessions.push(await driveReservation(candidate, now));
        } else if (candidate.status === "submitted") {
          sessions.push(await validateResult({
            sessionId: candidate.sessionId,
            idempotencyKey: `recover:validate:${candidate.sessionId}`,
            expectedRevision: candidate.revision,
            now,
          }));
        }
      } catch (error) {
        failures.push({
          sessionId: candidate.sessionId,
          code: error && typeof error === "object" && "code" in error
            ? String(error.code)
            : "RECOVERY_FAILURE",
        });
      }
    }
    return { sessions, failures };
  }

  return {
    createSession,
    startSession,
    submitResult,
    validateResult,
    settleSession,
    rejectSession,
    expireSession,
    expireBatch,
    recoverBatch,
  };
}

export function createMongoGameEconomyService(ports: GameEconomyPorts) {
  return createGameEconomyService(mongoGameEconomyTransactionRunner, ports);
}
