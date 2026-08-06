import type {
  NftAssetLockDocument,
  NftAssetLockEventDocument,
} from '@/lib/nft-inventory/lock-types';
import type { NftCanonicalState } from '@/lib/nft-inventory';
import type { NftAssetLockRepository } from '@/lib/nft-inventory/lock-repository';
import { createNftAssetLockService } from '@/lib/nft-inventory/locks';

import { createCukiePoolService } from './service';
import {
  clonePoolAssignment,
  clonePoolPosition,
} from './rules';
import type {
  CukiePoolAssignment,
  CukiePoolAssignmentCursor,
  CukiePoolAssetSnapshot,
  CukiePoolEvent,
  CukiePoolGameSessionLifecycle,
  CukiePoolPosition,
} from './types';
import type {
  CukiePoolRepository,
  CukiePoolTransactionRunner,
} from './repository';

function cloneLock(lock: NftAssetLockDocument): NftAssetLockDocument {
  return {
    ...lock,
    createdAt: new Date(lock.createdAt),
    updatedAt: new Date(lock.updatedAt),
    ...(lock.expiresAt ? { expiresAt: new Date(lock.expiresAt) } : {}),
  };
}

function cloneLockEvent(event: NftAssetLockEventDocument): NftAssetLockEventDocument {
  return {
    ...event,
    timestamp: new Date(event.timestamp),
    createdAt: new Date(event.createdAt),
    resultingLock: cloneLock(event.resultingLock),
  };
}

function cloneAsset(asset: CukiePoolAssetSnapshot): CukiePoolAssetSnapshot {
  return {
    ...asset,
    blockers: [...asset.blockers],
    activeLocks: asset.activeLocks.map((lock) => ({ ...lock })),
    sourceRefs: asset.sourceRefs.map((ref) => ({ ...ref })),
  };
}

function cloneEvent(event: CukiePoolEvent): CukiePoolEvent {
  return {
    ...event,
    createdAt: new Date(event.createdAt),
    resultingPosition: event.resultingPosition
      ? clonePoolPosition(event.resultingPosition)
      : null,
    resultingAssignment: event.resultingAssignment
      ? clonePoolAssignment(event.resultingAssignment)
      : null,
  };
}

function positionAfterCursor(
  position: CukiePoolPosition,
  after?: CukiePoolAssignmentCursor,
) {
  if (!after) return true;
  return (
    position.poolPriority > after.poolPriority
    || (
      position.poolPriority === after.poolPriority
      && (
        position.eligibleAt.getTime() > after.eligibleAt.getTime()
        || (
          position.eligibleAt.getTime() === after.eligibleAt.getTime()
          && (
            position.stakedAt.getTime() > after.stakedAt.getTime()
            || (
              position.stakedAt.getTime() === after.stakedAt.getTime()
              && position._id.localeCompare(after.documentId) > 0
            )
          )
        )
      )
    )
  );
}

function comparePositions(left: CukiePoolPosition, right: CukiePoolPosition) {
  return left.poolPriority - right.poolPriority
    || left.eligibleAt.getTime() - right.eligibleAt.getTime()
    || left.stakedAt.getTime() - right.stakedAt.getTime()
    || left._id.localeCompare(right._id);
}

type MemoryState = {
  assets: Map<string, CukiePoolAssetSnapshot>;
  positions: Map<string, CukiePoolPosition>;
  assignments: Map<string, CukiePoolAssignment>;
  events: Map<string, CukiePoolEvent>;
  locks: Map<string, NftAssetLockDocument>;
  lockEvents: Map<string, NftAssetLockEventDocument>;
  gameSessions: Map<string, CukiePoolGameSessionLifecycle>;
};

function cloneState(state: MemoryState): MemoryState {
  return {
    assets: new Map(Array.from(state.assets, ([key, value]) => [key, cloneAsset(value)])),
    positions: new Map(
      Array.from(state.positions, ([key, value]) => [key, clonePoolPosition(value)]),
    ),
    assignments: new Map(
      Array.from(state.assignments, ([key, value]) => [key, clonePoolAssignment(value)]),
    ),
    events: new Map(Array.from(state.events, ([key, value]) => [key, cloneEvent(value)])),
    locks: new Map(Array.from(state.locks, ([key, value]) => [key, cloneLock(value)])),
    lockEvents: new Map(
      Array.from(state.lockEvents, ([key, value]) => [key, cloneLockEvent(value)]),
    ),
    gameSessions: new Map(
      Array.from(state.gameSessions, ([key, value]) => [key, { ...value }]),
    ),
  };
}

