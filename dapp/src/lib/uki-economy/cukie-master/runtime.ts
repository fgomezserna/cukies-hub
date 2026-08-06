import 'server-only';

import { randomUUID } from 'node:crypto';

import type { ClientSession, Db, Filter, Sort } from 'mongodb';

import { getEconomyDb, withEconomyTransaction } from '@/lib/indexer-db/mongodb';
import {
  expireNftAssetLocks,
  invalidateNftAssetLockForIntegrity,
  invalidateNftAssetLockForOwnership,
} from '@/lib/nft-inventory/locks';
import {
  expireCukiePoolAssignments,
  reconcileCukiePoolPositions,
} from '@/lib/uki-economy/cukie-pool/service';

import {
  activateMaturedCukieMasterPositions,
  closeRequirementGraceBatch,
  promoteCukieMasterWaitlist,
  type CloseRequirementGraceCursor,
  type PromoteWaitlistCursor,
} from './jobs';
import {
  CUKIE_MASTER_COMPLETED_JOB_RETENTION_MS,
  CUKIE_MASTER_RUNTIME_RUN_RETENTION_MS,
  FULL_RECONCILIATION_SOURCES,
  NFT_OWNERSHIP_CURSOR_SORT,
  cukiesAssetFilter,
  evaluateNftOwnership,
  fullReconciliationCycleId,
  fullReconciliationJobId,
  fullReconciliationSourceFilter,
  nftOwnershipCursorFilter,
  normalizedWalletsFromSourcePage,
  parseCukiesAssetLookup,
  runtimeRouteBinding,
  sameRuntimeRouteBinding,
  type RuntimeRouteBinding,
} from './runtime-policy';
import { createMongoCukieMasterRepository } from './repository';
import { recalculateCukieMasterWallet } from './service';
import {
  recalculationFenceFilter,
  recalculationRetryBackoffMs,
  type CukieMasterRecalculationJob,
} from './runtime-queue';
import type { CukieMasterRouteRound } from './types';

const QUEUE_COLLECTION = 'cukie_master_recalculation_jobs';
const RUNS_COLLECTION = 'cukie_master_runtime_runs';
const STATE_COLLECTION = 'cukie_master_runtime_state';
const GLOBAL_LEASE_ID = 'runtime-tick-lease';
const OWNERSHIP_STATE_ID = 'nft-lock-ownership-reconciliation';
const POOL_POSITION_STATE_ID = 'cukie-pool-position-reconciliation';
const FULL_RECONCILIATION_STATE_ID = 'full-reconciliation';
const FULL_RECONCILIATION_INTERVAL_MS = 24 * 60 * 60_000;
const DEFAULT_TICK_TIMEOUT_MS = 300_000;
const MINIMUM_TICK_LEASE_MS = 10 * 60_000;
const LEASE_SAFETY_MARGIN_MS = 60_000;
const OWNERSHIP_BATCH_SIZE = 100;
const FULL_RECONCILIATION_BATCH_SIZE = 200;

type StringIdDocument = { _id: string } & Record<string, unknown>;
type RuntimeStateDocument = StringIdDocument & {
  stateRevision?: number;
  runtimeFenceToken?: number;
  createdAt?: Date;
  updatedAt?: Date;
};
type RuntimeLeaseDocument = {
  _id: string;
  leasedBy?: string;
  fenceToken: number;
  leaseExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
type RuntimeLease = {
  _id: typeof GLOBAL_LEASE_ID;
  leasedBy: string;
  fenceToken: number;
  leaseExpiresAt: Date;
};
type RuntimeClock = () => Date;

export class CukieMasterRuntimeBusyError extends Error {
  constructor() {
    super('Ya existe un tick Cukie Master con lease activo.');
    this.name = 'CukieMasterRuntimeBusyError';
  }
}

function validClockDate(clock: RuntimeClock) {
  const now = clock();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('El reloj del runtime Cukie Master devolvio una fecha invalida.');
  }
  return new Date(now.getTime());
}

function boundedEnvironmentInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} debe ser un entero positivo.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} debe estar entre ${minimum} y ${maximum}.`);
  }
  return value;
}

function runtimeLeaseMs() {
  const timeoutMs = boundedEnvironmentInteger(
    'CUKIE_MASTER_TICK_TIMEOUT_MS',
    DEFAULT_TICK_TIMEOUT_MS,
    10_000,
    600_000,
  );
  const fallback = Math.max(MINIMUM_TICK_LEASE_MS, timeoutMs + LEASE_SAFETY_MARGIN_MS);
  return boundedEnvironmentInteger(
    'CUKIE_MASTER_TICK_LEASE_MS',
    fallback,
    timeoutMs + LEASE_SAFETY_MARGIN_MS,
    60 * 60_000,
  );
}

async function acquireRuntimeLease(
  db: Db,
  workerId: string,
  now: Date,
  leaseMs: number,
): Promise<RuntimeLease> {
  const states = db.collection<RuntimeLeaseDocument>(STATE_COLLECTION);
  await states.updateOne(
    { _id: GLOBAL_LEASE_ID },
    {
      $setOnInsert: {
        _id: GLOBAL_LEASE_ID,
        fenceToken: 0,
        leaseExpiresAt: new Date(0),
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  const leaseOwner = `${workerId}:${randomUUID()}`;
  const lease = await states.findOneAndUpdate(
    {
      _id: GLOBAL_LEASE_ID,
      $or: [
        { leaseExpiresAt: { $lte: now } },
        { leaseExpiresAt: { $exists: false } },
      ],
    },
    {
      $set: {
        leasedBy: leaseOwner,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        updatedAt: now,
      },
      $inc: { fenceToken: 1 },
    },
    { returnDocument: 'after' },
  );
  if (
    !lease
    || typeof lease.leasedBy !== 'string'
    || !Number.isSafeInteger(lease.fenceToken)
    || !(lease.leaseExpiresAt instanceof Date)
  ) {
    throw new CukieMasterRuntimeBusyError();
  }
  return {
    _id: GLOBAL_LEASE_ID,
    leasedBy: lease.leasedBy,
    fenceToken: Number(lease.fenceToken),
    leaseExpiresAt: lease.leaseExpiresAt,
  };
}

async function renewRuntimeLease(db: Db, lease: RuntimeLease, now: Date, leaseMs: number) {
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const result = await db.collection<RuntimeLeaseDocument>(STATE_COLLECTION).updateOne(
    {
      _id: GLOBAL_LEASE_ID,
      leasedBy: lease.leasedBy,
      fenceToken: lease.fenceToken,
      leaseExpiresAt: { $gt: now },
    },
    { $set: { leaseExpiresAt, updatedAt: now } },
  );
  if (result.matchedCount !== 1) throw new Error('CUKIE_MASTER_STALE_RUNTIME_FENCE');
  lease.leaseExpiresAt = leaseExpiresAt;
}

async function releaseRuntimeLease(db: Db, lease: RuntimeLease, now: Date) {
  await db.collection<RuntimeLeaseDocument>(STATE_COLLECTION).updateOne(
    {
      _id: GLOBAL_LEASE_ID,
      leasedBy: lease.leasedBy,
      fenceToken: lease.fenceToken,
    },
    {
      $set: { leaseExpiresAt: now, updatedAt: now },
      $unset: { leasedBy: '' },
    },
  );
}

function stateRevision(state: RuntimeStateDocument | null) {
  return state && Number.isSafeInteger(state.stateRevision) && Number(state.stateRevision) >= 0
    ? Number(state.stateRevision)
    : 0;
}

function stateCasFilter(state: RuntimeStateDocument, lease: RuntimeLease): Filter<RuntimeStateDocument> {
  const revision = stateRevision(state);
  return {
    _id: state._id,
    $and: [
      revision === 0
        ? { $or: [{ stateRevision: 0 }, { stateRevision: { $exists: false } }] }
        : { stateRevision: revision },
      {
        $or: [
          { runtimeFenceToken: { $lte: lease.fenceToken } },
          { runtimeFenceToken: { $exists: false } },
        ],
      },
    ],
  };
}

async function replaceRuntimeStateFenced(input: {
  lease: RuntimeLease;
  state: RuntimeStateDocument | null;
  stateId: string;
  now: Date;
  next: Record<string, unknown> | null;
  validate?: (db: Db, session: ClientSession) => Promise<void>;
}) {
  return withEconomyTransaction(async (db, session) => {
    const activeLease = await db.collection<RuntimeLeaseDocument>(STATE_COLLECTION).findOne({
      _id: GLOBAL_LEASE_ID,
      leasedBy: input.lease.leasedBy,
      fenceToken: input.lease.fenceToken,
      leaseExpiresAt: { $gt: input.now },
    }, { session });
    if (!activeLease) throw new Error('CUKIE_MASTER_STALE_RUNTIME_FENCE');
    if (input.validate) await input.validate(db, session);

    const states = db.collection<RuntimeStateDocument>(STATE_COLLECTION);
    if (input.next === null) {
      if (!input.state) return null;
      const removed = await states.deleteOne(stateCasFilter(input.state, input.lease), { session });
      if (removed.deletedCount !== 1) throw new Error('CUKIE_MASTER_STALE_STATE_FENCE');
      return null;
    }

    const replacement: RuntimeStateDocument = {
      _id: input.stateId,
      ...input.next,
      stateRevision: stateRevision(input.state) + 1,
      runtimeFenceToken: input.lease.fenceToken,
      createdAt: input.state?.createdAt instanceof Date ? input.state.createdAt : input.now,
      updatedAt: input.now,
    };
    if (!input.state) {
      await states.insertOne(replacement, { session });
      return replacement;
    }
    const result = await states.replaceOne(
      stateCasFilter(input.state, input.lease),
      replacement,
      { session },
    );
    if (result.matchedCount !== 1) throw new Error('CUKIE_MASTER_STALE_STATE_FENCE');
    return replacement;
  });
}

async function claimRecalculationJob(
  db: Db,
  now: Date,
  workerId: string,
  leaseMs: number,
) {
  const jobs = db.collection<CukieMasterRecalculationJob>(QUEUE_COLLECTION);
  return jobs.findOneAndUpdate(
    {
      $or: [
        { status: { $in: ['pending', 'failed'] }, availableAt: { $lte: now } },
        { status: 'processing', leaseExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        status: 'processing',
        leasedBy: workerId,
        leaseExpiresAt: new Date(now.getTime() + leaseMs),
        startedAt: now,
        updatedAt: now,
      },
      $inc: { attempts: 1, fenceToken: 1 },
      $unset: { lastErrorCode: '', completedAt: '', expiresAt: '' },
    },
    {
      sort: { availableAt: 1, createdAt: 1, _id: 1 },
      returnDocument: 'after',
    },
  );
}

async function processRecalculationQueue(input: {
  db: Db;
  clock: RuntimeClock;
  workerId: string;
  limit: number;
  lease: RuntimeLease;
  leaseMs: number;
}) {
  const jobs = input.db.collection<CukieMasterRecalculationJob>(QUEUE_COLLECTION);
  let completed = 0;
  let failed = 0;
  for (let index = 0; index < input.limit; index += 1) {
    const claimTime = validClockDate(input.clock);
    await renewRuntimeLease(input.db, input.lease, claimTime, input.leaseMs);
    const job = await claimRecalculationJob(
      input.db,
      claimTime,
      input.workerId,
      input.leaseMs,
    );
    if (!job) break;
    const fence = recalculationFenceFilter(job, input.workerId);
    try {
      const recalculationTime = validClockDate(input.clock);
      await recalculateCukieMasterWallet(
        job.walletNormalized,
        recalculationTime,
        `outbox:${job._id}`,
      );
      const completedAt = validClockDate(input.clock);
      const result = await jobs.updateOne(
        fence,
        {
          $set: {
            status: 'completed',
            completedAt,
            updatedAt: completedAt,
            expiresAt: new Date(completedAt.getTime() + CUKIE_MASTER_COMPLETED_JOB_RETENTION_MS),
          },
          $unset: { leasedBy: '', leaseExpiresAt: '', lastErrorCode: '' },
        },
      );
      if (result.matchedCount !== 1) throw new Error('CUKIE_MASTER_STALE_JOB_FENCE');
      completed += 1;
    } catch (error) {
      const failedAt = validClockDate(input.clock);
      const errorCode = error instanceof Error && error.message === 'CUKIE_MASTER_STALE_JOB_FENCE'
        ? 'STALE_FENCE'
        : 'RECALCULATION_FAILED';
      const result = await jobs.updateOne(
        fence,
        {
          $set: {
            status: 'failed',
            availableAt: new Date(
              failedAt.getTime() + recalculationRetryBackoffMs(job.attempts),
            ),
            lastErrorCode: errorCode,
            updatedAt: failedAt,
          },
          $unset: { leasedBy: '', leaseExpiresAt: '', expiresAt: '' },
        },
      );
      if (result.matchedCount === 1) failed += 1;
    }
  }
  return { completed, failed };
}

async function runActivationBatch(now: Date, runId: string) {
  return activateMaturedCukieMasterPositions(now, runId, {}, 100);
}

function routeRound(document: StringIdDocument): CukieMasterRouteRound | null {
  if (
    (document._id !== 'uki' && document._id !== 'nft')
    || typeof document.roundId !== 'string'
    || typeof document.ruleVersion !== 'string'
    || !Number.isSafeInteger(document.revision)
    || !document.requirement
  ) return null;
  return document as unknown as CukieMasterRouteRound;
}

async function assertRoundBinding(
  db: Db,
  session: ClientSession,
  route: 'uki' | 'nft',
  binding: RuntimeRouteBinding,
) {
  const current = await db.collection<CukieMasterRouteRound>('cukie_master_route_rounds')
    .findOne({ _id: route, status: 'active' }, { session });
  if (!current || !sameRuntimeRouteBinding(runtimeRouteBinding(current), binding)) {
    throw new Error('CUKIE_MASTER_ROUTE_EPOCH_CHANGED');
  }
}

async function runGraceBatches(
  db: Db,
  clock: RuntimeClock,
  runId: string,
  lease: RuntimeLease,
  leaseMs: number,
) {
  const queryAt = validClockDate(clock);
  const rounds = await db.collection<StringIdDocument>('cukie_master_route_rounds').find({
    status: 'active',
    pendingRequirement: { $exists: true },
    graceEndsAt: { $lte: queryAt },
  }, { maxTimeMS: 2_000 }).limit(2).toArray();
  let recalculated = 0;
  for (const document of rounds) {
    const operationAt = validClockDate(clock);
    await renewRuntimeLease(db, lease, operationAt, leaseMs);
    const round = routeRound(document);
    if (!round) throw new Error('Ronda de gracia Cukie Master malformada.');
    const route = round._id as 'uki' | 'nft';
    const binding = runtimeRouteBinding(round);
    const stateId = `grace:${route}`;
    const state = await db.collection<RuntimeStateDocument>(STATE_COLLECTION)
      .findOne({ _id: stateId });
    const cursor = sameRuntimeRouteBinding(state?.binding, binding)
      ? state?.cursor as CloseRequirementGraceCursor | undefined
      : undefined;
    const result = await closeRequirementGraceBatch(
      route,
      operationAt,
      runId,
      cursor ?? { phase: 'allocated' },
      100,
    );
    recalculated += result.recalculated;
    const stateAt = validClockDate(clock);
    await renewRuntimeLease(db, lease, stateAt, leaseMs);
    await replaceRuntimeStateFenced({
      lease,
      state,
      stateId,
      now: stateAt,
      next: result.done ? null : { cursor: result.nextCursor, binding },
      ...(!result.done ? {
        validate: (transactionDb: Db, session: ClientSession) => (
          assertRoundBinding(transactionDb, session, route, binding)
        ),
      } : {}),
    });
  }
  return { rounds: rounds.length, recalculated };
}

async function runWaitlistBatches(
  db: Db,
  clock: RuntimeClock,
  runId: string,
  lease: RuntimeLease,
  leaseMs: number,
) {
  let promoted = 0;
  for (const route of ['uki', 'nft'] as const) {
    const operationAt = validClockDate(clock);
    await renewRuntimeLease(db, lease, operationAt, leaseMs);
    const [capacity, round] = await Promise.all([
      db.collection<StringIdDocument>('cukie_master_route_capacity')
        .findOne({ _id: route }, { projection: { totalSlots: 1, allocatedSlots: 1 } }),
      db.collection<CukieMasterRouteRound>('cukie_master_route_rounds')
        .findOne({ _id: route, status: 'active' }),
    ]);
    if (
      !capacity
      || !round
      || typeof capacity.totalSlots !== 'number'
      || typeof capacity.allocatedSlots !== 'number'
      || capacity.allocatedSlots >= capacity.totalSlots
    ) continue;
    const binding = runtimeRouteBinding(round);
    const stateId = `waitlist:${route}`;
    const state = await db.collection<RuntimeStateDocument>(STATE_COLLECTION)
      .findOne({ _id: stateId });
    const cursor = sameRuntimeRouteBinding(state?.binding, binding)
      ? state?.cursor as PromoteWaitlistCursor | undefined
      : undefined;
    const result = await promoteCukieMasterWaitlist(route, operationAt, runId, cursor, 100);
    promoted += result.promoted;
    const stateAt = validClockDate(clock);
    await renewRuntimeLease(db, lease, stateAt, leaseMs);
    await replaceRuntimeStateFenced({
      lease,
      state,
      stateId,
      now: stateAt,
      next: result.done ? null : { cursor: result.nextCursor, binding },
      ...(!result.done ? {
        validate: (transactionDb: Db, session: ClientSession) => (
          assertRoundBinding(transactionDb, session, route, binding)
        ),
      } : {}),
    });
  }
  return { promoted };
}

async function openOwnershipIncident(
  db: Db,
  lock: StringIdDocument,
  type: string,
  now: Date,
  details: Record<string, unknown> = {},
) {
  const lockId = typeof lock.lockId === 'string' ? lock.lockId : lock._id;
  const fence = Number.isSafeInteger(lock.fencingToken) ? Number(lock.fencingToken) : 0;
  const incidentId = `nft-lock-ownership:${type}:${lockId}:${fence}`;
  await db.collection<StringIdDocument>('chain_integrity_incidents').updateOne(
    { _id: incidentId },
    {
      $set: {
        status: 'open',
        chain: 'BSC',
        component: 'cukie-master-runtime',
        type,
        lockId,
        assetId: typeof lock.assetId === 'string' ? lock.assetId : null,
        detectedAt: now,
        updatedAt: now,
        details,
      },
      $setOnInsert: { _id: incidentId, createdAt: now },
    },
    { upsert: true },
  );
  return incidentId;
}

async function invalidateOwnershipIntegrity(
  db: Db,
  lock: StringIdDocument,
  type: string,
  now: Date,
  details: Record<string, unknown> = {},
) {
  const incidentId = await openOwnershipIncident(db, lock, type, now, details);
  if (
    typeof lock.lockId !== 'string'
    || !Number.isSafeInteger(lock.fencingToken)
  ) {
    throw new Error(`Lock NFT malformado; incidente ${incidentId} abierto.`);
  }
  await invalidateNftAssetLockForIntegrity({
    lockId: lock.lockId,
    expectedFencingToken: Number(lock.fencingToken),
    actor: 'cukie-master-runtime',
    reason: type,
    idempotencyKey: `runtime:integrity:${type}:${lock.lockId}:${lock.fencingToken}`,
    now,
  });
  return incidentId;
}

async function reconcileNftLockOwnership(
  db: Db,
  clock: RuntimeClock,
  lease: RuntimeLease,
  leaseMs: number,
) {
  const healthCheckedAt = validClockDate(clock);
  const health = await createMongoCukieMasterRepository(db).getNftIndexerHealth(healthCheckedAt);
  if (!health.healthy) {
    return { scanned: 0, invalidated: 0, incidents: 0, deferred: true };
  }
  const states = db.collection<RuntimeStateDocument>(STATE_COLLECTION);
  const state = await states.findOne({ _id: OWNERSHIP_STATE_ID });
  const afterId = typeof state?.afterId === 'string' ? state.afterId : undefined;
  const locks = await db.collection<StringIdDocument>('nft_asset_locks').find(
    nftOwnershipCursorFilter(afterId),
    { maxTimeMS: 2_000 },
  ).sort(NFT_OWNERSHIP_CURSOR_SORT).limit(OWNERSHIP_BATCH_SIZE).toArray();
  let invalidated = 0;
  let incidents = 0;
  for (const lock of locks) {
    const now = validClockDate(clock);
    await renewRuntimeLease(db, lease, now, leaseMs);
    if (
      typeof lock.assetId !== 'string'
      || typeof lock.ownerNormalized !== 'string'
      || typeof lock.lockId !== 'string'
      || !Number.isSafeInteger(lock.fencingToken)
    ) {
      await openOwnershipIncident(db, lock, 'nft_lock_malformed', now);
      throw new Error(`Lock NFT ${lock._id} malformado; reconciliacion abortada.`);
    }
    const lookup = parseCukiesAssetLookup(lock.assetId);
    if (!lookup) {
      await invalidateOwnershipIntegrity(db, lock, 'nft_lock_asset_identity_invalid', now);
      invalidated += 1;
      incidents += 1;
      continue;
    }
    const assets = await db.collection<StringIdDocument>('cukies')
      .find(cukiesAssetFilter(lookup) as Filter<StringIdDocument>, {
        projection: { _id: 1, tokenId: 1, network: 1, ownerNormalized: 1 },
        maxTimeMS: 2_000,
      })
      .limit(2)
      .toArray();
    const decision = evaluateNftOwnership({
      lookup,
      assets,
      lockOwnerNormalized: lock.ownerNormalized,
    });
    if (decision.action === 'invalidate_integrity') {
      await invalidateOwnershipIntegrity(
        db,
        lock,
        decision.reason,
        now,
        { candidates: assets.map((asset) => asset._id) },
      );
      invalidated += 1;
      incidents += 1;
      continue;
    }
    if (decision.action === 'keep') continue;
    const owner = decision.ownerNormalized;
    const result = await invalidateNftAssetLockForOwnership({
      lockId: lock.lockId,
      expectedFencingToken: Number(lock.fencingToken),
      currentOwner: owner,
      actor: 'cukie-master-runtime',
      reason: 'canonical_owner_changed',
      idempotencyKey: `runtime:owner:${lock.lockId}:${lock.fencingToken}:${owner.toLowerCase()}`,
      now,
    });
    if (result.outcome === 'invalidated') invalidated += 1;
  }
  const stateNow = validClockDate(clock);
  await renewRuntimeLease(db, lease, stateNow, leaseMs);
  const last = locks.at(-1);
  await replaceRuntimeStateFenced({
    lease,
    state,
    stateId: OWNERSHIP_STATE_ID,
    now: stateNow,
    next: locks.length < OWNERSHIP_BATCH_SIZE || !last ? null : { afterId: last._id },
  });
  return { scanned: locks.length, invalidated, incidents, deferred: false };
}

async function reconcilePoolPositionLocks(
  db: Db,
  clock: RuntimeClock,
  lease: RuntimeLease,
  leaseMs: number,
) {
  const states = db.collection<RuntimeStateDocument>(STATE_COLLECTION);
  const state = await states.findOne({ _id: POOL_POSITION_STATE_ID });
  const now = validClockDate(clock);
  const result = await reconcileCukiePoolPositions({
    now,
    limit: OWNERSHIP_BATCH_SIZE,
    afterPositionId: typeof state?.afterId === 'string' ? state.afterId : undefined,
    actor: 'cukie-master-runtime',
  });
  const stateNow = validClockDate(clock);
  await renewRuntimeLease(db, lease, stateNow, leaseMs);
  await replaceRuntimeStateFenced({
    lease,
    state,
    stateId: POOL_POSITION_STATE_ID,
    now: stateNow,
    next: result.nextCursor ? { afterId: result.nextCursor } : null,
  });
  return result;
}

function validFullReconciliationState(state: RuntimeStateDocument | null, cycleId: string) {
  return state?.status === 'running'
    && state.cycleId === cycleId
    && Number.isSafeInteger(state.sourceIndex)
    && Number(state.sourceIndex) >= 0
    && Number(state.sourceIndex) < FULL_RECONCILIATION_SOURCES.length;
}

async function enqueueFullReconciliationBatch(
  db: Db,
  clock: RuntimeClock,
  lease: RuntimeLease,
  leaseMs: number,
) {
  const now = validClockDate(clock);
  const states = db.collection<RuntimeStateDocument>(STATE_COLLECTION);
  let state = await states.findOne({ _id: FULL_RECONCILIATION_STATE_ID });
  const lastCompletedAt = state?.lastCompletedAt instanceof Date ? state.lastCompletedAt : null;
  const due = !lastCompletedAt
    || now.getTime() - lastCompletedAt.getTime() >= FULL_RECONCILIATION_INTERVAL_MS;
  if (state?.status !== 'running' && !due) return { enqueued: 0, done: true, source: null };

  const existingCycleId = typeof state?.cycleId === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(state.cycleId)
    ? state.cycleId
    : null;
  const cycleId = existingCycleId && validFullReconciliationState(state, existingCycleId)
    ? existingCycleId
    : fullReconciliationCycleId(now);
  if (!validFullReconciliationState(state, cycleId)) {
    state = await replaceRuntimeStateFenced({
      lease,
      state,
      stateId: FULL_RECONCILIATION_STATE_ID,
      now,
      next: {
        status: 'running',
        cycleId,
        sourceIndex: 0,
        lastCompletedAt,
      },
    });
  }
  if (!state || !validFullReconciliationState(state, cycleId)) {
    throw new Error('El cursor de reconciliacion completa no se pudo inicializar.');
  }

  const sourceIndex = Number(state.sourceIndex);
  const source = FULL_RECONCILIATION_SOURCES[sourceIndex];
  const sourceFilter = fullReconciliationSourceFilter(source, {
    afterWallet: typeof state.afterWallet === 'string' ? state.afterWallet : undefined,
    afterId: state.afterId,
  });
  const filter = Object.keys(sourceFilter).length > 0
    ? { $and: [sourceFilter, { [source.walletField]: { $type: 'string' } }] }
    : { [source.walletField]: { $type: 'string' } };
  const sort: Sort = { [source.walletField]: 1, _id: 1 };
  const documents = await db.collection<Record<string, unknown>>(source.collection)
    .find(filter as Filter<Record<string, unknown>>, {
      projection: { _id: 1, [source.walletField]: 1 },
      maxTimeMS: 2_000,
    })
    .sort(sort)
    .limit(FULL_RECONCILIATION_BATCH_SIZE)
    .toArray();
  const wallets = normalizedWalletsFromSourcePage(documents, source.walletField);
  const queue = db.collection<CukieMasterRecalculationJob>(QUEUE_COLLECTION);
  let enqueued = 0;
  for (const walletNormalized of wallets) {
    const id = fullReconciliationJobId(cycleId, walletNormalized);
    const result = await queue.updateOne(
      { _id: id },
      {
        $setOnInsert: {
          _id: id,
          walletNormalized,
          status: 'pending',
          sourceType: 'full_reconciliation',
          availableAt: now,
          attempts: 0,
          fenceToken: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    enqueued += result.upsertedCount;
  }

  const sourceDone = documents.length < FULL_RECONCILIATION_BATCH_SIZE;
  const cycleDone = sourceDone && sourceIndex === FULL_RECONCILIATION_SOURCES.length - 1;
  const last = documents.at(-1);
  const lastWallet = last?.[source.walletField];
  const stateNow = validClockDate(clock);
  await renewRuntimeLease(db, lease, stateNow, leaseMs);
  const next = cycleDone
    ? {
        status: 'completed',
        cycleId,
        sourceIndex,
        lastCompletedAt: stateNow,
      }
    : sourceDone
      ? {
          status: 'running',
          cycleId,
          sourceIndex: sourceIndex + 1,
          lastCompletedAt,
        }
      : {
          status: 'running',
          cycleId,
          sourceIndex,
          afterWallet: typeof lastWallet === 'string' ? lastWallet : undefined,
          afterId: last?._id,
          lastCompletedAt,
        };
  await replaceRuntimeStateFenced({
    lease,
    state,
    stateId: FULL_RECONCILIATION_STATE_ID,
    now: stateNow,
    next,
  });
  return { enqueued, done: cycleDone, source: source.id };
}

export async function runCukieMasterRuntimeTick(input: {
  now?: Date;
  workerId: string;
  queueLimit?: number;
  clock?: RuntimeClock;
}) {
  if (process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error('CHAIN_INDEXER_CUKIE_MASTER_ENABLED no esta activo.');
  }
  const clock = input.clock ?? (() => new Date());
  const startedAt = input.now ?? validClockDate(clock);
  if (!(startedAt instanceof Date) || Number.isNaN(startedAt.getTime())) {
    throw new Error('now no es una fecha valida para el runtime Cukie Master.');
  }
  if (typeof input.workerId !== 'string' || !input.workerId.trim()) {
    throw new Error('workerId no puede estar vacio para el runtime Cukie Master.');
  }
  const requestedLimit = input.queueLimit ?? 100;
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
    throw new Error('queueLimit debe ser un entero entre 1 y 500 para Cukie Master.');
  }
  const queueLimit = requestedLimit;
  const db = await getEconomyDb();
  const leaseMs = runtimeLeaseMs();
  const lease = await acquireRuntimeLease(db, input.workerId.trim(), startedAt, leaseMs);
  const runId = `cukie-master:${startedAt.toISOString()}:${randomUUID()}`;
  const runs = db.collection<StringIdDocument>(RUNS_COLLECTION);
  await runs.insertOne({
    _id: runId,
    status: 'running',
    workerId: input.workerId.trim(),
    runtimeFenceToken: lease.fenceToken,
    startedAt,
    createdAt: startedAt,
    expiresAt: new Date(startedAt.getTime() + CUKIE_MASTER_RUNTIME_RUN_RETENTION_MS),
  });
  try {
    const queue = await processRecalculationQueue({
      db,
      clock,
      workerId: lease.leasedBy,
      limit: queueLimit,
      lease,
      leaseMs,
    });
    let phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const activation = await runActivationBatch(phaseNow, runId);
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const grace = await runGraceBatches(db, clock, runId, lease, leaseMs);
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const waitlist = await runWaitlistBatches(db, clock, runId, lease, leaseMs);
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const poolExpiry = await expireCukiePoolAssignments({
      now: phaseNow,
      limit: 100,
      actor: 'cukie-master-runtime',
    });
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const expiry = await expireNftAssetLocks({
      now: phaseNow,
      limit: 100,
      actor: 'cukie-master-runtime',
      // El agregado del pool debe cerrar su asignacion y restaurar cuota/lock
      // de forma atomica. El expirer generico no conoce ese agregado.
      excludeReasons: ['game_assignment'],
    });
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const ownership = await reconcileNftLockOwnership(db, clock, lease, leaseMs);
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const poolReconciliation = await reconcilePoolPositionLocks(
      db,
      clock,
      lease,
      leaseMs,
    );
    phaseNow = validClockDate(clock);
    await renewRuntimeLease(db, lease, phaseNow, leaseMs);
    const reconciliation = await enqueueFullReconciliationBatch(db, clock, lease, leaseMs);
    const endedAt = validClockDate(clock);
    const result = {
      queue,
      activation,
      grace,
      waitlist,
      poolExpiry,
      expiry,
      ownership,
      poolReconciliation,
      reconciliation,
    };
    await runs.updateOne(
      { _id: runId, status: 'running', runtimeFenceToken: lease.fenceToken },
      {
        $set: {
          status: 'success',
          endedAt,
          updatedAt: endedAt,
          expiresAt: new Date(endedAt.getTime() + CUKIE_MASTER_RUNTIME_RUN_RETENTION_MS),
          result,
        },
      },
    );
    return { runId, status: 'success' as const, ...result };
  } catch (error) {
    const endedAt = validClockDate(clock);
    await runs.updateOne(
      { _id: runId, status: 'running', runtimeFenceToken: lease.fenceToken },
      {
        $set: {
          status: 'error',
          endedAt,
          updatedAt: endedAt,
          expiresAt: new Date(endedAt.getTime() + CUKIE_MASTER_RUNTIME_RUN_RETENTION_MS),
          errorCode: 'CUKIE_MASTER_RUNTIME_TICK_FAILED',
        },
      },
    );
    throw error;
  } finally {
    await releaseRuntimeLease(db, lease, validClockDate(clock));
  }
}
