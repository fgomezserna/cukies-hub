import 'server-only';

import {
  buildNftAssetLockEvent,
  buildNftLockPayloadHash,
  cloneNftAssetLock,
  incrementFencingToken,
} from '@/lib/nft-inventory/lock-types';
import type { NftAssetLockRepository } from '@/lib/nft-inventory/lock-repository';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  SchemaNotReadyError,
  StaleFenceError,
} from '../errors';
import {
  CUKIE_POOL_ASSIGNMENT_PAGE_SIZE,
  CUKIE_POOL_SYSTEM_IDEMPOTENCY_PREFIX,
  clonePoolAssignment,
  clonePoolPosition,
  deterministicSeikuAssetId,
  firstPoolEligibilityAt,
  gamesQuota,
  normalizePoolWallet,
  poolPriority,
  requiredPoolText,
  stableCukiePoolHash,
  validPoolDate,
  validPoolIdempotencyKey,
  validPoolLimit,
  validPoolRevision,
} from './rules';
import {
  isCukiePoolDuplicateKey,
  mongoCukiePoolTransactionRunner,
  type CukiePoolTransactionContext,
  type CukiePoolTransactionRunner,
} from './repository';
import type {
  AssignCukiePoolSessionInput,
  CukiePoolAssignment,
  CukiePoolAssignmentCursor,
  CukiePoolAssetSnapshot,
  CukiePoolEvent,
  CukiePoolEventOperation,
  CukiePoolGeneration,
  CukiePoolPosition,
  CukiePoolRarity,
  DepositCukiePoolPositionInput,
  ExpireCukiePoolAssignmentsInput,
  ExpireCukiePoolAssignmentsResult,
  ReconcileCukiePoolPositionsInput,
  ReconcileCukiePoolPositionsResult,
  ReleaseCukiePoolAssignmentInput,
  RequestCukiePoolWithdrawalInput,
} from './types';

function assignmentCursorFor(position: CukiePoolPosition): CukiePoolAssignmentCursor {
  if (
    (position.poolPriority !== 0 && position.poolPriority !== 1)
    || !(position.eligibleAt instanceof Date)
    || Number.isNaN(position.eligibleAt.getTime())
    || !(position.stakedAt instanceof Date)
    || Number.isNaN(position.stakedAt.getTime())
    || typeof position._id !== 'string'
    || position._id.length === 0
  ) {
    throw new DomainConflictError(
      'La fuente del pool contiene una fila sin cursor canonico; no se puede decidir Seiku.',
    );
  }
  return {
    poolPriority: position.poolPriority,
    eligibleAt: position.eligibleAt,
    stakedAt: position.stakedAt,
    documentId: position._id,
  };
}

type IdempotentOperation = {
  operation: CukiePoolEventOperation;
  idempotencyKey: string;
  requestHash: string;
};

function assertEventMatches(event: CukiePoolEvent, operation: IdempotentOperation) {
  if (
    event.operation !== operation.operation
    || event.requestHash !== operation.requestHash
  ) {
    throw new DomainConflictError(
      `La idempotencyKey ${operation.idempotencyKey} ya se uso con otro payload.`,
    );
  }
  return event;
}

function buildEvent(input: {
  operation: IdempotentOperation;
  position: CukiePoolPosition | null;
  assignment: CukiePoolAssignment | null;
  now: Date;
}): CukiePoolEvent {
  const eventId = stableCukiePoolHash({
    kind: 'cukie-pool-event',
    operation: input.operation.operation,
    idempotencyKey: input.operation.idempotencyKey,
    requestHash: input.operation.requestHash,
  });
  return {
    _id: eventId,
    eventId,
    operation: input.operation.operation,
    idempotencyKey: input.operation.idempotencyKey,
    requestHash: input.operation.requestHash,
    positionId: input.position?.positionId ?? null,
    assignmentId: input.assignment?.assignmentId ?? null,
    resultingPosition: input.position ? clonePoolPosition(input.position) : null,
    resultingAssignment: input.assignment ? clonePoolAssignment(input.assignment) : null,
    createdAt: input.now,
  };
}

async function runIdempotent<T>(
  runner: CukiePoolTransactionRunner,
  operation: IdempotentOperation,
  work: (context: CukiePoolTransactionContext) => Promise<T>,
  fromEvent: (event: CukiePoolEvent) => T,
) {
  const execute = () => runner(async (context) => {
    const prior = await context.repository.findEventByIdempotencyKey(
      operation.idempotencyKey,
    );
    if (prior) return fromEvent(assertEventMatches(prior, operation));
    return work(context);
  });

  try {
    return await execute();
  } catch (error) {
    if (!isCukiePoolDuplicateKey(error)) throw error;
    const winner = await runner(({ repository }) => (
      repository.findEventByIdempotencyKey(operation.idempotencyKey)
    ));
    if (!winner) throw error;
    return fromEvent(assertEventMatches(winner, operation));
  }
}

function validGeneration(value: string): CukiePoolGeneration | null {
  return value === 'original' || value === 'second_generation' ? value : null;
}

function validRarity(value: string): CukiePoolRarity | null {
  return ['common', 'uncommon', 'rare', 'epic', 'legendary', 'goat'].includes(value)
    ? value as CukiePoolRarity
    : null;
}

function assertDepositAsset(
  asset: CukiePoolAssetSnapshot | null,
  walletNormalized: string,
  assetId: string,
) {
  if (!asset) {
    throw new DomainNotFoundError(`No existe el asset ${assetId} para la wallet indicada.`);
  }
  const generation = validGeneration(asset.generation);
  const rarity = validRarity(asset.rarity);
  if (
    asset.assetId !== assetId
    || asset.network !== 'bsc'
    || asset.ownerNormalized !== walletNormalized
    || !asset.tokenId
    || !generation
    || !rarity
    || asset.canonicalState !== 'available'
    || asset.activeLocks.length !== 0
    || asset.blockers.length !== 0
  ) {
    throw new DomainConflictError(
      `El asset ${assetId} no tiene ownership y estado BSC elegibles para entrar al pool.`,
      {
        network: asset.network,
        canonicalState: asset.canonicalState,
        blockers: asset.blockers,
      },
    );
  }
  return { asset, generation, rarity };
}

