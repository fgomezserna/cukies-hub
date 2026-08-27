import 'server-only';

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  StaleFenceError,
} from '@/lib/uki-economy/errors';
import { normalizeWalletAddress } from '@/lib/wallet-address';

import {
  buildNftAssetLockDocument,
  buildNftAssetLockEvent,
  buildNftLockPayloadHash,
  cloneNftAssetLock,
  incrementFencingToken,
  normalizeAcquireNftAssetLockInput,
  requiredText,
  validExternalIdempotencyKey,
  validExpiryDate,
  validFencingToken,
  validFutureExpiry,
  validLockLimit,
  validLockReason,
  validNow,
  type AcquireNftAssetLockInput,
  type ExpireNftAssetLocksInput,
  type ExpireNftAssetLocksResult,
  type InvalidateNftAssetLockIntegrityInput,
  type InvalidateNftAssetLockOwnershipInput,
  type InvalidateNftAssetLockOwnershipResult,
  type NftAssetLockDocument,
  type NftAssetLockEventDocument,
  type NftAssetLockOperation,
  type ReleaseNftAssetLockInput,
  type TransitionNftAssetLockInput,
} from './lock-types';
import {
  isDuplicatePersistenceConflict,
  mapNftAssetLockPersistenceError,
  mongoNftAssetLockTransactionRunner,
  type NftAssetLockRepository,
  type NftAssetLockTransactionRunner,
} from './lock-repository';

export * from './lock-types';
export {
  isDuplicatePersistenceConflict,
  isMongoDuplicateKeyError,
  mapNftAssetLockPersistenceError,
} from './lock-repository';
export type {
  ActiveLockCasOptions,
  NftAssetLockRepository,
  NftAssetLockTransactionRunner,
} from './lock-repository';

type IdempotentOperation = {
  idempotencyKey: string;
  operation: NftAssetLockOperation;
  payloadHash: string;
};

function assertIdempotentEventMatches(
  event: NftAssetLockEventDocument,
  input: IdempotentOperation,
) {
  if (event.operation !== input.operation || event.payloadHash !== input.payloadHash) {
    throw new DomainConflictError(
      `La idempotencyKey ${input.idempotencyKey} ya se uso con otro payload.`,
    );
  }

  return event;
}

async function idempotentEvent(
  repository: NftAssetLockRepository,
  input: IdempotentOperation,
) {
  const event = await repository.findEventByIdempotencyKey(input.idempotencyKey);
  if (!event) return null;

  return assertIdempotentEventMatches(event, input);
}

async function idempotentEventResult(
  repository: NftAssetLockRepository,
  input: IdempotentOperation,
) {
  const event = await idempotentEvent(repository, input);
  return event ? cloneNftAssetLock(event.resultingLock) : null;
}

async function runWithDuplicateWinner<T>(
  runner: NftAssetLockTransactionRunner,
  input: IdempotentOperation,
  mutation: () => Promise<T>,
  fromEvent: (event: NftAssetLockEventDocument) => T,
) {
  try {
    return await mutation();
  } catch (error) {
    if (!isDuplicatePersistenceConflict(error)) throw error;

    const winner = await runner((repository) => (
      repository.findEventByIdempotencyKey(input.idempotencyKey)
    ));
    if (!winner || winner.operation !== input.operation || winner.payloadHash !== input.payloadHash) {
      throw error;
    }

    return fromEvent(winner);
  }
}

async function getActiveLockForMutation(
  repository: NftAssetLockRepository,
  lockId: string,
  expectedFencingToken: number,
  notExpiredAt?: Date,
) {
  const lock = await repository.findLockById(lockId);

  if (!lock) {
    throw new DomainNotFoundError(`No existe el lock ${lockId}.`, { lockId });
  }

  if (lock.fencingToken !== expectedFencingToken) {
    throw new StaleFenceError(`Fencing token obsoleto para ${lockId}.`, {
      lockId,
      expectedFencingToken,
      actualFencingToken: lock.fencingToken,
    });
  }

  if (lock.status !== 'active') {
    throw new DomainConflictError(`El lock ${lockId} ya no esta activo.`, {
      lockId,
      status: lock.status,
    });
  }

  if (notExpiredAt && lock.expiresAt && lock.expiresAt.getTime() <= notExpiredAt.getTime()) {
    throw new DomainConflictError(`El lock ${lockId} esta vencido.`, {
      lockId,
      expiresAt: lock.expiresAt.toISOString(),
    });
  }

  return lock;
}

