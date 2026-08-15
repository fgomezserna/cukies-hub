import type { CukieMasterRoute } from '../rules';

export type CukieMasterRecalculationJob = {
  _id: string;
  walletNormalized: string;
  route: CukieMasterRoute;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  availableAt: Date;
  attempts: number;
  fenceToken: number;
  leasedBy?: string;
  leaseExpiresAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  lastErrorCode?: string;
  sourceType?: string;
  sourceId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const FULL_RECONCILIATION_ROUTE_BY_SOURCE = {
  'projected-positions': ['uki', 'nft'],
  'staking-positions': ['uki'],
  'vesting-positions': ['uki'],
  'presale-participants': ['uki'],
  'presale-entitlements': ['uki'],
  'nft-owners': ['nft'],
  'nft-active-locks': ['nft'],
} as const satisfies Record<string, readonly CukieMasterRoute[]>;

export function routedRecalculationJobId(baseId: string, route: CukieMasterRoute) {
  return `${baseId}:${route}`;
}

export function fullReconciliationRoutesForSource(sourceId: string) {
  const routes = FULL_RECONCILIATION_ROUTE_BY_SOURCE[
    sourceId as keyof typeof FULL_RECONCILIATION_ROUTE_BY_SOURCE
  ];
  if (!routes) throw new Error(`Fuente de reconciliacion Cukie Master desconocida: ${sourceId}.`);
  return routes;
}

export function recalculationRetryBackoffMs(attempts: number) {
  const bounded = Math.max(1, Math.min(10, Math.trunc(attempts)));
  return Math.min(6 * 60 * 60_000, 5_000 * (2 ** (bounded - 1)));
}

export function recalculationFenceFilter(
  job: Pick<CukieMasterRecalculationJob, '_id' | 'fenceToken'>,
  workerId: string,
) {
  return {
    _id: job._id,
    status: 'processing' as const,
    leasedBy: workerId,
    fenceToken: job.fenceToken,
  };
}