function duplicateKey(): never {
  throw { code: 11000 };
}

export class MemoryCukiePoolRepository
implements CukiePoolRepository {
  constructor(readonly state: MemoryState) {}

  async findWalletAsset(
    ownerNormalized: string,
    assetId: string,
    now: Date,
  ): Promise<CukiePoolAssetSnapshot | null> {
    const source = this.state.assets.get(assetId);
    if (!source || source.ownerNormalized !== ownerNormalized) return null;
    const activeLocks = Array.from(this.state.locks.values()).filter((lock) => (
      lock.assetId === assetId
      && lock.status === 'active'
      && (!lock.expiresAt || lock.expiresAt.getTime() > now.getTime())
    ));
    const lockStates = activeLocks.map((lock) => {
      if (lock.reason === 'game_assignment') return 'assigned_to_game' as const;
      if (lock.reason === 'pool_deposit') return 'in_pool' as const;
      if (lock.reason === 'soft_stake') return 'soft_staked' as const;
      return 'unknown' as const;
    });
    const precedence = [
      'invalidated',
      'unknown',
      'bridging',
      'assigned_to_game',
      'listed',
      'in_pool',
      'soft_staked',
      'available',
    ] as const;
    const states = [source.canonicalState, ...lockStates];
    const canonicalState = precedence.find((state) => states.includes(state)) ?? 'unknown';
    return {
      ...cloneAsset(source),
      canonicalState,
      activeLocks: activeLocks.map((lock) => {
        const state: NftCanonicalState = lock.reason === 'game_assignment'
          ? 'assigned_to_game'
          : lock.reason === 'pool_deposit'
            ? 'in_pool'
            : lock.reason === 'soft_stake'
              ? 'soft_staked'
              : 'unknown';
        return {
          lockId: lock.lockId,
          assetId: lock.assetId,
          ownerNormalized: lock.ownerNormalized,
          reason: lock.reason,
          state,
        };
      }),
    };
  }

  async findEventByIdempotencyKey(idempotencyKey: string) {
    const value = Array.from(this.state.events.values()).find(
      (event) => event.idempotencyKey === idempotencyKey,
    );
    return value ? cloneEvent(value) : null;
  }

  async insertEvent(event: CukiePoolEvent) {
    if (Array.from(this.state.events.values()).some((candidate) => (
      candidate.eventId === event.eventId
      || candidate.idempotencyKey === event.idempotencyKey
    ))) duplicateKey();
    this.state.events.set(event.eventId, cloneEvent(event));
  }

  async findPosition(positionId: string) {
    const value = this.state.positions.get(positionId);
    return value ? clonePoolPosition(value) : null;
  }

  async findOpenPositionByAssetId(assetId: string) {
    const value = Array.from(this.state.positions.values()).find(
      (position) => position.assetId === assetId && position.lifecycleOpen,
    );
    return value ? clonePoolPosition(value) : null;
  }

  async findPositionByIdempotencyKey(idempotencyKey: string) {
    const value = Array.from(this.state.positions.values()).find(
      (position) => position.idempotencyKey === idempotencyKey,
    );
    return value ? clonePoolPosition(value) : null;
  }

  async listOpenPositions(limit: number, afterPositionId?: string) {
    return Array.from(this.state.positions.values())
      .filter((position) => (
        position.lifecycleOpen
        && (!afterPositionId || position.positionId > afterPositionId)
      ))
      .sort((left, right) => left.positionId.localeCompare(right.positionId))
      .slice(0, limit)
      .map(clonePoolPosition);
  }

  async insertPosition(position: CukiePoolPosition) {
    if (
      this.state.positions.has(position.positionId)
      || Array.from(this.state.positions.values()).some((candidate) => (
        candidate.idempotencyKey === position.idempotencyKey
        || (candidate.assetId === position.assetId && candidate.lifecycleOpen)
        || candidate.lockId === position.lockId
      ))
    ) duplicateKey();
    this.state.positions.set(position.positionId, clonePoolPosition(position));
  }

  async compareAndSetPosition(
    current: CukiePoolPosition,
    replacement: CukiePoolPosition,
  ) {
    const stored = this.state.positions.get(current.positionId);
    if (
      !stored
      || stored.revision !== current.revision
      || stored.status !== current.status
      || stored.lifecycleOpen !== current.lifecycleOpen
      || stored.gamesRemaining !== current.gamesRemaining
      || stored.lockId !== current.lockId
      || stored.lockFencingToken !== current.lockFencingToken
      || stored.assignmentSessionId !== current.assignmentSessionId
      || stored.assignmentExpiresAt?.getTime() !== current.assignmentExpiresAt?.getTime()
      || stored.withdrawalRequestedAt?.getTime() !== current.withdrawalRequestedAt?.getTime()
    ) return null;
    this.state.positions.set(replacement.positionId, clonePoolPosition(replacement));
    return clonePoolPosition(replacement);
  }

  async listAssignablePositions(
    limit: number,
    after?: CukiePoolAssignmentCursor,
  ) {
    return Array.from(this.state.positions.values())
      .filter((position) => (
        position.status === 'active'
        && position.lifecycleOpen
        && position.gamesRemaining > 0
        && !position.withdrawalRequestedAt
        && positionAfterCursor(position, after)
      ))
      .sort(comparePositions)
      .slice(0, limit)
      .map(clonePoolPosition);
  }

  async findAssignmentBySessionId(sessionId: string) {
    const value = Array.from(this.state.assignments.values()).find(
      (assignment) => assignment.sessionId === sessionId,
    );
    return value ? clonePoolAssignment(value) : null;
  }

  async findAssignmentByIdempotencyKey(idempotencyKey: string) {
    const value = Array.from(this.state.assignments.values()).find(
      (assignment) => assignment.idempotencyKey === idempotencyKey,
    );
    return value ? clonePoolAssignment(value) : null;
  }

  async insertAssignment(assignment: CukiePoolAssignment) {
    if (
      this.state.assignments.has(assignment.assignmentId)
      || Array.from(this.state.assignments.values()).some((candidate) => (
        candidate.sessionId === assignment.sessionId
        || candidate.idempotencyKey === assignment.idempotencyKey
      ))
    ) duplicateKey();
    this.state.assignments.set(assignment.assignmentId, clonePoolAssignment(assignment));
  }

  async compareAndSetAssignment(
    current: CukiePoolAssignment,
    replacement: CukiePoolAssignment,
  ) {
    const stored = this.state.assignments.get(current.assignmentId);
    if (
      !stored
      || stored.revision !== current.revision
      || stored.status !== current.status
      || stored.expiresAt.getTime() !== current.expiresAt.getTime()
    ) return null;
    this.state.assignments.set(replacement.assignmentId, clonePoolAssignment(replacement));
    return clonePoolAssignment(replacement);
  }

  async listExpiredAssignments(now: Date, limit: number) {
    return Array.from(this.state.assignments.values())
      .filter((assignment) => (
        assignment.status === 'active' && assignment.expiresAt.getTime() <= now.getTime()
      ))
      .sort((left, right) => (
        left.expiresAt.getTime() - right.expiresAt.getTime()
        || left.assignmentId.localeCompare(right.assignmentId)
      ))
      .slice(0, limit)
      .map(clonePoolAssignment);
  }

  async findGameSessionLifecycle(sessionId: string) {
    const value = this.state.gameSessions.get(sessionId);
    return value ? { ...value } : null;
  }

  async findLockById(lockId: string) {
    const value = this.state.locks.get(lockId);
    return value ? cloneLock(value) : null;
  }

  async findLockByIdempotencyKey(idempotencyKey: string) {
    const value = Array.from(this.state.locks.values()).find(
      (lock) => lock.idempotencyKey === idempotencyKey,
    );
    return value ? cloneLock(value) : null;
  }

  async findEventByIdempotencyKeyForLock(idempotencyKey: string) {
    const value = Array.from(this.state.lockEvents.values()).find(
      (event) => event.idempotencyKey === idempotencyKey,
    );
    return value ? cloneLockEvent(value) : null;
  }

  async findActiveLockByAssetId(assetId: string) {
    const value = Array.from(this.state.locks.values()).find(
      (lock) => lock.assetId === assetId && lock.status === 'active',
    );
    return value ? cloneLock(value) : null;
  }

  async findExpiredActiveLocks(
    now: Date,
    limit: number,
    excludeReasons: NftAssetLockDocument['reason'][] = [],
  ) {
    return Array.from(this.state.locks.values())
      .filter((lock) => (
        lock.status === 'active'
        && Boolean(lock.expiresAt)
        && lock.expiresAt!.getTime() <= now.getTime()
        && !excludeReasons.includes(lock.reason)
      ))
      .sort((left, right) => (
        left.expiresAt!.getTime() - right.expiresAt!.getTime()
        || left.lockId.localeCompare(right.lockId)
      ))
      .slice(0, limit)
      .map(cloneLock);
  }

  async insertLock(lock: NftAssetLockDocument) {
    if (
      this.state.locks.has(lock.lockId)
      || Array.from(this.state.locks.values()).some((candidate) => (
        candidate.idempotencyKey === lock.idempotencyKey
        || (candidate.assetId === lock.assetId && candidate.status === 'active')
      ))
    ) duplicateKey();
    this.state.locks.set(lock.lockId, cloneLock(lock));
  }

  async compareAndSetActiveLock(
    lockId: string,
    expectedFencingToken: number,
    replacement: NftAssetLockDocument,
    options?: { expiresAtLte?: Date; notExpiredAt?: Date },
  ) {
    const current = this.state.locks.get(lockId);
    if (
      !current
      || current.status !== 'active'
      || current.fencingToken !== expectedFencingToken
      || (
        options?.expiresAtLte
        && (!current.expiresAt || current.expiresAt.getTime() > options.expiresAtLte.getTime())
      )
      || (
        options?.notExpiredAt
        && current.expiresAt
        && current.expiresAt.getTime() <= options.notExpiredAt.getTime()
      )
    ) return null;
    this.state.locks.set(lockId, cloneLock(replacement));
    return cloneLock(replacement);
  }

  async insertLockEvent(event: NftAssetLockEventDocument) {
    if (Array.from(this.state.lockEvents.values()).some((candidate) => (
      candidate.eventId === event.eventId
      || candidate.idempotencyKey === event.idempotencyKey
    ))) duplicateKey();
    this.state.lockEvents.set(event.eventId, cloneLockEvent(event));
  }

  async enqueueRecalculation() {}
}