async function persistTransition(
  repository: NftAssetLockRepository,
  input: {
    previous: NftAssetLockDocument;
    resulting: NftAssetLockDocument;
    operation: NftAssetLockOperation;
    idempotencyKey: string;
    payloadHash: string;
    actor: string;
    eventReason: string;
    expiresAtLte?: Date;
    notExpiredAt?: Date;
    timestamp?: Date;
    outcome?: 'owner_matches' | 'invalidated';
  },
) {
  const replaced = await repository.compareAndSetActiveLock(
    input.previous.lockId,
    input.previous.fencingToken,
    input.resulting,
    input.expiresAtLte
      ? { expiresAtLte: input.expiresAtLte }
      : input.notExpiredAt
        ? { notExpiredAt: input.notExpiredAt }
        : undefined,
  );

  if (!replaced) {
    await getActiveLockForMutation(
      repository,
      input.previous.lockId,
      input.previous.fencingToken,
      input.notExpiredAt,
    );
    throw new DomainConflictError(`Fallo de CAS para el lock ${input.previous.lockId}.`);
  }

  try {
    const lockEvent = buildNftAssetLockEvent({
      operation: input.operation,
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.payloadHash,
      previous: input.previous,
      resulting: replaced,
      actor: input.actor,
      reason: input.eventReason,
      timestamp: input.timestamp ?? replaced.updatedAt,
      outcome: input.outcome,
    });
    await repository.insertEvent(lockEvent);
    await repository.enqueueRecalculation({
      idempotencyKey: input.idempotencyKey,
      walletNormalized: replaced.ownerNormalized,
      sourceEventId: lockEvent.eventId,
      reason: `nft_lock_${input.operation}`,
      availableAt: input.timestamp ?? replaced.updatedAt,
    });
  } catch (error) {
    throw mapNftAssetLockPersistenceError(error, 'La transicion de lock ya fue registrada.');
  }

  return replaced;
}

async function expireActiveLockBeforeAcquire(
  repository: NftAssetLockRepository,
  lock: NftAssetLockDocument,
  now: Date,
  actor: string,
) {
  const idempotencyKey = `system:nft-lock:auto-expire:${lock.lockId}:${lock.fencingToken}`;
  const payloadHash = buildNftLockPayloadHash('expire', {
    lockId: lock.lockId,
    expectedFencingToken: lock.fencingToken,
    expiresAt: lock.expiresAt,
  });
  const resulting: NftAssetLockDocument = {
    ...cloneNftAssetLock(lock),
    status: 'expired',
    fencingToken: incrementFencingToken(lock.fencingToken),
    updatedAt: now,
    releaseReason: 'expired_before_reacquire',
  };

  return persistTransition(repository, {
    previous: lock,
    resulting,
    operation: 'expire',
    idempotencyKey,
    payloadHash,
    actor,
    eventReason: 'expired_before_reacquire',
    expiresAtLte: now,
  });
}