export function assertCukiePoolPositionIntegrity(position: CukiePoolPosition) {
  const quota = gamesQuota(position.generation, position.rarity);
  const expectedEligibleAt = firstPoolEligibilityAt(position.stakedAt);
  const expectedRequestHash = stableCukiePoolHash({
    operation: 'deposit',
    walletNormalized: position.ownerNormalized,
    assetId: position.assetId,
  });
  const expectedPositionId = stableCukiePoolHash({
    kind: 'cukie-pool-position',
    assetId: position.assetId,
    stakedAt: position.stakedAt,
    idempotencyKey: position.idempotencyKey,
  });
  const lifecycleShouldBeOpen = position.status === 'active' || position.status === 'assigned';
  if (
    position._id !== position.positionId
    || position.positionId !== expectedPositionId
    || position.requestHash !== expectedRequestHash
    || position.poolType !== position.generation
    || position.poolPriority !== poolPriority(position.generation)
    || position.gamesQuota !== quota
    || !Number.isSafeInteger(position.gamesRemaining)
    || position.gamesRemaining < 0
    || position.gamesRemaining > quota
    || position.eligibleAt.getTime() !== expectedEligibleAt.getTime()
    || position.lifecycleOpen !== lifecycleShouldBeOpen
    || !Number.isSafeInteger(position.lockFencingToken)
    || position.lockFencingToken < 1
    || !Number.isSafeInteger(position.revision)
    || position.revision < 0
    || (
      position.status === 'assigned'
      && (
        !position.assignmentSessionId
        || !(position.assignmentExpiresAt instanceof Date)
        || Number.isNaN(position.assignmentExpiresAt.getTime())
      )
    )
    || (
      position.status === 'active'
      && Boolean(position.assignmentSessionId || position.assignmentExpiresAt)
    )
  ) {
    throw new DomainConflictError(`La posicion ${position.positionId} no supera integridad.`);
  }
  return position;
}

export function assertCukiePoolAssignmentIntegrity(assignment: CukiePoolAssignment) {
  const expectedId = stableCukiePoolHash({
    kind: 'cukie-pool-assignment',
    sessionId: assignment.sessionId,
  });
  const custodyMode = assignment.custodyMode ?? 'legacy';
  const reservationRequestHash = stableCukiePoolHash({
    operation: 'assign', sessionId: assignment.sessionId, expiresAt: assignment.expiresAt,
  });
  const expectedRequestHash = custodyMode === 'custodial'
    ? stableCukiePoolHash({
        operation: 'assign_vault',
        sessionId: assignment.sessionId,
        expiresAt: assignment.expiresAt,
        assignmentKind: assignment.kind,
        assetId: assignment.assetId,
        positionId: assignment.positionId,
        depositEpoch: assignment.depositEpoch ?? null,
        periodId: assignment.periodId ?? null,
        calendarVersion: assignment.calendarVersion ?? null,
      })
    : reservationRequestHash;
  const legacyPoolAssetValid = custodyMode === 'legacy'
    && assignment.kind === 'pool_asset'
    && Boolean(assignment.positionId)
    && Boolean(assignment.ownerNormalized)
    && Boolean(assignment.lockId)
    && Number.isSafeInteger(assignment.lockFencingToken)
    && Number(assignment.lockFencingToken) >= 1
    && typeof assignment.ownerRewardEligible === 'boolean';
  const custodialPoolAssetValid = custodyMode === 'custodial'
    && assignment.kind === 'pool_asset'
    && Boolean(assignment.positionId)
    && /^0x[0-9a-f]{40}$/.test(assignment.ownerNormalized ?? '')
    && /^0x[0-9a-f]{40}$/.test(assignment.collectionAddressNormalized ?? '')
    && /^[1-9][0-9]*$/.test(assignment.depositEpoch ?? '')
    && /^(0|[1-9][0-9]*)$/.test(assignment.periodId ?? '')
    && /^[1-9][0-9]*$/.test(assignment.calendarVersion ?? '')
    && Boolean(validGeneration(assignment.generation))
    && Boolean(validRarity(assignment.rarity))
    && Number.isSafeInteger(assignment.gamesQuota)
    && assignment.gamesQuota === gamesQuota(assignment.generation, assignment.rarity)
    && /^(56|97):0x[0-9a-f]{40}:(0|[1-9][0-9]*)$/.test(assignment.assetId)
    && assignment.assetId === `${assignment.assetId.split(':')[0]}:${assignment.collectionAddressNormalized}:${assignment.tokenId}`
    && assignment.positionId === `${assignment.assetId}:epoch:${assignment.depositEpoch}`
    && assignment.lockId === null
    && assignment.lockFencingToken === null
    && assignment.reservationRequestHash === reservationRequestHash
    && assignment.periodStartsAt instanceof Date
    && !Number.isNaN(assignment.periodStartsAt.getTime())
    && assignment.periodEndsAt instanceof Date
    && assignment.periodEndsAt.getTime() > assignment.periodStartsAt.getTime()
    && assignment.assignedAt >= assignment.periodStartsAt
    && assignment.assignedAt < assignment.periodEndsAt
    && typeof assignment.ownerRewardEligible === 'boolean';
  const seikuValid = assignment.kind === 'seiku'
    && assignment.positionId === null
    && assignment.ownerNormalized === null
    && assignment.lockId === null
    && assignment.lockFencingToken === null
    && !assignment.ownerRewardEligible
    && assignment.assetId === deterministicSeikuAssetId(assignment.sessionId)
    && assignment.generation === 'original'
    && assignment.rarity === 'common'
    && (
      custodyMode === 'legacy'
      || (
        assignment.collectionAddressNormalized === null
        && assignment.depositEpoch === null
        && assignment.gamesQuota === null
        && assignment.reservationRequestHash === reservationRequestHash
        && /^(0|[1-9][0-9]*)$/.test(assignment.periodId ?? '')
        && /^[1-9][0-9]*$/.test(assignment.calendarVersion ?? '')
        && assignment.periodStartsAt instanceof Date
        && !Number.isNaN(assignment.periodStartsAt.getTime())
        && assignment.periodEndsAt instanceof Date
        && assignment.periodEndsAt.getTime() > assignment.periodStartsAt.getTime()
        && assignment.assignedAt >= assignment.periodStartsAt
        && assignment.assignedAt < assignment.periodEndsAt
      )
    );
  if (
    assignment._id !== expectedId
    || assignment.assignmentId !== expectedId
    || assignment.requestHash !== expectedRequestHash
    || !['active', 'completed', 'released', 'expired'].includes(assignment.status)
    || !(assignment.assignedAt instanceof Date)
    || !(assignment.expiresAt instanceof Date)
    || assignment.expiresAt.getTime() <= assignment.assignedAt.getTime()
    || !Number.isSafeInteger(assignment.revision)
    || assignment.revision < 0
    || (!legacyPoolAssetValid && !custodialPoolAssetValid && !seikuValid)
  ) {
    throw new DomainConflictError(
      `La asignacion ${assignment.assignmentId} no supera integridad.`,
    );
  }
  return assignment;
}

