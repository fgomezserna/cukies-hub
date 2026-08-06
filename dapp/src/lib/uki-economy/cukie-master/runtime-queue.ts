export type CukieMasterRecalculationJob = {
  _id: string;
  walletNormalized: string;
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
  createdAt: Date;
  updatedAt: Date;
};

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