function createAcquireOperation(runner: NftAssetLockTransactionRunner) {
  return async (input: AcquireNftAssetLockInput) => {
    const normalized = normalizeAcquireNftAssetLockInput(input, { validateTemporal: false });
    const operation: IdempotentOperation = {
      idempotencyKey: normalized.idempotencyKey,
      operation: 'acquire',
      payloadHash: normalized.payloadHash,
    };

    return runWithDuplicateWinner(runner, operation, () => runner(async (repository) => {
      const priorEvent = await idempotentEventResult(repository, operation);
      if (priorEvent) return priorEvent;

      const existing = await repository.findLockByIdempotencyKey(normalized.idempotencyKey);
      if (existing) {
        if (existing.payloadHash !== normalized.payloadHash) {
          throw new DomainConflictError(
            `La idempotencyKey ${normalized.idempotencyKey} ya se uso con otro payload.`,
          );
        }

        return cloneNftAssetLock(existing);
      }

      const now = validNow(normalized.now);
      const expiresAt = normalized.expiresAt
        ? validFutureExpiry(normalized.expiresAt, now)
        : undefined;

      const active = await repository.findActiveLockByAssetId(normalized.assetId);
      if (active) {
        if (!active.expiresAt || active.expiresAt.getTime() > now.getTime()) {
          throw new DomainConflictError(
            `El asset ${normalized.assetId} ya tiene un lock activo.`,
            { assetId: normalized.assetId, lockId: active.lockId },
          );
        }

        await expireActiveLockBeforeAcquire(
          repository,
          active,
          now,
          normalized.createdBy,
        );
      }

      const lock = buildNftAssetLockDocument({
        assetId: normalized.assetId,
        ownerNormalized: normalized.ownerNormalized,
        reason: normalized.reason,
        createdBy: normalized.createdBy,
        idempotencyKey: normalized.idempotencyKey,
        expiresAt,
        sessionId: normalized.sessionId,
        now,
      });

      try {
        await repository.insertLock(lock);
        const lockEvent = buildNftAssetLockEvent({
          operation: 'acquire',
          idempotencyKey: normalized.idempotencyKey,
          payloadHash: normalized.payloadHash,
          previous: null,
          resulting: lock,
          actor: normalized.createdBy,
          reason: 'lock_acquired',
          timestamp: now,
        });
        await repository.insertEvent(lockEvent);
        await repository.enqueueRecalculation({
          idempotencyKey: normalized.idempotencyKey,
          walletNormalized: lock.ownerNormalized,
          sourceEventId: lockEvent.eventId,
          reason: 'nft_lock_acquire',
          availableAt: now,
        });
      } catch (error) {
        throw mapNftAssetLockPersistenceError(
          error,
          `El asset ${normalized.assetId} ya tiene un lock activo o la idempotencyKey esta en uso.`,
        );
      }

      return lock;
    }), (event) => cloneNftAssetLock(event.resultingLock));
  };
}

