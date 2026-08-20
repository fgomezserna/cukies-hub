import 'server-only';

import { randomUUID } from 'node:crypto';

import type { Db } from 'mongodb';

import { DomainConflictError } from '../errors';
import {
  competitionCreditService,
  type ProcessCreditRunBatchInput,
} from './service';
import {
  assertRuleActiveAt,
  currentCompetitionCreditPeriod,
  validCreditDate,
  validCreditText,
} from './rules';
import { mongoCompetitionCreditTransactionRunner } from './repository';
import type { CompetitionCreditRule, CompetitionCreditRun } from './types';
import type { CreditRoute } from './types';

const STATE_COLLECTION = 'competition_credit_runtime_state';
const RUNS_COLLECTION = 'competition_credit_runtime_runs';
const GLOBAL_LEASE_ID = 'runtime-tick-lease';
const DEFAULT_TICK_TIMEOUT_MS = 240_000;
const DEFAULT_LEASE_MS = 10 * 60_000;
const LEASE_SAFETY_MARGIN_MS = 60_000;
const RUN_RETENTION_MS = 30 * 24 * 60 * 60_000;

type RuntimeClock = () => Date;

export type CompetitionCreditRuntimeConfig = {
  enabled: boolean;
  expectedRuleVersion: string | null;
  batchLimit: number;
  maxBatchesPerTick: number;
  expiryLimit: number;
  leaseMs: number;
};

export type CompetitionCreditRuntimeLease = {
  leasedBy: string;
  fenceToken: number;
  leaseExpiresAt: Date;
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
  errorCode?: string;
  creditRunId?: string;
  periodId?: string;
  result?: CompetitionCreditRuntimeResult;
};

type RuntimeStateDocument = {
  _id: string;
  leasedBy?: string;
  fenceToken: number;
  leaseExpiresAt: Date;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  lastFailureAt?: Date;
  lastErrorCode?: string;
  consecutiveFailures?: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface CompetitionCreditRuntimeCoordinator {
  acquire(workerId: string, now: Date, leaseMs: number): Promise<CompetitionCreditRuntimeLease | null>;
  renew(lease: CompetitionCreditRuntimeLease, now: Date, leaseMs: number): Promise<CompetitionCreditRuntimeLease>;
  release(lease: CompetitionCreditRuntimeLease, now: Date): Promise<void>;
  startRun(
    workerId: string,
    lease: CompetitionCreditRuntimeLease,
    now: Date,
  ): Promise<string>;
  finishRun(
    runtimeRunId: string,
    lease: CompetitionCreditRuntimeLease,
    now: Date,
    result: CompetitionCreditRuntimeResult,
  ): Promise<void>;
  failRun(
    runtimeRunId: string,
    lease: CompetitionCreditRuntimeLease,
    now: Date,
    errorCode: string,
  ): Promise<void>;
}

export type CompetitionCreditRuntimeServices = Pick<
  typeof competitionCreditService,
  | 'refreshSourceWatermark'
  | 'createDailyRun'
  | 'claimRun'
  | 'processRunBatch'
  | 'openRun'
  | 'expireReservationsBatch'
  | 'expireAvailableLotsBatch'
  | 'findOldestPendingRoutePeriod'
>;

export type CompetitionCreditRouteRuntimeResult = {
  route: CreditRoute;
  status: 'open' | 'processing' | 'blocked';
  periodId: string;
  creditRunId: string;
  batchesProcessed: number;
  itemsApplied: number;
  pendingItems: number;
  warningCode?: 'SNAPSHOT_LATE';
  errorCode?: string;
};

export type CompetitionCreditRuntimeResult = {
  status: 'open' | 'processing' | 'blocked';
  periodId: string;
  creditRunId: string;
  batchesProcessed: number;
  itemsApplied: number;
  pendingItems: number;
  expiredReservations: number;
  expiredLots: number;
  routeResults: CompetitionCreditRouteRuntimeResult[];
  completedAt: string;
};

export class CompetitionCreditRuntimeBusyError extends Error {
  constructor() {
    super('Ya existe un tick de creditos con lease activo.');
    this.name = 'CompetitionCreditRuntimeBusyError';
  }
}

export class CompetitionCreditRuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompetitionCreditRuntimeConfigurationError';
  }
}

