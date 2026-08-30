import {
  buildDashboardSummary,
  type DashboardModulePayloads,
  type DashboardSummaryDependencies,
} from '@/lib/dashboard/summary';

const now = new Date('2026-08-30T12:00:00.000Z');
const wallet = '0x1111111111111111111111111111111111111111';

const payloads: DashboardModulePayloads = {
  cukieMaster: {
    allocatedSlots: 2,
    desiredSlots: 2,
    maxPotentialSlots: 10,
    routes: {
      uki: { allocatedSlots: 2, desiredSlots: 2, sourceComplete: true, projectionFresh: true, synchronizing: false },
      nft: { allocatedSlots: 0, desiredSlots: 0, sourceComplete: true, projectionFresh: true, synchronizing: false },
    },
  },
  credits: {
    availableCredits: 200,
    reservedCredits: 10,
    spentCredits: 40,
    poolDepositedCredits: 50,
    poolAvailableCredits: 500,
    activeReservations: 1,
  },
  cukiePool: { positions: 2, activePositions: 1, gamesRemaining: 7 },
  rewards: { claimableRaw: '1000', allocations: 3, claims: 1, claimPublished: true, blockedAllocations: 0 },
  marketplace: { inventory: 4, listingEligible: 3, activeListings: 1, attentionListings: 0 },
  vesting: {
    chainId: 97,
    configFrozen: true,
    hasPosition: true,
    totalAmountRaw: '10000',
    releasedAmountRaw: '1000',
    releasableRaw: '2000',
    lockedAmountRaw: '7000',
    progressBps: 3000,
  },
  game: {
    configured: true,
    enabled: true,
    phase: 'active',
    campaignId: 'treasure-hunt-stage',
    eligibilityKind: 'uki_staking',
    attemptsGranted: 3,
    attemptsUsed: 1,
    attemptsRemaining: 2,
    bestRank: 5,
    totalTickets: 20,
  },
};

function dependencies(): DashboardSummaryDependencies {
  return {
    now: () => now,
    loadCukieMaster: jest.fn(async () => ({ data: payloads.cukieMaster, health: 'healthy' as const })),
    loadCredits: jest.fn(async () => ({
      data: payloads.credits,
      health: 'healthy' as const,
      sourceObservedAt: new Date('2026-08-30T11:59:00.000Z'),
    })),
    loadCukiePool: jest.fn(async () => ({ data: payloads.cukiePool, health: 'healthy' as const })),
    loadRewards: jest.fn(async () => ({ data: payloads.rewards, health: 'healthy' as const })),
    loadMarketplace: jest.fn(async () => ({ data: payloads.marketplace, health: 'healthy' as const })),
    loadVesting: jest.fn(async () => ({ data: payloads.vesting, health: 'healthy' as const })),
    loadGame: jest.fn(async () => ({ data: payloads.game, health: 'healthy' as const })),
  };
}

function input(runtimeDependencies: DashboardSummaryDependencies) {
  return {
    identity: {
      username: 'tester',
      walletNormalized: wallet,
      sessionExpiresAt: '2026-09-30T12:00:00.000Z',
    },
    runtime: { environment: 'staging' as const, chainId: 97 as const },
    dependencies: runtimeDependencies,
  };
}

describe('dashboard aggregate summary', () => {
  it('agrega en paralelo módulos saludables con identidad, red y freshness', async () => {
    const runtimeDependencies = dependencies();
    const result = await buildDashboardSummary(input(runtimeDependencies));

    expect(result).toMatchObject({
      schemaVersion: 'dashboard-staging-v1',
      generatedAt: now.toISOString(),
      overallState: 'ready',
      identity: { username: 'tester', walletNormalized: wallet },
      network: { environment: 'staging', chainId: 97 },
      alerts: [],
      modules: {
        credits: {
          state: 'ready',
          sourceObservedAt: '2026-08-30T11:59:00.000Z',
          data: { availableCredits: 200 },
        },
      },
    });
    for (const loader of Object.entries(runtimeDependencies)
      .filter(([name]) => name.startsWith('load'))
      .map(([, value]) => value as jest.Mock)) {
      expect(loader).toHaveBeenCalledWith(wallet, now);
    }
  });

  it('conserva los módulos válidos y marca solo la fuente fallida', async () => {
    const runtimeDependencies = dependencies();
    runtimeDependencies.loadRewards = jest.fn(async () => {
      throw new Error('mongo unavailable');
    });

    const result = await buildDashboardSummary(input(runtimeDependencies));

    expect(result.overallState).toBe('partial');
    expect(result.modules.credits.state).toBe('ready');
    expect(result.modules.rewards).toEqual({
      state: 'unavailable',
      generatedAt: now.toISOString(),
      sourceObservedAt: null,
      issues: ['MODULE_UNAVAILABLE'],
      data: null,
    });
    expect(result.alerts).toContainEqual({
      module: 'rewards',
      severity: 'error',
      code: 'MODULE_UNAVAILABLE',
    });
  });

  it('mantiene datos degradados y no acepta timestamps futuros como freshness', async () => {
    const runtimeDependencies = dependencies();
    runtimeDependencies.loadCredits = jest.fn(async () => ({
      data: payloads.credits,
      health: 'degraded' as const,
      sourceObservedAt: new Date('2026-08-30T12:05:00.000Z'),
      issues: ['CREDIT_GRANTS_NOT_FRESH', 'CREDIT_GRANTS_NOT_FRESH'],
    }));

    const result = await buildDashboardSummary(input(runtimeDependencies));

    expect(result.modules.credits).toMatchObject({
      state: 'degraded',
      sourceObservedAt: null,
      issues: ['CREDIT_GRANTS_NOT_FRESH'],
      data: { availableCredits: 200 },
    });
    expect(result.alerts).toContainEqual({
      module: 'credits',
      severity: 'warning',
      code: 'MODULE_DEGRADED',
    });
  });
});