function createTransitionOperation(runner: NftAssetLockTransactionRunner) {
  return async (input: TransitionNftAssetLockInput) => {
    const lockId = requiredText(input.lockId, 'lockId');
    const expectedFencingToken = validFencingToken(input.expectedFencingToken);
    const reason = validLockReason(input.reason);
    const actor = requiredText(input.actor, 'actor');
    const idempotencyKey = validExternalIdempotencyKey(input.idempotencyKey);
    const transitionReason = requiredText(
      input.transitionReason ?? 'lock_transition',
      'transitionReason',
    );
    const nowCandidate = input.now ?? new Date();
    const expiresAt = input.expiresAt === null || input.expiresAt === undefined
      ? input.expiresAt
      : validExpiryDate(input.expiresAt);
    const sessionId = typeof input.sessionId === 'string'
      ? requiredText(input.sessionId, 'sessionId')
      : input.sessionId;
    if (
      input.retainsSoftStakeEntitlement !== undefined
      && typeof input.retainsSoftStakeEntitlement !== 'boolean'
    ) {
      throw new DomainValidationError('retainsSoftStakeEntitlement debe ser booleano.');
    }
    const retainsSoftStakeEntitlement = input.retainsSoftStakeEntitlement === true;
    const payloadHash = buildNftLockPayloadHash('transition', {
      lockId,
      expectedFencingToken,
      reason,
      actor,
      idempotencyKey,
      transitionReason,
      expiresAt,
      sessionId,
      ...(input.retainsSoftStakeEntitlement !== undefined
        ? { retainsSoftStakeEntitlement }
        : {}),
    });
    const operation: IdempotentOperation = {
      idempotencyKey,
      operation: 'transition',
      payloadHash,
    };

    return runWithDuplicateWinner(runner, operation, () => runner(async (repository) => {
      const prior = await idempotentEventResult(repository, operation);
      if (prior) return prior;

      const now = validNow(nowCandidate);
      const validatedExpiresAt = expiresAt instanceof Date
        ? validFutureExpiry(expiresAt, now)
        : expiresAt;

      const lock = await getActiveLockForMutation(
        repository,
        lockId,
        expectedFencingToken,
        now,
      );
      if (
        retainsSoftStakeEntitlement
        && (lock.reason !== 'soft_stake' || reason !== 'game_assignment')
      ) {
        throw new DomainConflictError(
          'Solo un soft-stake puede retener entitlement al pasar a game_assignment.',
        );
      }
      const resulting: NftAssetLockDocument = {
        ...cloneNftAssetLock(lock),
        reason,
        fencingToken: incrementFencingToken(lock.fencingToken),
        updatedAt: now,
      };

      if (input.expiresAt === null) delete resulting.expiresAt;
      else if (validatedExpiresAt) resulting.expiresAt = validatedExpiresAt;
      if (input.sessionId === null) delete resulting.sessionId;
      else if (sessionId) resulting.sessionId = sessionId;
      if (retainsSoftStakeEntitlement) resulting.retainsSoftStakeEntitlement = true;
      else delete resulting.retainsSoftStakeEntitlement;
      delete resulting.releaseReason;

      return persistTransition(repository, {
        previous: lock,
        resulting,
        operation: 'transition',
        idempotencyKey,
        payloadHash,
        actor,
        eventReason: transitionReason,
        notExpiredAt: now,
      });
    }), (event) => cloneNftAssetLock(event.resultingLock));
  };
}

function createReleaseOperation(runner: NftAssetLockTransactionRunner) {
  return async (input: ReleaseNftAssetLockInput) => {
    const lockId = requiredText(input.lockId, 'lockId');
    const expectedFencingToken = validFencingToken(input.expectedFencingToken);
    const actor = requiredText(input.actor, 'actor');
    const releaseReason = requiredText(input.releaseReason, 'releaseReason');
    const idempotencyKey = validExternalIdempotencyKey(input.idempotencyKey);
    const nowCandidate = input.now ?? new Date();
    const payloadHash = buildNftLockPayloadHash('release', {
      lockId,
      expectedFencingToken,
      actor,
      releaseReason,
      idempotencyKey,
    });
    const operation: IdempotentOperation = {
      idempotencyKey,
      operation: 'release',
      payloadHash,
    };

    return runWithDuplicateWinner(runner, operation, () => runner(async (repository) => {
      const prior = await idempotentEventResult(repository, operation);
      if (prior) return prior;

      const now = validNow(nowCandidate);

      const lock = await getActiveLockForMutation(
        repository,
        lockId,
        expectedFencingToken,
        now,
      );
      const resulting: NftAssetLockDocument = {
        ...cloneNftAssetLock(lock),
        status: 'released',
        fencingToken: incrementFencingToken(lock.fencingToken),
        updatedAt: now,
        releaseReason,
      };

      return persistTransition(repository, {
        previous: lock,
        resulting,
        operation: 'release',
        idempotencyKey,
        payloadHash,
        actor,
        eventReason: releaseReason,
        notExpiredAt: now,
      });
    }), (event) => cloneNftAssetLock(event.resultingLock));
  };
}

