import 'server-only';

import { randomUUID } from 'node:crypto';

import type { Db } from 'mongodb';

import { DomainConflictError } from '../errors';
import {
  expireCukiePoolAssignments,
  reconcileCukiePoolPositions,
} from './service';
import { requiredPoolText } from './rules';
import type {
  ExpireCukiePoolAssignmentsResult,
  ReconcileCukiePoolPositionsResult,
} from './types';

const STATE_COLLECTION = 'cukie_pool_runtime_state';
const RUNS_COLLECTION = 'cukie_pool_runtime_runs';
const GLOBAL_LEASE_ID = 'runtime-tick-lease';
const DEFAULT_TICK_TIMEOUT_MS = 240_000;
const DEFAULT_LEASE_MS = 10 * 60_000;
const LEASE_SAFETY_MARGIN_MS = 60_000;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60_000;

type RuntimeClock = () => Date;

export type CukiePoolRuntimeConfig = {
  enabled: boolean;
  gameExpiryLimit: number;
  orphanExpiryLimit: number;
  reconciliationLimit: number;
  maxReconciliationBatches: number;
  leaseMs: number;
};

export type CukiePoolRuntimeLease = {
  leasedBy: string;
  fenceToken: number;
  leaseExpiresAt: Date;
};

export type CukiePoolGameExpiryResult = {
  sessions: Array<{ sessionId: string }>;
  failures: Array<{ sessionId: string; code: string }>;
};

export type CukiePoolRuntimeResult = {
  gameSessionsClosed: number;
  gameSessionFailures: Array<{ sessionId: string; code: string }>;
  orphanAssignments: ExpireCukiePoolAssignmentsResult;
  reconciliation: {
    batches: number;
    scanned: number;
    invalidated: number;
    skipped: number;
    nextCursor: string | null;
  };
  completedAt: string;
};

type RuntimeStateDocument = {
  _id: string;
  leasedBy?: string;
  fenceToken: number;
  leaseExpiresAt: Date;
  reconciliationCursor?: string | null;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastErrorCode?: string;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
};

type RuntimeRunDocument = {
  _id: string;
  runId: string;
  workerId: string;
  status: 'running' | 'success' | 'error';
  runtimeFenceToken: number;
  startedAt: Date;
  endedAt?: Date;
  expiresAt: Date;
  result?: CukiePoolRuntimeResult;
  errorCode?: string;
};

export interface CukiePoolRuntimeCoordinator {
  acquire(workerId: string, now: Date, leaseMs: number): Promise<CukiePoolRuntimeLease | null>;
  renew(
    lease: CukiePoolRuntimeLease,
    now: Date,
    leaseMs: number,
  ): Promise<CukiePoolRuntimeLease>;
  release(lease: CukiePoolRuntimeLease, now: Date): Promise<void>;
  startRun(workerId: string, lease: CukiePoolRuntimeLease, now: Date): Promise<string>;
  loadReconciliationCursor(lease: CukiePoolRuntimeLease): Promise<string | null>;
  finishRun(
    runId: string,
    lease: CukiePoolRuntimeLease,
    now: Date,
    result: CukiePoolRuntimeResult,
  ): Promise<void>;
  failRun(
    runId: string,
    lease: CukiePoolRuntimeLease,
    now: Date,
    errorCode: string,
  ): Promise<void>;
}

export interface CukiePoolRuntimeServices {
  expireGameSessions(input: { now: Date; limit: number }): Promise<CukiePoolGameExpiryResult>;
  expireOrphanAssignments(input: {
    now: Date;
    limit: number;
    actor: string;
  }): Promise<ExpireCukiePoolAssignmentsResult>;
  reconcilePositions(input: {
    now: Date;
    limit: number;
    actor: string;
    afterPositionId?: string;
  }): Promise<ReconcileCukiePoolPositionsResult>;
}

