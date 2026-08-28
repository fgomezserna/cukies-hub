import {
  CompetitionCreditRuntimeBusyError,
  CompetitionCreditRuntimeConfigurationError,
  loadCompetitionCreditRuntimeConfig,
  runCompetitionCreditRuntimeTick,
  type CompetitionCreditRuntimeConfig,
  type CompetitionCreditRuntimeCoordinator,
  type CompetitionCreditRuntimeLease,
  type CompetitionCreditRuntimeResult,
  type CompetitionCreditRuntimeServices,
} from '@/lib/uki-economy/credits/runtime';
import { currentCompetitionCreditPeriod } from '@/lib/uki-economy/credits/rules';
import {
  testCompetitionCreditRule,
  testCreditSourceWatermark,
} from '@/lib/uki-economy/credits/testing';
import type { CompetitionCreditRun } from '@/lib/uki-economy/credits/types';
import { DomainConflictError } from '@/lib/uki-economy/errors';

const now = new Date('2026-07-10T12:05:00.000Z');
const rule = testCompetitionCreditRule();
const period = currentCompetitionCreditPeriod(now, rule);

const config: CompetitionCreditRuntimeConfig = {
  enabled: true,
  expectedRuleVersion: rule.version,
  batchLimit: 50,
  maxBatchesPerTick: 2,
  expiryLimit: 100,
  leaseMs: 600_000,
};