export function createMemoryCukiePoolHarness(
  assets: CukiePoolAssetSnapshot[] = [],
) {
  let state: MemoryState = {
    assets: new Map(assets.map((asset) => [asset.assetId, cloneAsset(asset)])),
    positions: new Map(),
    assignments: new Map(),
    events: new Map(),
    locks: new Map(),
    lockEvents: new Map(),
    gameSessions: new Map(),
  };
  let tail: Promise<unknown> = Promise.resolve();

  const runner: CukiePoolTransactionRunner = (work) => {
    const execute = async () => {
      const before = cloneState(state);
      const repository = new MemoryCukiePoolRepository(state);
      const lockRepository: NftAssetLockRepository = {
        findLockById: repository.findLockById.bind(repository),
        findLockByIdempotencyKey: repository.findLockByIdempotencyKey.bind(repository),
        findEventByIdempotencyKey: repository.findEventByIdempotencyKeyForLock.bind(repository),
        findActiveLockByAssetId: repository.findActiveLockByAssetId.bind(repository),
        findExpiredActiveLocks: repository.findExpiredActiveLocks.bind(repository),
        insertLock: repository.insertLock.bind(repository),
        compareAndSetActiveLock: repository.compareAndSetActiveLock.bind(repository),
        insertEvent: repository.insertLockEvent.bind(repository),
        enqueueRecalculation: repository.enqueueRecalculation.bind(repository),
      };
      try {
        return await work({
          repository,
          lockService: createNftAssetLockService((lockWork) => lockWork(lockRepository)),
          lockRepository,
        });
      } catch (error) {
        state = before;
        throw error;
      }
    };
    const result = tail.then(execute, execute);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    runner,
    service: createCukiePoolService(runner),
    setGameSessionLifecycle(
      sessionId: string,
      lifecycle: Partial<CukiePoolGameSessionLifecycle> = {},
    ) {
      state.gameSessions.set(sessionId, {
        sessionId,
        status: lifecycle.status ?? 'started',
        revision: lifecycle.revision ?? 0,
        hasSettlementIntent: lifecycle.hasSettlementIntent ?? false,
        terminalIntentStatus: lifecycle.terminalIntentStatus ?? null,
        terminalStatus: lifecycle.terminalStatus ?? null,
      });
    },
    get state() {
      return state;
    },
  };
}
