import "server-only";

import {
  buildNftAssetLockEvent,
  buildNftLockPayloadHash,
  cloneNftAssetLock,
  incrementFencingToken,
  type NftAssetLockDocument,
  type NftAssetLockOperation,
} from "@/lib/nft-inventory/lock-types";

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  StaleFenceError,
} from "../errors";
import {
  mongoOwnCukieTransactionRunner,
  type OwnCukieTransactionContext,
  type OwnCukieTransactionRunner,
} from "./repository";
import {
  assertOwnCukieAssetEligible,
  assertOwnCukieAssignmentIntegrity,
  assertOwnCukieEpochIntegrity,
  cloneOwnCukieAssignment,
  cloneOwnCukieEpoch,
  normalizeOwnCukieWallet,
  ownCukieAssetHasKnownIneligibilitySignals,
  ownCukieAssetHasUnknownEligibilitySignals,
  ownCukieAssignmentId,
  ownCukieEpochId,
  ownCukiePeriodEpochId,
  ownCukieQuota,
  OWN_CUKIE_SELECTION_POLICY,
  requiredOwnCukieText,
  stableOwnCukieHash,
  validOwnCukieDate,
} from "./rules";
import type {
  FinishOwnCukieInput,
  OwnCukieAssignment,
  OwnCukieEpoch,
  OwnCukieEvent,
  OwnCukieEventOperation,
  OwnCukieAvailability,
  OwnCukieQuotaPeriod,
  ReserveOwnCukieInput,
} from "./types";