export class CukiePoolRuntimeBusyError extends Error {
  constructor() {
    super('Ya existe un tick del pool de Cukies con lease activo.');
    this.name = 'CukiePoolRuntimeBusyError';
  }
}

export class CukiePoolRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CukiePoolRuntimeConfigurationError';
  }
}

function strictBoolean(value: string | undefined, fallback: boolean, name: string) {
  if (value === undefined || value.trim() === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new CukiePoolRuntimeConfigurationError(`${name} debe ser true o false.`);
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
) {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/.test(value.trim())) {
    throw new CukiePoolRuntimeConfigurationError(`${name} debe ser un entero.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CukiePoolRuntimeConfigurationError(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }
  return parsed;
}

export function loadCukiePoolRuntimeConfig(
  environment: Record<string, string | undefined> = process.env,
): CukiePoolRuntimeConfig {
  const enabled = strictBoolean(
    environment.CUKIE_POOL_RUNTIME_ENABLED,
    false,
    'CUKIE_POOL_RUNTIME_ENABLED',
  );
  const tickTimeoutMs = boundedInteger(
    environment.CUKIE_POOL_TICK_TIMEOUT_MS,
    DEFAULT_TICK_TIMEOUT_MS,
    10_000,
    600_000,
    'CUKIE_POOL_TICK_TIMEOUT_MS',
  );
  const minimumLeaseMs = tickTimeoutMs + LEASE_SAFETY_MARGIN_MS;
  return {
    enabled,
    gameExpiryLimit: boundedInteger(
      environment.CUKIE_POOL_GAME_EXPIRY_LIMIT,
      100,
      1,
      100,
      'CUKIE_POOL_GAME_EXPIRY_LIMIT',
    ),
    orphanExpiryLimit: boundedInteger(
      environment.CUKIE_POOL_ORPHAN_EXPIRY_LIMIT,
      100,
      1,
      1_000,
      'CUKIE_POOL_ORPHAN_EXPIRY_LIMIT',
    ),
    reconciliationLimit: boundedInteger(
      environment.CUKIE_POOL_RECONCILIATION_LIMIT,
      250,
      1,
      1_000,
      'CUKIE_POOL_RECONCILIATION_LIMIT',
    ),
    maxReconciliationBatches: boundedInteger(
      environment.CUKIE_POOL_MAX_RECONCILIATION_BATCHES,
      4,
      1,
      20,
      'CUKIE_POOL_MAX_RECONCILIATION_BATCHES',
    ),
    leaseMs: boundedInteger(
      environment.CUKIE_POOL_TICK_LEASE_MS,
      Math.max(DEFAULT_LEASE_MS, minimumLeaseMs),
      minimumLeaseMs,
      60 * 60_000,
      'CUKIE_POOL_TICK_LEASE_MS',
    ),
  };
}

function validClockDate(clock: RuntimeClock) {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('El reloj del runtime del pool devolvio una fecha invalida.');
  }
  return new Date(value.getTime());
}

function runtimeErrorCode(error: unknown) {
  if (error instanceof CukiePoolRuntimeConfigurationError) return 'CONFIGURATION';
  if (error instanceof DomainConflictError) return 'DOMAIN_CONFLICT';
  return 'TICK_FAILED';
}

export function createMongoCukiePoolRuntimeCoordinator(
  db: Db,
): CukiePoolRuntimeCoordinator {
  const states = db.collection<RuntimeStateDocument>(STATE_COLLECTION);
  const runs = db.collection<RuntimeRunDocument>(RUNS_COLLECTION);
  return {
    async acquire(workerId, now, leaseMs) {
      await states.updateOne(
        { _id: GLOBAL_LEASE_ID },
        {
          $setOnInsert: {
            _id: GLOBAL_LEASE_ID,
            fenceToken: 0,
            leaseExpiresAt: new Date(0),
            consecutiveFailures: 0,
            createdAt: now,
          },
          $set: { lastAttemptAt: now, updatedAt: now },
        },
        { upsert: true },
      );
      const leasedBy = `${workerId}:${randomUUID()}`;
      const state = await states.findOneAndUpdate(
        {
          _id: GLOBAL_LEASE_ID,
          $or: [
            { leaseExpiresAt: { $lte: now } },
            { leaseExpiresAt: { $exists: false } },
          ],
        },
        {
          $set: {
            leasedBy,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
            updatedAt: now,
          },
          $inc: { fenceToken: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!state || state.leasedBy !== leasedBy || !Number.isSafeInteger(state.fenceToken)) {
        return null;
      }
      return {
        leasedBy,
        fenceToken: state.fenceToken,
        leaseExpiresAt: state.leaseExpiresAt,
      };
    },
    async renew(lease, now, leaseMs) {
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const result = await states.updateOne(
        {
          _id: GLOBAL_LEASE_ID,
          leasedBy: lease.leasedBy,
          fenceToken: lease.fenceToken,
          leaseExpiresAt: { $gt: now },
        },
        { $set: { leaseExpiresAt, updatedAt: now } },
      );
      if (result.matchedCount !== 1) throw new Error('CUKIE_POOL_STALE_RUNTIME_FENCE');
      return { ...lease, leaseExpiresAt };
    },
    async release(lease, now) {
      await states.updateOne(
        { _id: GLOBAL_LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        {
          $set: { leaseExpiresAt: now, updatedAt: now },
          $unset: { leasedBy: '' },
        },
      );
    },
    async startRun(workerId, lease, now) {
      const runId = randomUUID();
      await runs.insertOne({
        _id: runId,
        runId,
        workerId,
        status: 'running',
        runtimeFenceToken: lease.fenceToken,
        startedAt: now,
        expiresAt: new Date(now.getTime() + RUN_RETENTION_MS),
      });
      return runId;
    },
    async loadReconciliationCursor(lease) {
      const state = await states.findOne({
        _id: GLOBAL_LEASE_ID,
        leasedBy: lease.leasedBy,
        fenceToken: lease.fenceToken,
      });
      if (!state) throw new Error('CUKIE_POOL_STALE_RUNTIME_FENCE');
      return typeof state.reconciliationCursor === 'string'
        ? state.reconciliationCursor
        : null;
    },
    async finishRun(runId, lease, now, result) {
      const run = await runs.updateOne(
        { _id: runId, status: 'running', runtimeFenceToken: lease.fenceToken },
        { $set: { status: 'success', endedAt: now, result } },
      );
      if (run.matchedCount !== 1) throw new Error('CUKIE_POOL_STALE_RUN_FENCE');
      const state = await states.updateOne(
        { _id: GLOBAL_LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        {
          $set: {
            lastSuccessAt: now,
            updatedAt: now,
            consecutiveFailures: 0,
            reconciliationCursor: result.reconciliation.nextCursor,
          },
          $unset: { lastErrorCode: '', lastFailureAt: '' },
        },
      );
      if (state.matchedCount !== 1) throw new Error('CUKIE_POOL_STALE_RUNTIME_FENCE');
    },
    async failRun(runId, lease, now, errorCode) {
      await runs.updateOne(
        { _id: runId, status: 'running', runtimeFenceToken: lease.fenceToken },
        { $set: { status: 'error', endedAt: now, errorCode } },
      );
      await states.updateOne(
        { _id: GLOBAL_LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        {
          $set: { lastFailureAt: now, lastErrorCode: errorCode, updatedAt: now },
          $inc: { consecutiveFailures: 1 },
        },
      );
    },
  };
}

const defaultServices: CukiePoolRuntimeServices = {
  async expireGameSessions(input) {
    const {
      createMongoGameEconomyPorts,
      createMongoGameEconomyService,
    } = await import('../game-economy');
    return createMongoGameEconomyService(createMongoGameEconomyPorts()).expireBatch(input);
  },
  expireOrphanAssignments: expireCukiePoolAssignments,
  reconcilePositions: reconcileCukiePoolPositions,
};

export async function runCukiePoolRuntimeTick(input: {
  workerId: string;
  config?: CukiePoolRuntimeConfig;
  clock?: RuntimeClock;
  services?: CukiePoolRuntimeServices;
  coordinator?: CukiePoolRuntimeCoordinator;
}) {
  const config = input.config ?? loadCukiePoolRuntimeConfig();
  if (!config.enabled) {
    throw new CukiePoolRuntimeConfigurationError('El runtime del pool esta desactivado.');
  }
  const workerId = requiredPoolText(input.workerId, 'workerId');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workerId)) {
    throw new CukiePoolRuntimeConfigurationError('workerId tiene un formato invalido.');
  }
  const clock = input.clock ?? (() => new Date());
  const services = input.services ?? defaultServices;
  const coordinator = input.coordinator ?? createMongoCukiePoolRuntimeCoordinator(
    await (await import('@/lib/indexer-db/mongodb')).getEconomyDb(),
  );
  const startedAt = validClockDate(clock);
  let lease = await coordinator.acquire(workerId, startedAt, config.leaseMs);
  if (!lease) throw new CukiePoolRuntimeBusyError();
  let runId: string | null = null;

  try {
    runId = await coordinator.startRun(workerId, lease, startedAt);
    const gameNow = validClockDate(clock);
    lease = await coordinator.renew(lease, gameNow, config.leaseMs);
    const game = await services.expireGameSessions({
      now: gameNow,
      limit: config.gameExpiryLimit,
    });

    const orphanNow = validClockDate(clock);
    lease = await coordinator.renew(lease, orphanNow, config.leaseMs);
    const orphanAssignments = await services.expireOrphanAssignments({
      now: orphanNow,
      limit: config.orphanExpiryLimit,
      actor: 'cukie-pool-runtime',
    });

    let nextCursor = await coordinator.loadReconciliationCursor(lease);
    let reconciliationBatches = 0;
    let reconciliationScanned = 0;
    let reconciliationInvalidated = 0;
    let reconciliationSkipped = 0;
    for (let index = 0; index < config.maxReconciliationBatches; index += 1) {
      const reconciliationNow = validClockDate(clock);
      lease = await coordinator.renew(lease, reconciliationNow, config.leaseMs);
      const result = await services.reconcilePositions({
        now: reconciliationNow,
        limit: config.reconciliationLimit,
        actor: 'cukie-pool-runtime',
        ...(nextCursor ? { afterPositionId: nextCursor } : {}),
      });
      reconciliationBatches += 1;
      reconciliationScanned += result.scanned;
      reconciliationInvalidated += result.invalidated;
      reconciliationSkipped += result.skipped;
      nextCursor = result.nextCursor;
      if (!nextCursor) break;
    }

    const completedAt = validClockDate(clock);
    const result: CukiePoolRuntimeResult = {
      gameSessionsClosed: game.sessions.length,
      gameSessionFailures: game.failures,
      orphanAssignments,
      reconciliation: {
        batches: reconciliationBatches,
        scanned: reconciliationScanned,
        invalidated: reconciliationInvalidated,
        skipped: reconciliationSkipped,
        nextCursor,
      },
      completedAt: completedAt.toISOString(),
    };
    await coordinator.finishRun(runId, lease, completedAt, result);
    return result;
  } catch (error) {
    try {
      if (runId) {
        await coordinator.failRun(
          runId,
          lease,
          validClockDate(clock),
          runtimeErrorCode(error),
        );
      }
    } catch {
      // El error de dominio original prevalece sobre la escritura de observabilidad.
    }
    throw error;
  } finally {
    try {
      await coordinator.release(lease, validClockDate(clock));
    } catch {
      // La expiracion del lease es la ultima barrera si se pierde el fence al liberar.
    }
  }
}