function createInvalidateOwnershipOperation(runner: NftAssetLockTransactionRunner) {
  return async (
    input: InvalidateNftAssetLockOwnershipInput,
  ): Promise<InvalidateNftAssetLockOwnershipResult> => {
    const lockId = requiredText(input.lockId, 'lockId');
    const expectedFencingToken = validFencingToken(input.expectedFencingToken);
    const currentOwner = normalizeWalletAddress(requiredText(input.currentOwner, 'currentOwner'));
    const actor = requiredText(input.actor, 'actor');
    const invalidationReason = requiredText(input.reason, 'reason');
    const idempotencyKey = validExternalIdempotencyKey(input.idempotencyKey);
    const nowCandidate = input.now ?? new Date();
    const payloadHash = buildNftLockPayloadHash('invalidate_ownership', {
      lockId,
      expectedFencingToken,
      currentOwner,
      actor,
      invalidationReason,
      idempotencyKey,
    });
    const operation: IdempotentOperation = {
      idempotencyKey,
      operation: 'invalidate_ownership',
      payloadHash,
    };

    return runWithDuplicateWinner(runner, operation, () => runner(async (repository) => {
      const prior = await idempotentEvent(repository, operation);
      if (prior) {
        return {
          outcome: prior.outcome ?? 'invalidated',
          lock: cloneNftAssetLock(prior.resultingLock),
        };
      }

      const now = validNow(nowCandidate);

      const lock = await getActiveLockForMutation(
        repository,
        lockId,
        expectedFencingToken,
        now,
      );
      if (currentOwner === lock.ownerNormalized) {
        const unchanged = cloneNftAssetLock(lock);
        const checked = await persistTransition(repository, {
          previous: lock,
          resulting: unchanged,
          operation: 'invalidate_ownership',
          idempotencyKey,
          payloadHash,
          actor,
          eventReason: invalidationReason,
          notExpiredAt: now,
          timestamp: now,
          outcome: 'owner_matches',
        });

        return { outcome: 'owner_matches', lock: checked };
      }

      const resulting: NftAssetLockDocument = {
        ...cloneNftAssetLock(lock),
        status: 'invalidated',
        fencingToken: incrementFencingToken(lock.fencingToken),
        updatedAt: now,
        releaseReason: invalidationReason,
      };
      const invalidated = await persistTransition(repository, {
        previous: lock,
        resulting,
        operation: 'invalidate_ownership',
        idempotencyKey,
        payloadHash,
        actor,
        eventReason: invalidationReason,
        notExpiredAt: now,
        outcome: 'invalidated',
      });

      return { outcome: 'invalidated', lock: invalidated };
    }), (event) => ({
      outcome: event.outcome ?? 'invalidated',
      lock: cloneNftAssetLock(event.resultingLock),
    }));
  };
}

function createInvalidateIntegrityOperation(runner: NftAssetLockTransactionRunner) {
  return async (input: InvalidateNftAssetLockIntegrityInput) => {
    const lockId = requiredText(input.lockId, 'lockId');
    const expectedFencingToken = validFencingToken(input.expectedFencingToken);
    const actor = requiredText(input.actor, 'actor');
    const invalidationReason = requiredText(input.reason, 'reason');
    const idempotencyKey = validExternalIdempotencyKey(input.idempotencyKey);
    const nowCandidate = input.now ?? new Date();
    const payloadHash = buildNftLockPayloadHash('invalidate_integrity', {
      lockId,
      expectedFencingToken,
      actor,
      invalidationReason,
      idempotencyKey,
    });
    const operation: IdempotentOperation = {
      idempotencyKey,
      operation: 'invalidate_integrity',
      payloadHash,
    };

    return runWithDuplicateWinner(runner, operation, () => runner(async (repository) => {
      const prior = await idempotentEventResult(repository, operation);
      if (prior) return prior;

      const now = validNow(nowCandidate);
      const lock = await getActiveLockForMutation(
        repository,
        lockId,
        expectedFencingToken,
        now,
      );
      const resulting: NftAssetLockDocument = {
        ...cloneNftAssetLock(lock),
        status: 'invalidated',
        fencingToken: incrementFencingToken(lock.fencingToken),
        updatedAt: now,
        releaseReason: invalidationReason,
      };
      return persistTransition(repository, {
        previous: lock,
        resulting,
        operation: 'invalidate_integrity',
        idempotencyKey,
        payloadHash,
        actor,
        eventReason: invalidationReason,
        notExpiredAt: now,
        outcome: 'invalidated',
      });
    }), (event) => cloneNftAssetLock(event.resultingLock));
  };
}