function canonicalHash(value: unknown, label: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser SHA-256 canonico.`);
  }
  return value;
}

function buildEvent(input: {
  operation: OwnCukieEventOperation;
  idempotencyKey: string;
  requestHash: string;
  epoch: OwnCukieEpoch;
  assignment: OwnCukieAssignment;
  now: Date;
}): OwnCukieEvent {
  const eventId = stableOwnCukieHash({
    kind: "own-cukie-event",
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
  });
  return {
    _id: eventId,
    eventId,
    operation: input.operation,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    sessionId: input.assignment.sessionId,
    epochId: input.epoch.epochId,
    assignmentId: input.assignment.assignmentId,
    resultingEpoch: cloneOwnCukieEpoch(input.epoch),
    resultingAssignment: cloneOwnCukieAssignment(input.assignment),
    createdAt: input.now,
  };
}

function assertEventReplay(
  event: OwnCukieEvent,
  operation: OwnCukieEventOperation,
  requestHash: string,
) {
  if (
    (event.operation !== operation
      && !(event.operation === "invalidate" && event.resultingAssignment.status === "invalidated"))
    || event.requestHash !== requestHash
  ) {
    throw new DomainConflictError(
      `La idempotencyKey ${event.idempotencyKey} ya tiene otro payload.`,
    );
  }
  assertOwnCukieEpochIntegrity(event.resultingEpoch);
  assertOwnCukieAssignmentIntegrity(event.resultingAssignment);
  return cloneOwnCukieAssignment(event.resultingAssignment);
}

function buildInitialEpoch(input: {
  asset: ReturnType<typeof assertOwnCukieAssetEligible>;
  walletNormalized: string;
  quotaPeriod?: OwnCukieQuotaPeriod;
  now: Date;
}) {
  const epochId = input.quotaPeriod
    ? ownCukiePeriodEpochId({
        assetId: input.asset.asset.assetId,
        periodId: input.quotaPeriod.periodId,
        quotaPolicyVersion: input.quotaPeriod.policyVersion,
      })
    : ownCukieEpochId({
        assetId: input.asset.asset.assetId,
        ownerNormalized: input.walletNormalized,
        ownershipEventId: input.asset.asset.ownershipEventId,
      });
  const quota = ownCukieQuota(input.asset.generation, input.asset.rarity);
  return assertOwnCukieEpochIntegrity({
    _id: epochId,
    epochId,
    assetId: input.asset.asset.assetId,
    tokenId: input.asset.asset.tokenId!,
    ownerNormalized: input.walletNormalized,
    ownershipEventId: input.asset.asset.ownershipEventId,
    generation: input.asset.generation,
    rarity: input.asset.rarity,
    gamesQuota: quota,
    gamesRemaining: quota,
    status: "active",
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
    ...(input.quotaPeriod
      ? {
          periodId: input.quotaPeriod.periodId,
          periodStartsAt: new Date(input.quotaPeriod.startsAt),
          periodEndsAt: new Date(input.quotaPeriod.endsAt),
          quotaPolicyVersion: input.quotaPeriod.policyVersion,
        }
      : {}),
  } satisfies OwnCukieEpoch);
}

function periodScopedEpoch(epoch: OwnCukieEpoch) {
  return Boolean(epoch.periodId && epoch.quotaPolicyVersion);
}

async function findQuotaEpoch(
  repository: OwnCukieTransactionContext["repository"],
  epochId: string,
  periodScoped: boolean,
) {
  if (periodScoped && repository.findPeriodEpoch) {
    return repository.findPeriodEpoch(epochId);
  }
  return repository.findEpoch(epochId);
}

async function insertQuotaEpoch(
  repository: OwnCukieTransactionContext["repository"],
  epoch: OwnCukieEpoch,
) {
  if (periodScopedEpoch(epoch) && repository.insertPeriodEpoch) {
    await repository.insertPeriodEpoch(epoch);
    return;
  }
  await repository.insertEpoch(epoch);
}

async function compareAndSetQuotaEpoch(
  repository: OwnCukieTransactionContext["repository"],
  current: OwnCukieEpoch,
  replacement: OwnCukieEpoch,
) {
  if (periodScopedEpoch(current) && repository.compareAndSetPeriodEpoch) {
    return repository.compareAndSetPeriodEpoch(current, replacement);
  }
  return repository.compareAndSetEpoch(current, replacement);
}

function assertQuotaPeriod(input: OwnCukieQuotaPeriod) {
  const periodId = requiredOwnCukieText(input.periodId, "quotaPeriod.periodId");
  const policyVersion = requiredOwnCukieText(input.policyVersion, "quotaPeriod.policyVersion");
  const startsAt = validOwnCukieDate(input.startsAt, "quotaPeriod.startsAt");
  const endsAt = validOwnCukieDate(input.endsAt, "quotaPeriod.endsAt");
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new DomainValidationError("quotaPeriod.endsAt debe ser posterior a startsAt.");
  }
  return { periodId, startsAt, endsAt, policyVersion } satisfies OwnCukieQuotaPeriod;
}

async function assignCandidate(
  context: OwnCukieTransactionContext,
  input: {
    epoch: OwnCukieEpoch;
    asset?: ReturnType<typeof assertOwnCukieAssetEligible>;
    softStakeLockId: string | null;
    sessionId: string;
    walletNormalized: string;
    expiresAt: Date;
    idempotencyKey: string;
    requestHash: string;
    now: Date;
  },
) {
  const { repository, lockRepository, lockService } = context;
  let lock: NftAssetLockDocument;
  const restoreSoftStake = Boolean(input.softStakeLockId);
  if (input.softStakeLockId) {
    const currentLock = await lockRepository.findLockById(input.softStakeLockId);
    if (
      !currentLock
      || currentLock.status !== "active"
      || currentLock.reason !== "soft_stake"
      || currentLock.assetId !== input.epoch.assetId
      || currentLock.ownerNormalized !== input.walletNormalized
    ) {
      throw new DomainConflictError("El soft-stake Cukie Master cambio durante la reserva.");
    }
    lock = await lockService.transitionNftAssetLock({
      lockId: currentLock.lockId,
      expectedFencingToken: currentLock.fencingToken,
      reason: "game_assignment",
      actor: "own-cukie-service",
      idempotencyKey: `own-cukie:assign-soft-stake:${input.idempotencyKey}`,
      transitionReason: "own_cukie_assigned_to_game",
      expiresAt: input.expiresAt,
      sessionId: input.sessionId,
      retainsSoftStakeEntitlement: true,
      now: input.now,
    });
  } else {
    lock = await lockService.acquireNftAssetLock({
      assetId: input.epoch.assetId,
      ownerNormalized: input.walletNormalized,
      reason: "game_assignment",
      createdBy: "own-cukie-service",
      idempotencyKey: `own-cukie:assign-lock:${input.idempotencyKey}`,
      expiresAt: input.expiresAt,
      sessionId: input.sessionId,
      now: input.now,
    });
  }

  const assignedEpochValue: OwnCukieEpoch = {
    ...cloneOwnCukieEpoch(input.epoch),
    ...(input.asset
      ? {
          tokenId: input.asset.asset.tokenId!,
          ownerNormalized: input.walletNormalized,
          ownershipEventId: input.asset.asset.ownershipEventId,
          generation: input.asset.generation,
          rarity: input.asset.rarity,
        }
      : {}),
    status: "assigned",
    gamesRemaining: input.epoch.gamesRemaining - 1,
    assignmentSessionId: input.sessionId,
    assignmentExpiresAt: input.expiresAt,
    revision: input.epoch.revision + 1,
    updatedAt: input.now,
  };
  delete assignedEpochValue.invalidatedAt;
  delete assignedEpochValue.invalidationReason;
  const assignedEpoch = assertOwnCukieEpochIntegrity(assignedEpochValue);
  const persistedEpoch = await compareAndSetQuotaEpoch(repository, input.epoch, assignedEpoch);
  if (!persistedEpoch) throw new StaleFenceError(`CAS obsoleto para ${input.epoch.epochId}.`);

  const assignmentId = ownCukieAssignmentId(input.sessionId);
  const assignment = assertOwnCukieAssignmentIntegrity({
    _id: assignmentId,
    assignmentId,
    sessionId: input.sessionId,
    status: "active",
    epochId: persistedEpoch.epochId,
    assetId: persistedEpoch.assetId,
    tokenId: persistedEpoch.tokenId,
    ownerNormalized: persistedEpoch.ownerNormalized,
    ownershipEventId: persistedEpoch.ownershipEventId,
    generation: persistedEpoch.generation,
    rarity: persistedEpoch.rarity,
    lockId: lock.lockId,
    lockFencingToken: lock.fencingToken,
    restoreSoftStake,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    assignedAt: input.now,
    expiresAt: input.expiresAt,
    revision: 0,
    updatedAt: input.now,
    ...(periodScopedEpoch(persistedEpoch)
      ? {
          periodId: persistedEpoch.periodId,
          periodStartsAt: persistedEpoch.periodStartsAt,
          periodEndsAt: persistedEpoch.periodEndsAt,
          quotaPolicyVersion: persistedEpoch.quotaPolicyVersion,
        }
      : {}),
  });
  await repository.insertAssignment(assignment);
  await repository.insertEvent(buildEvent({
    operation: "assign",
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    epoch: persistedEpoch,
    assignment,
    now: input.now,
  }));
  return cloneOwnCukieAssignment(assignment);
}

function terminalLockPayload(input: {
  assignment: OwnCukieAssignment;
  ownershipMatches: boolean;
  idempotencyKey: string;
  reason: string;
}) {
  const operation: NftAssetLockOperation = input.ownershipMatches
    ? input.assignment.restoreSoftStake ? "transition" : "release"
    : "invalidate_ownership";
  return {
    operation,
    payloadHash: buildNftLockPayloadHash(operation, {
      lockId: input.assignment.lockId,
      expectedFencingToken: input.assignment.lockFencingToken,
      sessionId: input.assignment.sessionId,
      restoreSoftStake: input.assignment.restoreSoftStake,
      ownershipEventId: input.assignment.ownershipEventId,
      reason: input.reason,
    }),
    idempotencyKey: `own-cukie:terminal-lock:${input.idempotencyKey}`,
  };
}

/**
 * GameEconomy owns expiry of game_assignment. This CAS deliberately accepts a
 * lock whose expiresAt already passed, while still fencing the exact lock and
 * recording the canonical lock event in the same transaction.
 */
async function finishAssignmentLock(
  context: OwnCukieTransactionContext,
  input: {
    assignment: OwnCukieAssignment;
    ownershipMatches: boolean;
    idempotencyKey: string;
    reason: string;
    now: Date;
  },
) {
  const operation = terminalLockPayload(input);
  const prior = await context.lockRepository.findEventByIdempotencyKey(operation.idempotencyKey);
  if (prior) {
    if (prior.operation !== operation.operation || prior.payloadHash !== operation.payloadHash) {
      throw new DomainConflictError("El cierre de lock propio ya tiene otro payload.");
    }
    return cloneNftAssetLock(prior.resultingLock);
  }
  const current = await context.lockRepository.findLockById(input.assignment.lockId);
  // El reconciliador canónico de ownership puede ganar el CAS antes que la
  // saga. Aceptamos únicamente su siguiente fence invalidado sobre el mismo
  // lock; nunca lo confundimos con una liberación o una reasignación.
  if (
    !input.ownershipMatches
    && current?.status === "invalidated"
    && current.reason === "game_assignment"
    && current.fencingToken === input.assignment.lockFencingToken + 1
    && current.assetId === input.assignment.assetId
    && current.ownerNormalized === input.assignment.ownerNormalized
  ) {
    return cloneNftAssetLock(current);
  }
  if (
    !current
    || current.status !== "active"
    || current.reason !== "game_assignment"
    || current.fencingToken !== input.assignment.lockFencingToken
    || current.assetId !== input.assignment.assetId
    || current.ownerNormalized !== input.assignment.ownerNormalized
    || current.sessionId !== input.assignment.sessionId
  ) {
    throw new StaleFenceError("El lock del Cukie propio no coincide con la asignacion.");
  }
  const resulting = cloneNftAssetLock(current);
  resulting.fencingToken = incrementFencingToken(current.fencingToken);
  resulting.updatedAt = input.now;
  delete resulting.expiresAt;
  delete resulting.sessionId;
  delete resulting.retainsSoftStakeEntitlement;
  delete resulting.releaseReason;
  if (!input.ownershipMatches) {
    resulting.status = "invalidated";
    resulting.releaseReason = "own_cukie_ownership_drift";
  } else if (input.assignment.restoreSoftStake) {
    resulting.reason = "soft_stake";
  } else {
    resulting.status = "released";
    resulting.releaseReason = input.reason;
  }
  const replaced = await context.lockRepository.compareAndSetActiveLock(
    current.lockId,
    current.fencingToken,
    resulting,
  );
  if (!replaced) throw new StaleFenceError("CAS obsoleto al cerrar el lock propio.");
  const event = buildNftAssetLockEvent({
    operation: operation.operation,
    idempotencyKey: operation.idempotencyKey,
    payloadHash: operation.payloadHash,
    previous: current,
    resulting: replaced,
    actor: "own-cukie-service",
    reason: input.ownershipMatches ? input.reason : "own_cukie_ownership_drift",
    timestamp: input.now,
    ...(!input.ownershipMatches ? { outcome: "invalidated" as const } : {}),
  });
  await context.lockRepository.insertEvent(event);
  await context.lockRepository.enqueueRecalculation({
    idempotencyKey: operation.idempotencyKey,
    walletNormalized: input.assignment.ownerNormalized,
    sourceEventId: event.eventId,
    reason: "own_cukie_terminal_lock",
    availableAt: input.now,
  });
  return replaced;
}

export function createOwnCukieService(runner: OwnCukieTransactionRunner) {
  return {
    async reserve(input: ReserveOwnCukieInput): Promise<OwnCukieAssignment | null> {
      const now = validOwnCukieDate(input.now, "now", new Date());
      const expiresAt = validOwnCukieDate(input.expiresAt, "expiresAt");
      if (expiresAt.getTime() <= now.getTime()) {
        throw new DomainValidationError("expiresAt debe estar en el futuro.");
      }
      const sessionId = requiredOwnCukieText(input.sessionId, "sessionId");
      const walletNormalized = normalizeOwnCukieWallet(input.walletAddress);
      if (input.selectionPolicy !== OWN_CUKIE_SELECTION_POLICY) {
        throw new DomainValidationError("selectionPolicy de Cukie propio no esta soportada.");
      }
      const idempotencyKey = requiredOwnCukieText(input.idempotencyKey, "idempotencyKey");
      const requestHash = canonicalHash(input.requestHash, "requestHash");
      const quotaPeriod = input.quotaPeriod ? assertQuotaPeriod(input.quotaPeriod) : undefined;

      return runner(async (context) => {
        const prior = await context.repository.findEventByIdempotencyKey(idempotencyKey);
        if (prior) return assertEventReplay(prior, "assign", requestHash);
        const byKey = await context.repository.findAssignmentByIdempotencyKey(idempotencyKey);
        const bySession = await context.repository.findAssignmentBySessionId(sessionId);
        const existing = byKey ?? bySession;
        if (existing) {
          if (
            existing.idempotencyKey !== idempotencyKey
            || existing.requestHash !== requestHash
            || existing.sessionId !== sessionId
          ) {
            throw new DomainConflictError("La session ya tiene otra asignacion Cukie propia.");
          }
          return cloneOwnCukieAssignment(assertOwnCukieAssignmentIntegrity(existing));
        }

        const assets = await context.repository.listWalletAssets(walletNormalized, now);
        for (const candidate of assets) {
          let eligible: ReturnType<typeof assertOwnCukieAssetEligible>;
          try {
            eligible = assertOwnCukieAssetEligible(candidate, walletNormalized);
          } catch {
            continue;
          }
          const epochId = quotaPeriod
            ? ownCukiePeriodEpochId({
                assetId: candidate.assetId,
                periodId: quotaPeriod.periodId,
                quotaPolicyVersion: quotaPeriod.policyVersion,
              })
            : ownCukieEpochId({
                assetId: candidate.assetId,
                ownerNormalized: walletNormalized,
                ownershipEventId: candidate.ownershipEventId,
              });
          let epoch = await findQuotaEpoch(context.repository, epochId, Boolean(quotaPeriod));
          if (!epoch) {
            epoch = buildInitialEpoch({ asset: eligible, walletNormalized, quotaPeriod, now });
            await insertQuotaEpoch(context.repository, epoch);
          } else {
            assertOwnCukieEpochIntegrity(epoch);
            if (quotaPeriod && !periodScopedEpoch(epoch)) {
              throw new DomainConflictError("El ledger diario del Cukie no tiene periodo canonico.");
            }
          }
          if (
            (epoch.status !== "active"
              && !(quotaPeriod && epoch.status === "invalidated" && epoch.gamesRemaining > 0))
            || epoch.gamesRemaining === 0
          ) continue;
          return assignCandidate(context, {
            epoch,
            asset: eligible,
            softStakeLockId: eligible.softStakeLockId,
            sessionId,
            walletNormalized,
            expiresAt,
            idempotencyKey,
            requestHash,
            now,
          });
        }
        return null;
      });
    },

    /**
     * Read-only aggregate for the current period. It deliberately does not
     * create or repair epochs: an absent ledger means the full policy quota,
     * while a malformed ledger makes the aggregate unknown instead of zero.
     */
    async availability(input: {
      walletAddress: string;
      quotaPeriod: OwnCukieQuotaPeriod;
      now?: Date;
    }): Promise<OwnCukieAvailability> {
      const now = validOwnCukieDate(input.now, "now", new Date());
      const walletNormalized = normalizeOwnCukieWallet(input.walletAddress);
      const quotaPeriod = assertQuotaPeriod(input.quotaPeriod);
      return runner(async (context) => {
        const assets = await context.repository.listWalletAssets(walletNormalized, now);
        let totalGamesRemaining = 0;
        let eligibleCukies = 0;
        let unknownCukies = 0;
        for (const candidate of assets) {
          // State/custody/network exclusions are conclusive even if a stale
          // row also lacks ownership metadata. Only unresolved eligibility
          // signals should contribute to the pending/unknown count.
          if (ownCukieAssetHasKnownIneligibilitySignals(candidate, walletNormalized)) {
            continue;
          }
          if (ownCukieAssetHasUnknownEligibilitySignals(candidate)) {
            unknownCukies += 1;
            continue;
          }
          let eligible: ReturnType<typeof assertOwnCukieAssetEligible>;
          try {
            eligible = assertOwnCukieAssetEligible(candidate, walletNormalized);
          } catch {
            continue;
          }
          eligibleCukies += 1;
          const epochId = ownCukiePeriodEpochId({
            assetId: candidate.assetId,
            periodId: quotaPeriod.periodId,
            quotaPolicyVersion: quotaPeriod.policyVersion,
          });
          const epoch = await findQuotaEpoch(context.repository, epochId, true);
          if (!epoch) {
            totalGamesRemaining += ownCukieQuota(eligible.generation, eligible.rarity);
            continue;
          }
          try {
            assertOwnCukieEpochIntegrity(epoch);
          } catch {
            unknownCukies += 1;
            continue;
          }
          if (
            !periodScopedEpoch(epoch)
            || epoch.periodId !== quotaPeriod.periodId
            || epoch.quotaPolicyVersion !== quotaPeriod.policyVersion
            || epoch.assetId !== candidate.assetId
            || (epoch.status === "assigned" && candidate.activeLocks.length === 0)
          ) {
            unknownCukies += 1;
            continue;
          }
          // An ownership drift invalidates the reservation, not the consumed
          // slot. Once the asset is currently eligible, its remaining stable
          // period balance is still visible and can be reserved by the owner.
          totalGamesRemaining += epoch.gamesRemaining;
        }
        if (unknownCukies > 0 && totalGamesRemaining === 0) {
          return {
            status: "unknown",
            periodId: quotaPeriod.periodId,
            periodStartsAt: quotaPeriod.startsAt,
            periodEndsAt: quotaPeriod.endsAt,
            totalGamesRemaining: null,
            eligibleCukies: null,
            unknownCukies,
          } satisfies OwnCukieAvailability;
        }
        if (unknownCukies > 0) {
          return {
            status: "partial",
            periodId: quotaPeriod.periodId,
            periodStartsAt: quotaPeriod.startsAt,
            periodEndsAt: quotaPeriod.endsAt,
            totalGamesRemaining,
            eligibleCukies,
            unknownCukies,
          } satisfies OwnCukieAvailability;
        }
        return {
          status: "ready",
          periodId: quotaPeriod.periodId,
          periodStartsAt: quotaPeriod.startsAt,
          periodEndsAt: quotaPeriod.endsAt,
          totalGamesRemaining,
          eligibleCukies,
          unknownCukies,
        } satisfies OwnCukieAvailability;
      });
    },

    async finish(input: FinishOwnCukieInput): Promise<OwnCukieAssignment> {
      const now = validOwnCukieDate(input.now, "now", new Date());
      const sessionId = requiredOwnCukieText(input.sessionId, "sessionId");
      const assignmentId = input.assignmentId
        ? requiredOwnCukieText(input.assignmentId, "assignmentId")
        : ownCukieAssignmentId(sessionId);
      const reservationIdempotencyKey = requiredOwnCukieText(
        input.reservationIdempotencyKey,
        "reservationIdempotencyKey",
      );
      const idempotencyKey = requiredOwnCukieText(input.idempotencyKey, "idempotencyKey");
      const reason = requiredOwnCukieText(input.reason, "reason");
      if (typeof input.consumeGame !== "boolean") {
        throw new DomainValidationError("consumeGame debe ser booleano.");
      }
      const operation = input.consumeGame ? "consume" as const : "release" as const;
      const requestHash = stableOwnCukieHash({
        operation,
        sessionId,
        assignmentId,
        reservationIdempotencyKey,
        consumeGame: input.consumeGame,
        reason,
      });

      return runner(async (context) => {
        const prior = await context.repository.findEventByIdempotencyKey(idempotencyKey);
        if (prior) return assertEventReplay(prior, operation, requestHash);
        const assignment = await context.repository.findAssignmentById(assignmentId);
        if (!assignment) throw new DomainNotFoundError("No existe la asignacion Cukie propia.");
        assertOwnCukieAssignmentIntegrity(assignment);
        if (
          assignment.sessionId !== sessionId
          || assignment.idempotencyKey !== reservationIdempotencyKey
        ) {
          throw new DomainConflictError("La asignacion propia no pertenece a esta session.");
        }
        if (assignment.status !== "active") {
          throw new DomainConflictError(`La asignacion propia ya termino como ${assignment.status}.`);
        }
        const epoch = await findQuotaEpoch(
          context.repository,
          assignment.epochId,
          Boolean(assignment.periodId || assignment.quotaPolicyVersion),
        );
        if (!epoch) throw new DomainConflictError("No existe el ownership epoch de la asignacion.");
        assertOwnCukieEpochIntegrity(epoch);
        if (assignment.periodId && assignment.quotaPolicyVersion && !periodScopedEpoch(epoch)) {
          throw new DomainConflictError("El ledger diario de la asignacion no tiene periodo canonico.");
        }
        if (
          epoch.status !== "assigned"
          || epoch.assignmentSessionId !== sessionId
          || epoch.assetId !== assignment.assetId
          || epoch.ownerNormalized !== assignment.ownerNormalized
          || epoch.ownershipEventId !== assignment.ownershipEventId
        ) {
          throw new DomainConflictError("El ownership epoch no liga la asignacion activa.");
        }

        const canonical = await context.repository.findAsset(assignment.assetId, now);
        const matchingLock = canonical?.activeLocks.filter((lock) => (
          lock.lockId === assignment.lockId
          && lock.reason === "game_assignment"
          && lock.ownerNormalized === assignment.ownerNormalized
        )) ?? [];
        const ownershipMatches = Boolean(
          canonical
          && canonical.network === "bsc"
          && canonical.ownerNormalized === assignment.ownerNormalized
          && canonical.ownershipEventId === assignment.ownershipEventId
          && canonical.tokenId === assignment.tokenId
          && canonical.generation === assignment.generation
          && canonical.rarity === assignment.rarity
          && matchingLock.length === 1,
        );
        const terminalLock = await finishAssignmentLock(context, {
          assignment,
          ownershipMatches,
          idempotencyKey,
          reason,
          now,
        });
        const nextEpochValue: OwnCukieEpoch = {
          ...cloneOwnCukieEpoch(epoch),
          status: !ownershipMatches
            ? "invalidated"
            : input.consumeGame && epoch.gamesRemaining === 0
              ? "exhausted"
              : "active",
          gamesRemaining: input.consumeGame
            ? epoch.gamesRemaining
            : Math.min(epoch.gamesQuota, epoch.gamesRemaining + 1),
          revision: epoch.revision + 1,
          updatedAt: now,
          ...(!ownershipMatches
            ? { invalidatedAt: now, invalidationReason: "ownership_drift" }
            : {}),
        };
        delete nextEpochValue.assignmentSessionId;
        delete nextEpochValue.assignmentExpiresAt;
        const nextEpoch = assertOwnCukieEpochIntegrity(nextEpochValue);
        const persistedEpoch = await compareAndSetQuotaEpoch(context.repository, epoch, nextEpoch);
        if (!persistedEpoch) throw new StaleFenceError("CAS terminal obsoleto para ownership epoch.");

        const nextAssignment = assertOwnCukieAssignmentIntegrity({
          ...cloneOwnCukieAssignment(assignment),
          status: !ownershipMatches
            ? "invalidated"
            : input.consumeGame ? "completed" : "released",
          lockFencingToken: terminalLock.fencingToken,
          revision: assignment.revision + 1,
          updatedAt: now,
          terminalAt: now,
          terminalReason: ownershipMatches ? reason : "ownership_drift",
        });
        const persistedAssignment = await context.repository.compareAndSetAssignment(
          assignment,
          nextAssignment,
        );
        if (!persistedAssignment) throw new StaleFenceError("CAS terminal obsoleto para asignacion propia.");
        await context.repository.insertEvent(buildEvent({
          operation: ownershipMatches ? operation : "invalidate",
          idempotencyKey,
          requestHash,
          epoch: persistedEpoch,
          assignment: persistedAssignment,
          now,
        }));
        return cloneOwnCukieAssignment(persistedAssignment);
      });
    },
  };
}

export const ownCukieService = createOwnCukieService(mongoOwnCukieTransactionRunner);