function assignmentAssetIsUsable(
  asset: CukiePoolAssetSnapshot | null,
  position: CukiePoolPosition,
) {
  if (!asset) return false;
  const matchingLocks = asset.activeLocks.filter((lock) => (
    lock.lockId === position.lockId
    && lock.reason === 'pool_deposit'
    && lock.ownerNormalized === position.ownerNormalized
  ));
  return (
    asset.assetId === position.assetId
    && asset.tokenId === position.tokenId
    && asset.network === 'bsc'
    && asset.ownerNormalized === position.ownerNormalized
    && asset.generation === position.generation
    && asset.rarity === position.rarity
    && asset.canonicalState === 'in_pool'
    && matchingLocks.length === 1
  );
}

async function expireAssignedNftLock(input: {
  repository: NftAssetLockRepository;
  position: CukiePoolPosition;
  now: Date;
}) {
  const idempotencyKey = `system:nft-lock:cukie-pool-expire:${input.position.lockId}:${input.position.lockFencingToken}`;
  const payloadHash = buildNftLockPayloadHash('expire', {
    lockId: input.position.lockId,
    expectedFencingToken: input.position.lockFencingToken,
    expiresAt: input.position.assignmentExpiresAt,
  });
  const prior = await input.repository.findEventByIdempotencyKey(idempotencyKey);
  if (prior) {
    if (prior.operation !== 'expire' || prior.payloadHash !== payloadHash) {
      throw new DomainConflictError('Evento de expiracion NFT inconsistente.');
    }
    return cloneNftAssetLock(prior.resultingLock);
  }
  const current = await input.repository.findLockById(input.position.lockId);
  // Recuperacion de despliegues anteriores: el expirer generico pudo cerrar el
  // lock antes de que el agregado del pool actualizara posicion/asignacion.
  // Solo aceptamos exactamente la siguiente generacion del mismo lock y sesion.
  if (
    current
    && current.status === 'expired'
    && current.reason === 'game_assignment'
    && current.assetId === input.position.assetId
    && current.ownerNormalized === input.position.ownerNormalized
    && current.sessionId === input.position.assignmentSessionId
    && current.fencingToken === input.position.lockFencingToken + 1
    && current.expiresAt
    && current.expiresAt.getTime() <= input.now.getTime()
  ) {
    return cloneNftAssetLock(current);
  }
  if (
    !current
    || current.status !== 'active'
    || current.fencingToken !== input.position.lockFencingToken
    || !current.expiresAt
    || current.expiresAt.getTime() > input.now.getTime()
  ) {
    throw new StaleFenceError(`No se puede expirar el lock ${input.position.lockId}.`);
  }
  const resulting = {
    ...cloneNftAssetLock(current),
    status: 'expired' as const,
    fencingToken: incrementFencingToken(current.fencingToken),
    updatedAt: input.now,
    releaseReason: 'game_assignment_expired',
  };
  const replaced = await input.repository.compareAndSetActiveLock(
    current.lockId,
    current.fencingToken,
    resulting,
    { expiresAtLte: input.now },
  );
  if (!replaced) throw new StaleFenceError(`CAS obsoleto para ${current.lockId}.`);
  const event = buildNftAssetLockEvent({
    operation: 'expire',
    idempotencyKey,
    payloadHash,
    previous: current,
    resulting: replaced,
    actor: 'cukie-pool-service',
    reason: 'game_assignment_expired',
    timestamp: input.now,
  });
  await input.repository.insertEvent(event);
  await input.repository.enqueueRecalculation({
    idempotencyKey,
    walletNormalized: replaced.ownerNormalized,
    sourceEventId: event.eventId,
    reason: 'nft_lock_expire',
    availableAt: input.now,
  });
  return replaced;
}

function createDepositOperation(input: DepositCukiePoolPositionInput) {
  const walletNormalized = normalizePoolWallet(input.walletAddress);
  const assetId = requiredPoolText(input.assetId, 'assetId');
  const idempotencyKey = validPoolIdempotencyKey(input.idempotencyKey);
  return {
    walletNormalized,
    assetId,
    now: validPoolDate(input.now, 'now', new Date()),
    operation: {
      operation: 'deposit' as const,
      idempotencyKey,
      requestHash: stableCukiePoolHash({ operation: 'deposit', walletNormalized, assetId }),
    },
  };
}

