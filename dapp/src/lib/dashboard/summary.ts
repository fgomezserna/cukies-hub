export const DASHBOARD_MODULE_IDS = [
  'cukieMaster',
  'credits',
  'cukiePool',
  'rewards',
  'marketplace',
  'vesting',
  'game',
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number];
export type DashboardModuleHealth = 'healthy' | 'degraded';

type SlotRouteSummary = {
  allocatedSlots: number;
  desiredSlots: number;
  sourceComplete: boolean;
  projectionFresh: boolean;
  synchronizing: boolean;
};

export type DashboardModulePayloads = {
  cukieMaster: {
    allocatedSlots: number;
    desiredSlots: number;
    maxPotentialSlots: number;
    routes: { uki: SlotRouteSummary; nft: SlotRouteSummary };
  };
  credits: {
    availableCredits: number;
    reservedCredits: number;
    spentCredits: number;
    poolDepositedCredits: number;
    poolAvailableCredits: number;
    activeReservations: number;
  };
  cukiePool: {
    positions: number;
    activePositions: number;
    gamesRemaining: number;
  };
  rewards: {
    claimableRaw: string;
    allocations: number;
    claims: number;
    claimPublished: boolean;
    blockedAllocations: number;
  };
  marketplace: {
    inventory: number;
    listingEligible: number;
    activeListings: number;
    attentionListings: number;
  };
  vesting: {
    chainId: 97;
    configFrozen: boolean;
    hasPosition: boolean;
    totalAmountRaw: string;
    releasedAmountRaw: string;
    releasableRaw: string;
    lockedAmountRaw: string;
    progressBps: number;
  };
  game: {
    configured: boolean;
    enabled: boolean;
    phase: string;
    campaignId: string | null;
    eligibilityKind: string | null;
    attemptsGranted: number | null;
    attemptsUsed: number | null;
    attemptsRemaining: number | null;
    bestRank: number | null;
    totalTickets: number | null;
  };
};

export type DashboardLoaderResult<T> = {
  data: T;
  health: DashboardModuleHealth;
  sourceObservedAt?: Date | null;
  issues?: string[];
};

export type DashboardSummaryDependencies = {
  now: () => Date;
} & {
  [K in DashboardModuleId as `load${Capitalize<K>}`]: (
    walletAddress: string,
    now: Date,
  ) => Promise<DashboardLoaderResult<DashboardModulePayloads[K]>>;
};

export type DashboardRuntime = {
  environment: 'staging';
  chainId: 97;
};

export type DashboardIdentity = {
  username: string | null;
  walletNormalized: string;
  sessionExpiresAt: string;
};

type ReadyDashboardModule<K extends DashboardModuleId> = {
  state: 'ready' | 'degraded';
  generatedAt: string;
  sourceObservedAt: string | null;
  issues: string[];
  data: DashboardModulePayloads[K];
};

type UnavailableDashboardModule = {
  state: 'unavailable';
  generatedAt: string;
  sourceObservedAt: null;
  issues: ['MODULE_UNAVAILABLE'];
  data: null;
};

export type DashboardModule<K extends DashboardModuleId> =
  | ReadyDashboardModule<K>
  | UnavailableDashboardModule;

export type DashboardSummary = {
  schemaVersion: 'dashboard-staging-v1';
  generatedAt: string;
  overallState: 'ready' | 'partial';
  identity: DashboardIdentity;
  network: DashboardRuntime;
  alerts: Array<{
    module: DashboardModuleId;
    severity: 'warning' | 'error';
    code: 'MODULE_DEGRADED' | 'MODULE_UNAVAILABLE';
  }>;
  modules: { [K in DashboardModuleId]: DashboardModule<K> };
};

function validNow(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new TypeError('DASHBOARD_CLOCK_INVALID');
  }
  return new Date(value.getTime());
}

function validObservedAt(value: Date | null | undefined, now: Date) {
  if (value === null || value === undefined) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  if (value.getTime() > now.getTime() + 60_000) return null;
  return value.toISOString();
}

function loaderName(module: DashboardModuleId): keyof DashboardSummaryDependencies {
  return `load${module[0].toUpperCase()}${module.slice(1)}` as keyof DashboardSummaryDependencies;
}

async function captureModule<K extends DashboardModuleId>(input: {
  module: K;
  walletAddress: string;
  now: Date;
  dependencies: DashboardSummaryDependencies;
}): Promise<DashboardModule<K>> {
  const generatedAt = input.now.toISOString();
  try {
    const loader = input.dependencies[loaderName(input.module)] as (
      walletAddress: string,
      now: Date,
    ) => Promise<DashboardLoaderResult<DashboardModulePayloads[K]>>;
    const result = await loader(input.walletAddress, input.now);
    const issues = [...new Set((result.issues ?? []).filter((issue) => (
      typeof issue === 'string' && issue.length > 0 && issue.length <= 120
    )))].sort();
    return {
      state: result.health === 'healthy' ? 'ready' : 'degraded',
      generatedAt,
      sourceObservedAt: validObservedAt(result.sourceObservedAt, input.now),
      issues,
      data: result.data,
    };
  } catch {
    return {
      state: 'unavailable',
      generatedAt,
      sourceObservedAt: null,
      issues: ['MODULE_UNAVAILABLE'],
      data: null,
    };
  }
}

export async function buildDashboardSummary(input: {
  identity: DashboardIdentity;
  runtime: DashboardRuntime;
  dependencies: DashboardSummaryDependencies;
}): Promise<DashboardSummary> {
  const now = validNow(input.dependencies.now());
  const entries = await Promise.all(DASHBOARD_MODULE_IDS.map(async (module) => (
    [module, await captureModule({
      module,
      walletAddress: input.identity.walletNormalized,
      now,
      dependencies: input.dependencies,
    })] as const
  )));
  const modules = Object.fromEntries(entries) as DashboardSummary['modules'];
  const alerts = DASHBOARD_MODULE_IDS.flatMap((module) => {
    const state = modules[module].state;
    if (state === 'ready') return [];
    return [{
      module,
      severity: state === 'unavailable' ? 'error' as const : 'warning' as const,
      code: state === 'unavailable'
        ? 'MODULE_UNAVAILABLE' as const
        : 'MODULE_DEGRADED' as const,
    }];
  });
  return {
    schemaVersion: 'dashboard-staging-v1',
    generatedAt: now.toISOString(),
    overallState: alerts.length === 0 ? 'ready' : 'partial',
    identity: input.identity,
    network: input.runtime,
    alerts,
    modules,
  };
}