function creditRun(status: CompetitionCreditRun['status'] = 'snapshotted'): CompetitionCreditRun {
  return {
    _id: 'credit-run-1',
    runId: 'credit-run-1',
    route: 'uki',
    period,
    settlementPeriod: period,
    status,
    expectedItemCount: 2,
    expectedGrantCredits: 200,
    expectedOwnCredits: 200,
    expectedPoolCredits: 0,
    expectedHeldCount: 0,
    sourceWatermark: testCreditSourceWatermark(),
    cutoffBlock: {
      blockNumber: 999,
      blockHash: `0x${"e".repeat(64)}`,
      blockTimestamp: new Date("2026-07-10T11:59:59.000Z"),
    },
    sourceSnapshotHash: 'b'.repeat(64),
    snapshotHash: 'a'.repeat(64),
    fenceToken: status === 'processing' ? 1 : 0,
    ...(status === 'processing'
      ? { leaseOwner: 'credit-worker', leaseExpiresAt: new Date(now.getTime() + 300_000) }
      : {}),
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryCoordinator implements CompetitionCreditRuntimeCoordinator {
  busy = false;
  failed: string[] = [];
  failedRoutes: CompetitionCreditRuntimeResult['routeResults'][] = [];
  finished: CompetitionCreditRuntimeResult[] = [];
  released = 0;
  lease: CompetitionCreditRuntimeLease = {
    leasedBy: 'credit-worker:lease',
    fenceToken: 1,
    leaseExpiresAt: new Date(now.getTime() + 600_000),
  };

  async acquire() {
    return this.busy ? null : this.lease;
  }

  async renew(lease: CompetitionCreditRuntimeLease) {
    return lease;
  }

  async release() {
    this.released += 1;
  }

  async startRun() {
    return 'runtime-run-1';
  }

  async finishRun(
    _runtimeRunId: string,
    _lease: CompetitionCreditRuntimeLease,
    _now: Date,
    result: CompetitionCreditRuntimeResult,
  ) {
    this.finished.push(result);
  }

  async failRun(
    _runtimeRunId: string,
    _lease: CompetitionCreditRuntimeLease,
    _now: Date,
    errorCode: string,
    routeResults: CompetitionCreditRuntimeResult['routeResults'] = [],
  ) {
    this.failed.push(errorCode);
    this.failedRoutes.push(routeResults);
  }
}

function services(overrides: Partial<CompetitionCreditRuntimeServices> = {}) {
  const snapshotted = creditRun();
  const processing = creditRun('processing');
  const opened = creditRun('open');
  return {
    refreshSourceWatermark: jest.fn().mockImplementation(({ route }) =>
      Promise.resolve(testCreditSourceWatermark({
        route,
        _id: `cukie-master-slots:${route}`,
      }))
    ),
    findOldestPendingRoutePeriod: jest.fn().mockResolvedValue(period),
    createDailyRun: jest.fn().mockResolvedValue(snapshotted),
    claimRun: jest.fn().mockResolvedValue(processing),
    processRunBatch: jest.fn().mockResolvedValue({ scanned: 2, applied: 2, pending: 0, done: true }),
    openRun: jest.fn().mockResolvedValue({
      run: opened,
      reconciliation: { ok: true, reasonCodes: [], evidenceHash: 'b'.repeat(64) },
    }),
    expireReservationsBatch: jest.fn().mockResolvedValue({ scanned: 1, expired: 1, skipped: 0 }),
    expireAvailableLotsBatch: jest.fn().mockResolvedValue({ scanned: 2, expired: 2, skipped: 0 }),
    ...overrides,
  } as unknown as CompetitionCreditRuntimeServices;
}

describe('competition credit runtime', () => {
  it('is disabled by default and requires an explicit pinned rule when enabled', () => {
    expect(loadCompetitionCreditRuntimeConfig({})).toMatchObject({
      enabled: false,
      batchLimit: 50,
    });
    expect(() => loadCompetitionCreditRuntimeConfig({
      COMPETITION_CREDITS_RUNTIME_ENABLED: 'true',
    })).toThrow(CompetitionCreditRuntimeConfigurationError);
    expect(() => loadCompetitionCreditRuntimeConfig({
      COMPETITION_CREDITS_RUNTIME_ENABLED: 'yes',
    })).toThrow(/true o false/);
    expect(() => loadCompetitionCreditRuntimeConfig({
      COMPETITION_CREDITS_BATCH_LIMIT: '101',
    })).toThrow(/entre 1 y 100/);
  });

  it('caps the configured batch limit to the active rule contract', async () => {
    const runtimeServices = services();

    await runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config: { ...config, batchLimit: 100 },
      clock: () => now,
      coordinator: new MemoryCoordinator(),
      services: runtimeServices,
      loadActiveRule: async () => ({ ...rule, maxBatchSize: 50 }),
    });

    expect(runtimeServices.processRunBatch).toHaveBeenCalledTimes(2);
    expect(runtimeServices.processRunBatch).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });

  it('refreshes, snapshots, fences, applies, opens and expires in one bounded tick', async () => {
    const coordinator = new MemoryCoordinator();
    const runtimeServices = services();

    const result = await runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator,
      services: runtimeServices,
      loadActiveRule: async () => rule,
    });

    expect(result).toMatchObject({
      status: 'open',
      creditRunId: 'credit-run-1',
      batchesProcessed: 2,
      itemsApplied: 4,
      pendingItems: 0,
      expiredReservations: 1,
      expiredLots: 2,
    });
    expect(runtimeServices.createDailyRun).toHaveBeenCalledWith({
      route: 'uki',
      cutoff: period.cutoff,
      expectedRuleVersion: rule.version,
      now,
    });
    expect(runtimeServices.refreshSourceWatermark).toHaveBeenCalledWith({
      route: 'uki',
      expectedRuleVersion: period.ruleVersion,
      ruleAt: period.cutoff,
      now,
    });
    expect(coordinator.finished).toHaveLength(1);
    expect(coordinator.failed).toHaveLength(0);
    expect(coordinator.released).toBe(1);
  });

  it('stops at the configured batch bound and leaves the run processing', async () => {
    const processRunBatch = jest.fn()
      .mockResolvedValueOnce({ scanned: 50, applied: 50, pending: 50, done: false })
      .mockResolvedValueOnce({ scanned: 50, applied: 50, pending: 10, done: false })
      .mockResolvedValueOnce({ scanned: 50, applied: 50, pending: 50, done: false })
      .mockResolvedValueOnce({ scanned: 50, applied: 50, pending: 10, done: false });
    const runtimeServices = services({ processRunBatch });

    const result = await runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator: new MemoryCoordinator(),
      services: runtimeServices,
      loadActiveRule: async () => rule,
    });

    expect(result.status).toBe('processing');
    expect(result.batchesProcessed).toBe(4);
    expect(result.itemsApplied).toBe(200);
    expect(result.pendingItems).toBe(20);
    expect(runtimeServices.openRun).not.toHaveBeenCalled();
  });

  it('reports a healthy waiting tick before the first eligible settlement', async () => {
    const coordinator = new MemoryCoordinator();
    const runtimeServices = services({
      findOldestPendingRoutePeriod: jest.fn().mockResolvedValue(null),
    });

    const result = await runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator,
      services: runtimeServices,
      loadActiveRule: async () => rule,
    });

    expect(result.status).toBe('waiting');
    expect(result.routeResults).toEqual([
      expect.objectContaining({ route: 'uki', status: 'waiting', creditRunId: '' }),
      expect.objectContaining({ route: 'nft', status: 'waiting', creditRunId: '' }),
    ]);
    expect(runtimeServices.refreshSourceWatermark).not.toHaveBeenCalled();
    expect(runtimeServices.createDailyRun).not.toHaveBeenCalled();
    expect(coordinator.failed).toHaveLength(0);
    expect(coordinator.finished).toHaveLength(1);
  });

  it('rejects an overlapping tick before mutating the economy', async () => {
    const coordinator = new MemoryCoordinator();
    coordinator.busy = true;
    const runtimeServices = services();

    await expect(runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator,
      services: runtimeServices,
      loadActiveRule: async () => rule,
    })).rejects.toBeInstanceOf(CompetitionCreditRuntimeBusyError);
    expect(runtimeServices.refreshSourceWatermark).not.toHaveBeenCalled();
  });

  it('records a bounded error code and releases the lease on failure', async () => {
    const coordinator = new MemoryCoordinator();
    const runtimeServices = services({
      createDailyRun: jest.fn().mockRejectedValue(new Error('sensitive upstream detail')),
    });

    await expect(runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator,
      services: runtimeServices,
      loadActiveRule: async () => rule,
    })).rejects.toThrow('sensitive upstream detail');
    expect(coordinator.failed).toEqual(['TICK_FAILED']);
    expect(coordinator.released).toBe(1);
  });

  it('opens a healthy route even when the other route remains blocked', async () => {
    const coordinator = new MemoryCoordinator();
    const runtimeServices = services({
      refreshSourceWatermark: jest.fn().mockImplementation(({ route }) =>
        route === 'nft'
          ? Promise.reject(new DomainConflictError('nft blocked', {
              reasonCode: 'SOURCE_UNHEALTHY',
            }))
          : Promise.resolve(testCreditSourceWatermark()),
      ),
    });

    const result = await runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator,
      services: runtimeServices,
      loadActiveRule: async () => rule,
    });

    expect(result.status).toBe('blocked');
    expect(result.routeResults).toEqual([
      expect.objectContaining({ route: 'uki', status: 'open' }),
      expect.objectContaining({
        route: 'nft',
        status: 'blocked',
        errorCode: 'DOMAIN_CONFLICT',
        reasonCodes: ['SOURCE_UNHEALTHY'],
      }),
    ]);
    expect(coordinator.failed).toHaveLength(0);
    expect(coordinator.finished).toHaveLength(1);
  });

  it('persists route-specific domain blockers before keeping the scheduler failure visible', async () => {
    const coordinator = new MemoryCoordinator();
    const runtimeServices = services({
      refreshSourceWatermark: jest.fn().mockImplementation(({ route }) =>
        Promise.reject(new DomainConflictError('blocked source', {
          reasonCode: 'SOURCE_UNHEALTHY',
          warnings: [`CHAIN_EVENTS_NOT_PROJECTED:${route.toUpperCase()}`],
        })),
      ),
    });

    await expect(runCompetitionCreditRuntimeTick({
      workerId: 'credit-worker',
      config,
      clock: () => now,
      coordinator,
      services: runtimeServices,
      loadActiveRule: async () => rule,
    })).rejects.toThrow('blocked source');

    expect(coordinator.failed).toEqual(['DOMAIN_CONFLICT']);
    expect(coordinator.failedRoutes[0]).toEqual([
      expect.objectContaining({
        route: 'uki',
        errorCode: 'DOMAIN_CONFLICT',
        reasonCodes: ['SOURCE_UNHEALTHY', 'CHAIN_EVENTS_NOT_PROJECTED:UKI'],
      }),
      expect.objectContaining({
        route: 'nft',
        errorCode: 'DOMAIN_CONFLICT',
        reasonCodes: ['SOURCE_UNHEALTHY', 'CHAIN_EVENTS_NOT_PROJECTED:NFT'],
      }),
    ]);
    expect(coordinator.finished).toHaveLength(0);
    expect(coordinator.released).toBe(1);
  });
});