function createDeposit(runner: CukiePoolTransactionRunner) {
  return async (input: DepositCukiePoolPositionInput) => {
    const normalized = createDepositOperation(input);
    return runIdempotent(
      runner,
      normalized.operation,
      async ({ repository, lockService }) => {
        const existingByKey = await repository.findPositionByIdempotencyKey(
          normalized.operation.idempotencyKey,
        );
        if (existingByKey) {
          assertCukiePoolPositionIntegrity(existingByKey);
          if (existingByKey.requestHash !== normalized.operation.requestHash) {
            throw new DomainConflictError('La idempotencyKey de deposito ya tiene otro payload.');
          }
          await repository.insertEvent(buildEvent({
            operation: normalized.operation,
            position: existingByKey,
            assignment: null,
            now: normalized.now,
          }));
          return clonePoolPosition(existingByKey);
        }
        const open = await repository.findOpenPositionByAssetId(normalized.assetId);
        if (open) {
          throw new DomainConflictError(`El asset ${normalized.assetId} ya tiene una posicion abierta.`);
        }

        const assetResult = assertDepositAsset(
          await repository.findWalletAsset(
            normalized.walletNormalized,
            normalized.assetId,
            normalized.now,
          ),
          normalized.walletNormalized,
          normalized.assetId,
        );
        const lock = await lockService.acquireNftAssetLock({
          assetId: normalized.assetId,
          ownerNormalized: normalized.walletNormalized,
          reason: 'pool_deposit',
          createdBy: 'cukie-pool-service',
          idempotencyKey: `cukie-pool:deposit-lock:${normalized.operation.idempotencyKey}`,
          now: normalized.now,
        });
        const positionId = stableCukiePoolHash({
          kind: 'cukie-pool-position',
          assetId: normalized.assetId,
          stakedAt: normalized.now,
          idempotencyKey: normalized.operation.idempotencyKey,
        });
        const quota = gamesQuota(assetResult.generation, assetResult.rarity);
        const position: CukiePoolPosition = {
          _id: positionId,
          positionId,
          assetId: normalized.assetId,
          tokenId: assetResult.asset.tokenId!,
          ownerNormalized: normalized.walletNormalized,
          generation: assetResult.generation,
          poolType: assetResult.generation,
          poolPriority: poolPriority(assetResult.generation),
          rarity: assetResult.rarity,
          gamesQuota: quota,
          gamesRemaining: quota,
          status: 'active',
          lifecycleOpen: true,
          stakedAt: normalized.now,
          eligibleAt: firstPoolEligibilityAt(normalized.now),
          lockId: lock.lockId,
          lockFencingToken: lock.fencingToken,
          idempotencyKey: normalized.operation.idempotencyKey,
          requestHash: normalized.operation.requestHash,
          revision: 0,
          createdAt: normalized.now,
          updatedAt: normalized.now,
        };
        assertCukiePoolPositionIntegrity(position);
        await repository.insertPosition(position);
        await repository.insertEvent(buildEvent({
          operation: normalized.operation,
          position,
          assignment: null,
          now: normalized.now,
        }));
        return clonePoolPosition(position);
      },
      (event) => {
        if (!event.resultingPosition) throw new DomainConflictError('Evento de deposito incompleto.');
        return clonePoolPosition(event.resultingPosition);
      },
    );
  };
}

function createWithdrawal(runner: CukiePoolTransactionRunner) {
  return async (input: RequestCukiePoolWithdrawalInput) => {
    const walletNormalized = normalizePoolWallet(input.walletAddress);
    const positionId = requiredPoolText(input.positionId, 'positionId');
    const expectedRevision = validPoolRevision(input.expectedRevision);
    const now = validPoolDate(input.now, 'now', new Date());
    const idempotencyKey = validPoolIdempotencyKey(input.idempotencyKey);
    const operation: IdempotentOperation = {
      operation: 'request_withdrawal',
      idempotencyKey,
      requestHash: stableCukiePoolHash({
        operation: 'request_withdrawal',
        walletNormalized,
        positionId,
        expectedRevision,
      }),
    };
    return runIdempotent(runner, operation, async ({ repository, lockService }) => {
      const current = await repository.findPosition(positionId);
      if (!current) throw new DomainNotFoundError(`No existe la posicion ${positionId}.`);
      assertCukiePoolPositionIntegrity(current);
      if (current.ownerNormalized !== walletNormalized) {
        throw new DomainNotFoundError(`No existe la posicion ${positionId} para esa wallet.`);
      }
      if (current.revision !== expectedRevision) {
        throw new StaleFenceError(`Revision obsoleta para ${positionId}.`);
      }
      if (!current.lifecycleOpen) {
        throw new DomainConflictError(`La posicion ${positionId} ya esta cerrada.`);
      }

      let replacement: CukiePoolPosition;
      if (current.status === 'assigned') {
        replacement = {
          ...clonePoolPosition(current),
          withdrawalRequestedAt: now,
          revision: current.revision + 1,
          updatedAt: now,
        };
      } else if (current.status === 'active') {
        const released = await lockService.releaseNftAssetLock({
          lockId: current.lockId,
          expectedFencingToken: current.lockFencingToken,
          actor: 'cukie-pool-service',
          releaseReason: 'owner_withdrawal',
          idempotencyKey: `cukie-pool:withdraw-lock:${idempotencyKey}`,
          now,
        });
        replacement = {
          ...clonePoolPosition(current),
          status: 'withdrawn',
          lifecycleOpen: false,
          lockFencingToken: released.fencingToken,
          withdrawalRequestedAt: now,
          withdrawnAt: now,
          closeReason: 'owner_withdrawal',
          revision: current.revision + 1,
          updatedAt: now,
        };
      } else {
        throw new DomainConflictError(`La posicion ${positionId} no se puede retirar.`);
      }
      const persisted = await repository.compareAndSetPosition(current, replacement);
      if (!persisted) throw new StaleFenceError(`CAS obsoleto para ${positionId}.`);
      await repository.insertEvent(buildEvent({
        operation,
        position: persisted,
        assignment: null,
        now,
      }));
      return clonePoolPosition(persisted);
    }, (event) => {
      if (!event.resultingPosition) throw new DomainConflictError('Evento de retirada incompleto.');
      return clonePoolPosition(event.resultingPosition);
    });
  };
}

