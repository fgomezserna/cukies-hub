export type MultiplayerRateLimitOperation =
  | 'join'
  | 'get'
  | 'heartbeat'
  | 'snapshot'
  | 'forfeit'
  | 'release';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const LIMITS: Readonly<Record<MultiplayerRateLimitOperation, number>> = {
  join: 12,
  get: 300,
  heartbeat: 120,
  snapshot: 600,
  forfeit: 20,
  release: 20,
};

export class MultiplayerFixedWindowRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private readonly windowMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  consume(input: {
    userId: string;
    operation: MultiplayerRateLimitOperation;
  }): boolean {
    const now = this.now();
    const key = `${input.operation}:${input.userId}`;
    const current = this.buckets.get(key);
    if (!current || now >= current.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.prune(now);
      return true;
    }
    if (current.count >= LIMITS[input.operation]) {
      return false;
    }
    current.count += 1;
    return true;
  }

  private prune(now: number) {
    if (this.buckets.size < 1_000) {
      return;
    }
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}
