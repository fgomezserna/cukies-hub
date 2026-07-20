import 'server-only';

import { isIP } from 'node:net';

export type CompetitionRateLimitOperation =
  | 'start'
  | 'checkpoint'
  | 'finish'
  | 'attempts'
  | 'participant'
  | 'leaderboard'
  | 'status'
  | 'referral';

interface Bucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;
const LIMITS: Readonly<Record<CompetitionRateLimitOperation, number>> = {
  start: 10,
  checkpoint: 30,
  finish: 20,
  attempts: 60,
  participant: 30,
  leaderboard: 60,
  status: 60,
  referral: 30,
};

export class CompetitionFixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private calls = 0;

  private prune(nowMs: number) {
    for (const [bucketKey, candidate] of this.buckets) {
      if (candidate.resetAt <= nowMs) this.buckets.delete(bucketKey);
    }
    while (this.buckets.size >= MAX_BUCKETS) {
      const oldest = this.buckets.keys().next().value;
      if (typeof oldest !== 'string') break;
      this.buckets.delete(oldest);
    }
  }

  consume(input: {
    readonly key: string;
    readonly operation: CompetitionRateLimitOperation;
    readonly nowMs?: number;
  }) {
    const nowMs = input.nowMs ?? Date.now();
    const key = `${input.operation}:${input.key.trim().slice(0, 160) || 'anonymous'}`;
    const current = this.buckets.get(key);
    if (!current && this.buckets.size >= MAX_BUCKETS) this.prune(nowMs);
    const bucket = !current || current.resetAt <= nowMs
      ? { count: 0, resetAt: nowMs + WINDOW_MS }
      : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);

    this.calls += 1;
    if (this.calls % 1_000 === 0) this.prune(nowMs);

    return {
      allowed: bucket.count <= LIMITS[input.operation],
      limit: LIMITS[input.operation],
      remaining: Math.max(0, LIMITS[input.operation] - bucket.count),
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - nowMs) / 1_000)),
    };
  }

  reset() {
    this.buckets.clear();
    this.calls = 0;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var treasureHuntCompetitionRateLimiter: CompetitionFixedWindowRateLimiter | undefined;
}

export function getCompetitionRateLimiter() {
  global.treasureHuntCompetitionRateLimiter ??= new CompetitionFixedWindowRateLimiter();
  return global.treasureHuntCompetitionRateLimiter;
}

export function competitionRequestKey(request: Request) {
  const candidates = [
    request.headers.get('cf-connecting-ip')?.trim(),
    request.headers.get('x-real-ip')?.trim(),
    request.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim(),
  ];
  return candidates.find((candidate) => candidate && isIP(candidate)) ?? 'unknown';
}