function buildPoolAssignment(input: {
  sessionId: string;
  expiresAt: Date;
  idempotencyKey: string;
  requestHash: string;
  now: Date;
  position?: CukiePoolPosition;
  lockFencingToken?: number;
}): CukiePoolAssignment {
  const assignmentId = stableCukiePoolHash({ kind: 'cukie-pool-assignment', sessionId: input.sessionId });
  if (!input.position) {
    return {
      _id: assignmentId,
      assignmentId,
      sessionId: input.sessionId,
      kind: 'seiku',
      status: 'active',
      assetId: deterministicSeikuAssetId(input.sessionId),
      tokenId: null,
      positionId: null,
      ownerNormalized: null,
      generation: 'original',
      rarity: 'common',
      ownerRewardEligible: false,
      lockId: null,
      lockFencingToken: null,
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      assignedAt: input.now,
      expiresAt: input.expiresAt,
      revision: 0,
      updatedAt: input.now,
    };
  }
  return {
    _id: assignmentId,
    assignmentId,
    sessionId: input.sessionId,
    kind: 'pool_asset',
    status: 'active',
    assetId: input.position.assetId,
    tokenId: input.position.tokenId,
    positionId: input.position.positionId,
    ownerNormalized: input.position.ownerNormalized,
    generation: input.position.generation,
    rarity: input.position.rarity,
    ownerRewardEligible: input.now.getTime() >= input.position.eligibleAt.getTime(),
    lockId: input.position.lockId,
    lockFencingToken: input.lockFencingToken!,
    idempotencyKey: input.idempotencyKey,
    requestHash: input.requestHash,
    assignedAt: input.now,
    expiresAt: input.expiresAt,
    revision: 0,
    updatedAt: input.now,
  };
}

function createAssignment(runner: CukiePoolTransactionRunner) {
  return async (input: AssignCukiePoolSessionInput) => {
    const sessionId = requiredPoolText(input.sessionId, 'sessionId');
    const now = validPoolDate(input.now, 'now', new Date());
    const expiresAt = validPoolDate(input.expiresAt, 'expiresAt');
    if (expiresAt.getTime() <= now.getTime()) {
      throw new DomainValidationError('expiresAt debe estar en el futuro.');
    }
    const idempotencyKey = validPoolIdempotencyKey(input.idempotencyKey);
    const operation: IdempotentOperation = {
      operation: 'assign',
      idempotencyKey,
      requestHash: stableCukiePoolHash({ operation: 'assign', sessionId, expiresAt }),
    };
    return runIdempotent(runner, operation, async ({ repository, lockService }) => {
      const byKey = await repository.findAssignmentByIdempotencyKey(idempotencyKey);
      if (byKey) {
        if (byKey.requestHash !== operation.requestHash) {
          throw new DomainConflictError('La idempotencyKey de asignacion ya tiene otro payload.');
        }
        await repository.insertEvent(buildEvent({
          operation,
          position: byKey.positionId ? await repository.findPosition(byKey.positionId) : null,
          assignment: byKey,
          now,
        }));
        return clonePoolAssignment(byKey);
      }
      const bySession = await repository.findAssignmentBySessionId(sessionId);
      if (bySession) {
        if (bySession.requestHash !== operation.requestHash) {
          throw new DomainConflictError(`La session ${sessionId} ya tiene otra asignacion.`);
        }
        await repository.insertEvent(buildEvent({
          operation,
          position: bySession.positionId ? await repository.findPosition(bySession.positionId) : null,
          assignment: bySession,
          now,
        }));
        return clonePoolAssignment(bySession);
      }

      let cursor = undefined;
      while (true) {
        const page = await repository.listAssignablePositions(
          CUKIE_POOL_ASSIGNMENT_PAGE_SIZE,
          cursor,
        );
        if (page.length === 0) break;
        for (const candidate of page) {
          assignmentCursorFor(candidate);
          try {
            assertCukiePoolPositionIntegrity(candidate);
          } catch {
            continue;
          }
          const asset = await repository.findWalletAsset(
            candidate.ownerNormalized,
            candidate.assetId,
            now,
          );
          if (!assignmentAssetIsUsable(asset, candidate)) continue;

          const transitionedLock = await lockService.transitionNftAssetLock({
            lockId: candidate.lockId,
            expectedFencingToken: candidate.lockFencingToken,
            reason: 'game_assignment',
            actor: 'cukie-pool-service',
            idempotencyKey: `cukie-pool:assign-lock:${idempotencyKey}`,
            transitionReason: 'assigned_to_game_session',
            expiresAt,
            sessionId,
            now,
          });
          const replacement: CukiePoolPosition = {
            ...clonePoolPosition(candidate),
            status: 'assigned',
            gamesRemaining: candidate.gamesRemaining - 1,
            lockFencingToken: transitionedLock.fencingToken,
            assignmentSessionId: sessionId,
            assignmentExpiresAt: expiresAt,
            revision: candidate.revision + 1,
            updatedAt: now,
          };
          const claimed = await repository.compareAndSetPosition(candidate, replacement);
          if (!claimed) {
            throw new StaleFenceError(`La posicion ${candidate.positionId} fue asignada en paralelo.`);
          }
          const assignment = buildPoolAssignment({
            sessionId,
            expiresAt,
            idempotencyKey,
            requestHash: operation.requestHash,
            now,
            position: claimed,
            lockFencingToken: transitionedLock.fencingToken,
          });
          await repository.insertAssignment(assignment);
          await repository.insertEvent(buildEvent({
            operation,
            position: claimed,
            assignment,
            now,
          }));
          return clonePoolAssignment(assignment);
        }
        const last = page.at(-1)!;
        const nextCursor = assignmentCursorFor(last);
        const cursorAdvanced = !cursor
          || nextCursor.poolPriority > cursor.poolPriority
          || (
            nextCursor.poolPriority === cursor.poolPriority
            && (
              nextCursor.eligibleAt.getTime() > cursor.eligibleAt.getTime()
              || (
                nextCursor.eligibleAt.getTime() === cursor.eligibleAt.getTime()
                && (
                  nextCursor.stakedAt.getTime() > cursor.stakedAt.getTime()
                  || (
                    nextCursor.stakedAt.getTime() === cursor.stakedAt.getTime()
                    && nextCursor.documentId > cursor.documentId
                  )
                )
              )
            )
          );
        if (!cursorAdvanced) {
          throw new DomainConflictError(
            'La fuente del pool no avanzo su cursor; no se puede decidir Seiku con seguridad.',
          );
        }
        cursor = nextCursor;
        if (page.length < CUKIE_POOL_ASSIGNMENT_PAGE_SIZE) break;
      }
      const assignment = buildPoolAssignment({
        sessionId,
        expiresAt,
        idempotencyKey,
        requestHash: operation.requestHash,
        now,
      });
      await repository.insertAssignment(assignment);
      await repository.insertEvent(buildEvent({ operation, position: null, assignment, now }));
      return clonePoolAssignment(assignment);
    }, (event) => {
      if (!event.resultingAssignment) throw new DomainConflictError('Evento de asignacion incompleto.');
      return clonePoolAssignment(event.resultingAssignment);
    });
  };
}