function createExpireOperation(runner: NftAssetLockTransactionRunner) {
  return async (input: ExpireNftAssetLocksInput = {}): Promise<ExpireNftAssetLocksResult> => {
    const now = validNow(input.now);
    const limit = validLockLimit(input.limit);
    const actor = requiredText(input.actor ?? 'nft-lock-expirer', 'actor');
    const excludeReasons = Array.from(new Set(input.excludeReasons ?? [])).map(validLockReason);
    const candidates = await runner((repository) => (
      repository.findExpiredActiveLocks(now, limit, excludeReasons)
    ));
    let expired = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const didExpire = await runner(async (repository) => {
        const idempotencyKey = `system:nft-lock:expire:${candidate.lockId}:${candidate.fencingToken}`;
        const payloadHash = buildNftLockPayloadHash('expire', {
          lockId: candidate.lockId,
          expectedFencingToken: candidate.fencingToken,
          expiresAt: candidate.expiresAt,
        });
        const prior = await idempotentEventResult(repository, {
          idempotencyKey,
          operation: 'expire',
          payloadHash,
        });
        if (prior) return false;

        const current = await repository.findLockById(candidate.lockId);
        if (
          !current
          || current.status !== 'active'
          || current.fencingToken !== candidate.fencingToken
          || !current.expiresAt
          || current.expiresAt.getTime() > now.getTime()
        ) return false;

        const resulting: NftAssetLockDocument = {
          ...cloneNftAssetLock(current),
          status: 'expired',
          fencingToken: incrementFencingToken(current.fencingToken),
          updatedAt: now,
          releaseReason: 'expired',
        };
        const replaced = await repository.compareAndSetActiveLock(
          current.lockId,
          current.fencingToken,
          resulting,
          { expiresAtLte: now },
        );
        if (!replaced) return false;

        try {
          const lockEvent = buildNftAssetLockEvent({
            operation: 'expire',
            idempotencyKey,
            payloadHash,
            previous: current,
            resulting: replaced,
            actor,
            reason: 'expired',
            timestamp: now,
          });
          await repository.insertEvent(lockEvent);
          await repository.enqueueRecalculation({
            idempotencyKey,
            walletNormalized: replaced.ownerNormalized,
            sourceEventId: lockEvent.eventId,
            reason: 'nft_lock_expire',
            availableAt: now,
          });
        } catch (error) {
          throw mapNftAssetLockPersistenceError(error, 'La expiracion del lock ya fue registrada.');
        }

        return true;
      });

      if (didExpire) expired += 1;
      else skipped += 1;
    }

    return { scanned: candidates.length, expired, skipped };
  };
}

export function createNftAssetLockService(runner: NftAssetLockTransactionRunner) {
  return {
    acquireNftAssetLock: createAcquireOperation(runner),
    transitionNftAssetLock: createTransitionOperation(runner),
    releaseNftAssetLock: createReleaseOperation(runner),
    invalidateNftAssetLockForOwnership: createInvalidateOwnershipOperation(runner),
    invalidateNftAssetLockForIntegrity: createInvalidateIntegrityOperation(runner),
    expireNftAssetLocks: createExpireOperation(runner),
  };
}

const defaultService = createNftAssetLockService(mongoNftAssetLockTransactionRunner);

export const acquireNftAssetLock = defaultService.acquireNftAssetLock;
export const transitionNftAssetLock = defaultService.transitionNftAssetLock;
export const releaseNftAssetLock = defaultService.releaseNftAssetLock;
export const invalidateNftAssetLockForOwnership = (
  defaultService.invalidateNftAssetLockForOwnership
);
export const invalidateNftAssetLockForIntegrity = (
  defaultService.invalidateNftAssetLockForIntegrity
);
export const expireNftAssetLocks = defaultService.expireNftAssetLocks;
