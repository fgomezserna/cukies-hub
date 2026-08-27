import {
  CukiePoolRuntimeBusyError,
  CukiePoolRuntimeConfigurationError,
  loadCukiePoolRuntimeConfig,
  runCukiePoolRuntimeTick,
  type CukiePoolRuntimeConfig,
  type CukiePoolRuntimeCoordinator,
  type CukiePoolRuntimeLease,
  type CukiePoolRuntimeServices,
} from '@/lib/uki-economy/cukie-pool/runtime';

const NOW = new Date('2026-07-10T12:00:00.000Z');
const CONFIG: CukiePoolRuntimeConfig = {
  enabled: true,
  gameExpiryLimit: 25,
  orphanExpiryLimit: 50,
  reconciliationLimit: 100,
  maxReconciliationBatches: 2,
  leaseMs: 600_000,
};

class MemoryCoordinator implements CukiePoolRuntimeCoordinator {
  lease: CukiePoolRuntimeLease | null = {
    leasedBy: 'worker:lease',
    fenceToken: 1,
    leaseExpiresAt: new Date(NOW.getTime() + CONFIG.leaseMs),
  };

  cursor: string | null = null;
  finished = false;
  failed = false;
  released = false;

  async acquire() {
    return this.lease;
  }

  async renew(lease: CukiePoolRuntimeLease) {
    return lease;
  }

  async release() {
    this.released = true;
  }

  async startRun() {
    return 'run-1';
  }

  async loadReconciliationCursor() {
    return this.cursor;
  }

  async finishRun(
    _runId: string,
    _lease: CukiePoolRuntimeLease,
    _now: Date,
    result: Awaited<ReturnType<typeof runCukiePoolRuntimeTick>>,
  ) {
    this.finished = true;
    this.cursor = result.reconciliation.nextCursor;
  }

  async failRun() {
    this.failed = true;
  }
}

function services(events: string[]): CukiePoolRuntimeServices {
  let reconciliationCalls = 0;
  return {
    async expireGameSessions() {
      events.push('game-expiry');
      return {
        sessions: [{ sessionId: 'game-1' }],
        failures: [{ sessionId: 'game-2', code: 'EXTERNAL_RESOURCE_FAILURE' }],
      };
    },
    async expireOrphanAssignments() {
      events.push('orphan-expiry');
      return { scanned: 2, expired: 1, skipped: 1 };
    },
    async reconcilePositions(input) {
      events.push(`reconcile:${input.afterPositionId ?? 'start'}`);
      reconciliationCalls += 1;
      return {
        scanned: 100,
        invalidated: reconciliationCalls,
        skipped: 100 - reconciliationCalls,
        nextCursor: reconciliationCalls === 1 ? 'position-100' : null,
      };
    },
  };
}

describe('Cukie Pool runtime', () => {
  it('is disabled by default and validates lease safety against timeout', () => {
    expect(loadCukiePoolRuntimeConfig({})).toMatchObject({ enabled: false });
    expect(() => loadCukiePoolRuntimeConfig({
      CUKIE_POOL_RUNTIME_ENABLED: 'true',
      CUKIE_POOL_TICK_TIMEOUT_MS: '240000',
      CUKIE_POOL_TICK_LEASE_MS: '299999',
    })).toThrow(CukiePoolRuntimeConfigurationError);
    expect(loadCukiePoolRuntimeConfig({
      CUKIE_POOL_RUNTIME_ENABLED: 'true',
      CUKIE_POOL_TICK_TIMEOUT_MS: '240000',
      CUKIE_POOL_TICK_LEASE_MS: '300000',
    })).toMatchObject({ enabled: true, leaseMs: 300_000 });
  });

  it('runs GameEconomy expiry before orphan cleanup and paged reconciliation', async () => {
    const events: string[] = [];
    const coordinator = new MemoryCoordinator();
    const result = await runCukiePoolRuntimeTick({
      workerId: 'test-worker',
      config: CONFIG,
      clock: () => NOW,
      coordinator,
      services: services(events),
    });

    expect(events).toEqual([
      'game-expiry',
      'orphan-expiry',
      'reconcile:start',
      'reconcile:position-100',
    ]);
    expect(result).toMatchObject({
      gameSessionsClosed: 1,
      gameSessionFailures: [{ sessionId: 'game-2', code: 'EXTERNAL_RESOURCE_FAILURE' }],
      orphanAssignments: { scanned: 2, expired: 1, skipped: 1 },
      reconciliation: {
        batches: 2,
        scanned: 200,
        invalidated: 3,
        skipped: 197,
        nextCursor: null,
      },
    });
    expect(coordinator.finished).toBe(true);
    expect(coordinator.failed).toBe(false);
    expect(coordinator.released).toBe(true);
  });

  it('fails closed before pool cleanup when GameEconomy expiry cannot run', async () => {
    const events: string[] = [];
    const coordinator = new MemoryCoordinator();
    const runtimeServices = services(events);
    runtimeServices.expireGameSessions = async () => {
      events.push('game-expiry');
      throw new Error('game source unavailable');
    };
    await expect(runCukiePoolRuntimeTick({
      workerId: 'test-worker',
      config: CONFIG,
      clock: () => NOW,
      coordinator,
      services: runtimeServices,
    })).rejects.toThrow('game source unavailable');
    expect(events).toEqual(['game-expiry']);
    expect(coordinator.failed).toBe(true);
    expect(coordinator.released).toBe(true);
  });

  it('rejects a concurrent tick while the runtime lease is held', async () => {
    const coordinator = new MemoryCoordinator();
    coordinator.lease = null;
    await expect(runCukiePoolRuntimeTick({
      workerId: 'test-worker',
      config: CONFIG,
      clock: () => NOW,
      coordinator,
      services: services([]),
    })).rejects.toBeInstanceOf(CukiePoolRuntimeBusyError);
  });

  it('releases the lease when run observability cannot be created', async () => {
    const coordinator = new MemoryCoordinator();
    coordinator.startRun = async () => {
      throw new Error('run storage unavailable');
    };
    await expect(runCukiePoolRuntimeTick({
      workerId: 'test-worker',
      config: CONFIG,
      clock: () => NOW,
      coordinator,
      services: services([]),
    })).rejects.toThrow('run storage unavailable');
    expect(coordinator.failed).toBe(false);
    expect(coordinator.released).toBe(true);
  });
});