type InternalReleaseInput = ReleaseCukiePoolAssignmentInput & {
  operation?: 'release' | 'expire';
  allowSystemIdempotency?: boolean;
  requireOrphanGameSession?: boolean;
};

function createRelease(runner: CukiePoolTransactionRunner) {
  return async (input: InternalReleaseInput) => {
    const sessionId = requiredPoolText(input.sessionId, 'sessionId');
    const expectedRevision = validPoolRevision(input.expectedRevision);
    const consumeGame = input.consumeGame;
    if (typeof consumeGame !== 'boolean') {
      throw new DomainValidationError('consumeGame debe ser booleano.');
    }
    const reason = requiredPoolText(input.reason, 'reason');
    const now = validPoolDate(input.now, 'now', new Date());
    const operationName = input.operation ?? 'release';
    const idempotencyKey = validPoolIdempotencyKey(
      input.idempotencyKey,
      input.allowSystemIdempotency === true,
    );
    const operation: IdempotentOperation = {
      operation: operationName,
      idempotencyKey,
      requestHash: stableCukiePoolHash({
        operation: operationName,
        sessionId,
        expectedRevision,
        consumeGame,
        reason,
      }),
    };
    return runIdempotent(runner, operation, async ({
      repository,
      lockService,
      lockRepository,
    }) => {
      const assignment = await repository.findAssignmentBySessionId(sessionId);
      if (!assignment) throw new DomainNotFoundError(`No existe asignacion para ${sessionId}.`);
      if (assignment.status !== 'active') {
        throw new DomainConflictError(`La asignacion ${assignment.assignmentId} ya esta cerrada.`);
      }
      if (assignment.revision !== expectedRevision) {
        throw new StaleFenceError(`Revision obsoleta para la asignacion ${assignment.assignmentId}.`);
      }
      if (
        input.requireOrphanGameSession
        && await repository.findGameSessionLifecycle(sessionId)
      ) {
        throw new DomainConflictError(
          `La sesion ${sessionId} pertenece a GameEconomy y solo su saga puede cerrarla.`,
        );
      }

      let resultingPosition: CukiePoolPosition | null = null;
      if (assignment.kind === 'pool_asset') {
        const position = await repository.findPosition(assignment.positionId!);
        if (!position) throw new DomainConflictError('La asignacion no tiene posicion persistida.');
        assertCukiePoolPositionIntegrity(position);
        if (
          position.status !== 'assigned'
          || position.assignmentSessionId !== sessionId
          || position.lockId !== assignment.lockId
          || position.lockFencingToken !== assignment.lockFencingToken
        ) {
          throw new DomainConflictError('La asignacion y la posicion no coinciden.');
        }

        const restoredGames = consumeGame
          ? position.gamesRemaining
          : position.gamesRemaining + 1;
        const mustClose = Boolean(position.withdrawalRequestedAt)
          || (consumeGame && restoredGames === 0);
        const expiredLock = assignment.expiresAt.getTime() <= now.getTime()
          ? await expireAssignedNftLock({ repository: lockRepository, position, now })
          : null;
        if (mustClose) {
          const releasedLock = expiredLock ?? await lockService.releaseNftAssetLock({
              lockId: position.lockId,
              expectedFencingToken: position.lockFencingToken,
              actor: 'cukie-pool-service',
              releaseReason: position.withdrawalRequestedAt
                ? 'withdrawal_after_assignment'
                : 'games_quota_exhausted',
              idempotencyKey: `cukie-pool:release-lock:${idempotencyKey}`,
              now,
            });
          const withdrawn = Boolean(position.withdrawalRequestedAt);
          resultingPosition = {
            ...clonePoolPosition(position),
            status: withdrawn ? 'withdrawn' : 'exhausted',
            lifecycleOpen: false,
            gamesRemaining: restoredGames,
            lockFencingToken: releasedLock.fencingToken,
            revision: position.revision + 1,
            updatedAt: now,
            ...(withdrawn
              ? { withdrawnAt: now, closeReason: 'withdrawal_after_assignment' }
              : { exhaustedAt: now, closeReason: 'games_quota_exhausted' }),
          };
        } else {
          const poolLock = expiredLock
            ? await lockService.acquireNftAssetLock({
                assetId: position.assetId,
                ownerNormalized: position.ownerNormalized,
                reason: 'pool_deposit',
                createdBy: 'cukie-pool-service',
                idempotencyKey: `cukie-pool:return-after-expiry:${idempotencyKey}`,
                now,
              })
            : await lockService.transitionNftAssetLock({
                lockId: position.lockId,
                expectedFencingToken: position.lockFencingToken,
                reason: 'pool_deposit',
                actor: 'cukie-pool-service',
                idempotencyKey: `cukie-pool:return-lock:${idempotencyKey}`,
                transitionReason: 'game_assignment_released',
                expiresAt: null,
                sessionId: null,
                now,
              });
          resultingPosition = {
            ...clonePoolPosition(position),
            status: 'active',
            gamesRemaining: restoredGames,
            lockId: poolLock.lockId,
            lockFencingToken: poolLock.fencingToken,
            revision: position.revision + 1,
            updatedAt: now,
          };
          delete resultingPosition.assignmentSessionId;
          delete resultingPosition.assignmentExpiresAt;
        }
        const persistedPosition = await repository.compareAndSetPosition(
          position,
          resultingPosition,
        );
        if (!persistedPosition) {
          throw new StaleFenceError(`CAS obsoleto para ${position.positionId}.`);
        }
        resultingPosition = persistedPosition;
      }

      const resultingAssignment: CukiePoolAssignment = {
        ...clonePoolAssignment(assignment),
        status: operationName === 'expire'
          ? 'expired'
          : consumeGame
            ? 'completed'
            : 'released',
        revision: assignment.revision + 1,
        updatedAt: now,
        releasedAt: now,
        releaseReason: reason,
      };
      const persistedAssignment = await repository.compareAndSetAssignment(
        assignment,
        resultingAssignment,
      );
      if (!persistedAssignment) {
        throw new StaleFenceError(`CAS obsoleto para ${assignment.assignmentId}.`);
      }
      await repository.insertEvent(buildEvent({
        operation,
        position: resultingPosition,
        assignment: persistedAssignment,
        now,
      }));
      return clonePoolAssignment(persistedAssignment);
    }, (event) => {
      if (!event.resultingAssignment) throw new DomainConflictError('Evento de release incompleto.');
      return clonePoolAssignment(event.resultingAssignment);
    });
  };
}