function strictBoolean(value: string | undefined, fallback: boolean, name: string) {
  if (value === undefined || value.trim() === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new CompetitionCreditRuntimeConfigurationError(`${name} debe ser true o false.`);
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
    throw new CompetitionCreditRuntimeConfigurationError(`${name} debe ser un entero.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new CompetitionCreditRuntimeConfigurationError(
      `${name} debe estar entre ${minimum} y ${maximum}.`,
    );
  }
  return parsed;
}

export function loadCompetitionCreditRuntimeConfig(
  environment: Record<string, string | undefined> = process.env,
): CompetitionCreditRuntimeConfig {
  const enabled = strictBoolean(
    environment.COMPETITION_CREDITS_RUNTIME_ENABLED,
    false,
    'COMPETITION_CREDITS_RUNTIME_ENABLED',
  );
  const rawRuleVersion = environment.COMPETITION_CREDITS_RULE_VERSION?.trim() ?? '';
  const expectedRuleVersion = rawRuleVersion
    ? validCreditText(rawRuleVersion, 'COMPETITION_CREDITS_RULE_VERSION')
    : null;
  if (enabled && !expectedRuleVersion) {
    throw new CompetitionCreditRuntimeConfigurationError(
      'COMPETITION_CREDITS_RULE_VERSION es obligatorio cuando el runtime esta activo.',
    );
  }
  const tickTimeoutMs = boundedInteger(
    environment.COMPETITION_CREDITS_TICK_TIMEOUT_MS,
    DEFAULT_TICK_TIMEOUT_MS,
    10_000,
    600_000,
    'COMPETITION_CREDITS_TICK_TIMEOUT_MS',
  );
  const minimumLeaseMs = tickTimeoutMs + LEASE_SAFETY_MARGIN_MS;
  return {
    enabled,
    expectedRuleVersion,
    batchLimit: boundedInteger(
      environment.COMPETITION_CREDITS_BATCH_LIMIT,
      100,
      1,
      500,
      'COMPETITION_CREDITS_BATCH_LIMIT',
    ),
    maxBatchesPerTick: boundedInteger(
      environment.COMPETITION_CREDITS_MAX_BATCHES_PER_TICK,
      5,
      1,
      20,
      'COMPETITION_CREDITS_MAX_BATCHES_PER_TICK',
    ),
    expiryLimit: boundedInteger(
      environment.COMPETITION_CREDITS_EXPIRY_LIMIT,
      100,
      1,
      100,
      'COMPETITION_CREDITS_EXPIRY_LIMIT',
    ),
    leaseMs: boundedInteger(
      environment.COMPETITION_CREDITS_TICK_LEASE_MS,
      Math.max(DEFAULT_LEASE_MS, minimumLeaseMs),
      minimumLeaseMs,
      60 * 60_000,
      'COMPETITION_CREDITS_TICK_LEASE_MS',
    ),
  };
}

function validClockDate(clock: RuntimeClock) {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error('El reloj del runtime de creditos devolvio una fecha invalida.');
  }
  return new Date(value.getTime());
}

function runtimeErrorCode(error: unknown) {
  if (error instanceof CompetitionCreditRuntimeConfigurationError) return 'CONFIGURATION';
  if (error instanceof DomainConflictError) return 'DOMAIN_CONFLICT';
  return 'TICK_FAILED';
}

export function createMongoCompetitionCreditRuntimeCoordinator(
  db: Db,
): CompetitionCreditRuntimeCoordinator {
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
            leasedBy,
            leaseExpiresAt: new Date(now.getTime() + leaseMs),
            updatedAt: now,
          },
          $inc: { fenceToken: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!lease || lease.leasedBy !== leasedBy || !Number.isSafeInteger(lease.fenceToken)) {
        return null;
      }
      return {
        leasedBy,
        fenceToken: lease.fenceToken,
        leaseExpiresAt: lease.leaseExpiresAt,
      };
    },
    async renew(lease, now, leaseMs) {
      const leaseExpiresAt = new Date(now.getTime() + leaseMs);
      const renewed = await states.updateOne(
        {
          _id: GLOBAL_LEASE_ID,
          leasedBy: lease.leasedBy,
          fenceToken: lease.fenceToken,
          leaseExpiresAt: { $gt: now },
        },
        { $set: { leaseExpiresAt, updatedAt: now } },
      );
      if (renewed.matchedCount !== 1) throw new Error('COMPETITION_CREDITS_STALE_RUNTIME_FENCE');
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
      const runtimeRunId = randomUUID();
      await runs.insertOne({
        _id: runtimeRunId,
        runId: runtimeRunId,
        workerId,
        status: 'running',
        runtimeFenceToken: lease.fenceToken,
        startedAt: now,
        expiresAt: new Date(now.getTime() + RUN_RETENTION_MS),
      });
      return runtimeRunId;
    },
    async finishRun(runtimeRunId, lease, now, result) {
      const updated = await runs.updateOne(
        {
          _id: runtimeRunId,
          status: 'running',
          runtimeFenceToken: lease.fenceToken,
        },
        {
          $set: {
            status: 'success',
            endedAt: now,
            creditRunId: result.creditRunId,
            periodId: result.periodId,
            result,
          },
        },
      );
      if (updated.matchedCount !== 1) throw new Error('COMPETITION_CREDITS_STALE_RUN_FENCE');
      await states.updateOne(
        { _id: GLOBAL_LEASE_ID, leasedBy: lease.leasedBy, fenceToken: lease.fenceToken },
        {
          $set: { lastSuccessAt: now, updatedAt: now, consecutiveFailures: 0 },
          $unset: { lastErrorCode: '', lastFailureAt: '' },
        },
      );
    },
    async failRun(runtimeRunId, lease, now, errorCode) {
      await runs.updateOne(
        {
          _id: runtimeRunId,
          status: 'running',
          runtimeFenceToken: lease.fenceToken,
        },
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

async function loadRule(
  now: Date,
  expectedRuleVersion: string,
  runner = mongoCompetitionCreditTransactionRunner,
) {
  const rule = await runner((repository) => repository.findRuleAt(now, expectedRuleVersion));
  if (!rule) {
    throw new CompetitionCreditRuntimeConfigurationError(
      `No existe una regla activa de creditos con version ${expectedRuleVersion}.`,
    );
  }
  return assertRuleActiveAt(rule, now);
}

export async function runCompetitionCreditRuntimeTick(input: {
  workerId: string;
  config?: CompetitionCreditRuntimeConfig;
  clock?: RuntimeClock;
  services?: CompetitionCreditRuntimeServices;
  coordinator?: CompetitionCreditRuntimeCoordinator;
  loadActiveRule?: (now: Date, expectedRuleVersion: string) => Promise<CompetitionCreditRule>;
}) {
  const config = input.config ?? loadCompetitionCreditRuntimeConfig();
  if (!config.enabled || !config.expectedRuleVersion) {
    throw new CompetitionCreditRuntimeConfigurationError(
      'El runtime de creditos esta desactivado o no tiene regla fijada.',
    );
  }
  const workerId = validCreditText(input.workerId, 'workerId');
  const clock = input.clock ?? (() => new Date());
  const services = input.services ?? competitionCreditService;
  const coordinator = input.coordinator ?? createMongoCompetitionCreditRuntimeCoordinator(
    await (await import('@/lib/indexer-db/mongodb')).getEconomyDb(),
  );
  const startedAt = validClockDate(clock);
  let lease = await coordinator.acquire(workerId, startedAt, config.leaseMs);
  if (!lease) throw new CompetitionCreditRuntimeBusyError();
  const runtimeRunId = await coordinator.startRun(workerId, lease, startedAt);

  try {
    const rule = await (input.loadActiveRule ?? loadRule)(
      validClockDate(clock),
      config.expectedRuleVersion,
    );
    const routeResults: CompetitionCreditRouteRuntimeResult[] = [];
    let firstRouteError: unknown = null;
    for (const route of ['uki', 'nft'] as const) {
      try {
        const snapshotNow = validClockDate(clock);
        lease = await coordinator.renew(lease, snapshotNow, config.leaseMs);
        const period = await services.findOldestPendingRoutePeriod({
          route,
          rule,
          now: snapshotNow,
        });
        const watermarkNow = validClockDate(clock);
        lease = await coordinator.renew(lease, watermarkNow, config.leaseMs);
        await services.refreshSourceWatermark({
          route,
          expectedRuleVersion: period.ruleVersion,
          ruleAt: period.cutoff,
          now: watermarkNow,
        });
        let run: CompetitionCreditRun = await services.createDailyRun({
          route,
          cutoff: period.cutoff,
          expectedRuleVersion: period.ruleVersion,
          now: snapshotNow,
        });
        let batchesProcessed = 0;
        let itemsApplied = 0;
    let pendingItems = run.status === 'open' || run.status === 'open_with_holds'
      ? 0
      : run.expectedItemCount;
        let status: CompetitionCreditRouteRuntimeResult['status'] = run.status === 'blocked'
          ? 'blocked'
          : run.status === 'open' || run.status === 'open_with_holds'
            ? 'open'
            : 'processing';

    if (run.status !== 'open' && run.status !== 'open_with_holds' && run.status !== 'blocked') {
          const claimNow = validClockDate(clock);
          lease = await coordinator.renew(lease, claimNow, config.leaseMs);
          run = await services.claimRun({ runId: run.runId, workerId, now: claimNow });
          for (let index = 0; index < config.maxBatchesPerTick; index += 1) {
            const batchNow = validClockDate(clock);
            lease = await coordinator.renew(lease, batchNow, config.leaseMs);
            const batchInput: ProcessCreditRunBatchInput = {
              runId: run.runId,
              workerId,
              fenceToken: run.fenceToken,
              now: batchNow,
              limit: config.batchLimit,
            };
            const batch = await services.processRunBatch(batchInput);
            batchesProcessed += 1;
            itemsApplied += batch.applied;
            pendingItems = batch.pending;
            if (!batch.done) continue;
            const openNow = validClockDate(clock);
            lease = await coordinator.renew(lease, openNow, config.leaseMs);
            const opened = await services.openRun({ ...batchInput, now: openNow });
            status = opened.reconciliation.ok &&
              (opened.run.status === 'open' || opened.run.status === 'open_with_holds')
              ? 'open'
              : 'blocked';
            break;
          }
        }
        routeResults.push({
          route,
          status,
          periodId: period.periodId,
          creditRunId: run.runId,
          batchesProcessed,
          itemsApplied,
          pendingItems,
          ...(snapshotNow.getTime() - period.cutoff.getTime() > rule.maxSnapshotLatenessMs
            ? { warningCode: 'SNAPSHOT_LATE' as const }
            : {}),
        });
      } catch (error) {
        firstRouteError ??= error;
        routeResults.push({
          route,
          status: 'blocked',
          periodId: currentCompetitionCreditPeriod(validClockDate(clock), rule).periodId,
          creditRunId: '',
          batchesProcessed: 0,
          itemsApplied: 0,
          pendingItems: 0,
          errorCode: runtimeErrorCode(error),
        });
      }
    }
    const successfulRoutes = routeResults.filter((route) => !route.errorCode);
    if (successfulRoutes.length === 0 && firstRouteError) throw firstRouteError;

    const expiryNow = validClockDate(clock);
    lease = await coordinator.renew(lease, expiryNow, config.leaseMs);
    const [reservations, lots] = await Promise.all([
      services.expireReservationsBatch({ now: expiryNow, limit: config.expiryLimit }),
      services.expireAvailableLotsBatch({ now: expiryNow, limit: config.expiryLimit }),
    ]);
    const completedAt = validClockDate(clock);
    const primary = successfulRoutes[0]!;
    const result: CompetitionCreditRuntimeResult = {
      status: routeResults.some((route) => route.status === 'blocked')
        ? 'blocked'
        : routeResults.some((route) => route.status === 'processing')
          ? 'processing'
          : 'open',
      periodId: primary.periodId,
      creditRunId: primary.creditRunId,
      batchesProcessed: routeResults.reduce((total, route) => total + route.batchesProcessed, 0),
      itemsApplied: routeResults.reduce((total, route) => total + route.itemsApplied, 0),
      pendingItems: routeResults.reduce((total, route) => total + route.pendingItems, 0),
      expiredReservations: reservations.expired,
      expiredLots: lots.expired,
      routeResults,
      completedAt: completedAt.toISOString(),
    };
    await coordinator.finishRun(runtimeRunId, lease, completedAt, result);
    return result;
  } catch (error) {
    const failedAt = validClockDate(clock);
    try {
      await coordinator.failRun(runtimeRunId, lease, failedAt, runtimeErrorCode(error));
    } catch {
      // The original domain failure remains authoritative; observability is best-effort here.
    }
    throw error;
  } finally {
    try {
      await coordinator.release(lease, validClockDate(clock));
    } catch {
      // Lease expiry is the final safety net when release loses its fence.
    }
  }
}