function createExpiry(
  runner: CukiePoolTransactionRunner,
  release: ReturnType<typeof createRelease>,
) {
  return async (
    input: ExpireCukiePoolAssignmentsInput = {},
  ): Promise<ExpireCukiePoolAssignmentsResult> => {
    const now = validPoolDate(input.now, 'now', new Date());
    const limit = validPoolLimit(input.limit);
    const actor = requiredPoolText(input.actor ?? 'cukie-pool-expirer', 'actor');
    const candidates = await runner(({ repository }) => (
      repository.listExpiredAssignments(now, limit)
    ));
    let expired = 0;
    let skipped = 0;
    for (const candidate of candidates) {
      try {
        await release({
          sessionId: candidate.sessionId,
          expectedRevision: candidate.revision,
          consumeGame: false,
          reason: `assignment_expired:${actor}`,
          idempotencyKey: `${CUKIE_POOL_SYSTEM_IDEMPOTENCY_PREFIX}expire:${candidate.assignmentId}:${candidate.revision}`,
          now,
          operation: 'expire',
          allowSystemIdempotency: true,
          requireOrphanGameSession: true,
        });
        expired += 1;
      } catch (error) {
        if (
          error instanceof DomainConflictError
          || error instanceof StaleFenceError
          || error instanceof DomainNotFoundError
        ) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
    return { scanned: candidates.length, expired, skipped };
  };
}

export function lockMatchesOpenPoolPosition(
  position: CukiePoolPosition,
  lock: Awaited<ReturnType<NftAssetLockRepository['findLockById']>>,
) {
  if (
    !lock
    || lock.status !== 'active'
    || lock.lockId !== position.lockId
    || lock.assetId !== position.assetId
    || lock.ownerNormalized !== position.ownerNormalized
    || lock.fencingToken !== position.lockFencingToken
  ) return false;

  if (position.status === 'active') {
    return lock.reason === 'pool_deposit'
      && lock.sessionId === undefined
      && lock.expiresAt === undefined
      && position.assignmentSessionId === undefined
      && position.assignmentExpiresAt === undefined;
  }

  return position.status === 'assigned'
    && lock.reason === 'game_assignment'
    && lock.sessionId === position.assignmentSessionId
    && Boolean(lock.expiresAt)
    && Boolean(position.assignmentExpiresAt)
    && lock.expiresAt!.getTime() === position.assignmentExpiresAt!.getTime();
}

function createPositionReconciliation(runner: CukiePoolTransactionRunner) {
  return async (
    input: ReconcileCukiePoolPositionsInput = {},
  ): Promise<ReconcileCukiePoolPositionsResult> => {
    const now = validPoolDate(input.now, 'now', new Date());
    const limit = validPoolLimit(input.limit);
    const actor = requiredPoolText(input.actor ?? 'cukie-pool-reconciler', 'actor');
    const afterPositionId = input.afterPositionId === undefined
      ? undefined
      : requiredPoolText(input.afterPositionId, 'afterPositionId');
    const candidates = await runner(({ repository }) => (
      repository.listOpenPositions(limit, afterPositionId)
    ));
    let invalidated = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const changed = await runner(async ({ repository, lockRepository }) => {
        const current = await repository.findPosition(candidate.positionId);
        if (!current || !current.lifecycleOpen) return false;
        assertCukiePoolPositionIntegrity(current);
        const lock = await lockRepository.findLockById(current.lockId);
        if (lockMatchesOpenPoolPosition(current, lock)) return false;

        const operation: IdempotentOperation = {
          operation: 'invalidate',
          idempotencyKey: `${CUKIE_POOL_SYSTEM_IDEMPOTENCY_PREFIX}invalidate:${current.positionId}:${current.revision}`,
          requestHash: stableCukiePoolHash({
            operation: 'invalidate',
            positionId: current.positionId,
            revision: current.revision,
            lockId: current.lockId,
            lockFencingToken: current.lockFencingToken,
          }),
        };
        const prior = await repository.findEventByIdempotencyKey(operation.idempotencyKey);
        if (prior) {
          assertEventMatches(prior, operation);
          return false;
        }

        let resultingAssignment: CukiePoolAssignment | null = null;
        if (current.assignmentSessionId) {
          const assignment = await repository.findAssignmentBySessionId(
            current.assignmentSessionId,
          );
          if (
            assignment
            && assignment.status === 'active'
            && assignment.positionId === current.positionId
            && assignment.lockId === current.lockId
          ) {
            const replacement: CukiePoolAssignment = {
              ...clonePoolAssignment(assignment),
              status: 'released',
              revision: assignment.revision + 1,
              updatedAt: now,
              releasedAt: now,
              releaseReason: `pool_position_invalidated:${actor}`,
            };
            resultingAssignment = await repository.compareAndSetAssignment(
              assignment,
              replacement,
            );
            if (!resultingAssignment) {
              throw new StaleFenceError(
                `CAS obsoleto para la asignacion ${assignment.assignmentId}.`,
              );
            }
          }
        }

        const replacement: CukiePoolPosition = {
          ...clonePoolPosition(current),
          status: 'invalidated',
          lifecycleOpen: false,
          invalidatedAt: now,
          closeReason: `lock_reconciliation:${actor}`,
          revision: current.revision + 1,
          updatedAt: now,
        };
        const resultingPosition = await repository.compareAndSetPosition(current, replacement);
        if (!resultingPosition) {
          throw new StaleFenceError(`CAS obsoleto para ${current.positionId}.`);
        }
        await repository.insertEvent(buildEvent({
          operation,
          position: resultingPosition,
          assignment: resultingAssignment,
          now,
        }));
        return true;
      });
      if (changed) invalidated += 1;
      else skipped += 1;
    }

    return {
      scanned: candidates.length,
      invalidated,
      skipped,
      nextCursor: candidates.length === limit ? candidates.at(-1)!.positionId : null,
    };
  };
}

export function createCukiePoolService(runner: CukiePoolTransactionRunner) {
  const releaseCukiePoolAssignment = createRelease(runner);
  return {
    depositCukiePoolPosition: createDeposit(runner),
    requestCukiePoolWithdrawal: createWithdrawal(runner),
    assignCukiePoolSession: createAssignment(runner),
    releaseCukiePoolAssignment,
    expireCukiePoolAssignments: createExpiry(runner, releaseCukiePoolAssignment),
    reconcileCukiePoolPositions: createPositionReconciliation(runner),
  };
}

const legacyDefaultService = createCukiePoolService(mongoCukiePoolTransactionRunner);

function configuredPoolMode() {
  return ukiNftVaults.mode.cukiePool;
}

function requireLegacyMutationMode() {
  const mode = configuredPoolMode();
  if (mode === 'invalid') {
    throw new SchemaNotReadyError('La configuracion de CukiePoolNftVault es invalida.');
  }
  if (mode === 'custodial') {
    throw new DomainConflictError(
      'Los depositos y retiradas custodiales se ejecutan directamente contra CukiePoolNftVault.',
    );
  }
}

export async function depositCukiePoolPosition(input: DepositCukiePoolPositionInput) {
  requireLegacyMutationMode();
  return legacyDefaultService.depositCukiePoolPosition(input);
}

export async function requestCukiePoolWithdrawal(input: RequestCukiePoolWithdrawalInput) {
  requireLegacyMutationMode();
  return legacyDefaultService.requestCukiePoolWithdrawal(input);
}

export async function assignCukiePoolSession(input: AssignCukiePoolSessionInput) {
  const mode = configuredPoolMode();
  if (mode === 'invalid') {
    throw new SchemaNotReadyError('La configuracion de CukiePoolNftVault es invalida.');
  }
  if (mode === 'custodial') {
    const { cukiePoolVaultAssignmentService } = await import('./vault-assignment');
    return cukiePoolVaultAssignmentService.assignCukiePoolSession(input);
  }
  return legacyDefaultService.assignCukiePoolSession(input);
}

async function assignmentUsesCustodialVault(sessionId: string) {
  const { getEconomyDb } = await import('@/lib/indexer-db/mongodb');
  const db = await getEconomyDb();
  const assignment = await db.collection<CukiePoolAssignment>('cukie_pool_assignments')
    .findOne({ sessionId }, { projection: { custodyMode: 1 } });
  return assignment?.custodyMode === 'custodial';
}

export async function releaseCukiePoolAssignment(input: ReleaseCukiePoolAssignmentInput) {
  if (await assignmentUsesCustodialVault(input.sessionId)) {
    const { cukiePoolVaultAssignmentService } = await import('./vault-assignment');
    return cukiePoolVaultAssignmentService.releaseCukiePoolAssignment(input);
  }
  return legacyDefaultService.releaseCukiePoolAssignment(input);
}

export async function expireCukiePoolAssignments(
  input: ExpireCukiePoolAssignmentsInput = {},
): Promise<ExpireCukiePoolAssignmentsResult> {
  const mode = configuredPoolMode();
  if (mode === 'invalid') {
    throw new SchemaNotReadyError('La configuracion de CukiePoolNftVault es invalida.');
  }
  const legacy = await legacyDefaultService.expireCukiePoolAssignments(input);
  if (mode !== 'custodial') return legacy;
  const { cukiePoolVaultAssignmentService } = await import('./vault-assignment');
  const custodial = await cukiePoolVaultAssignmentService.expireCukiePoolAssignments(input);
  return {
    scanned: legacy.scanned + custodial.scanned,
    expired: legacy.expired + custodial.expired,
    skipped: legacy.skipped + custodial.skipped,
  };
}

export const reconcileCukiePoolPositions = legacyDefaultService.reconcileCukiePoolPositions;
