import {
  CompetitionFixedWindowRateLimiter,
  competitionRequestKey,
} from '@/lib/treasure-hunt-competition/server/rate-limit';

describe('Treasure Hunt competition rate limiting', () => {
  it('limits each operation and identity independently and resets its window', () => {
    const limiter = new CompetitionFixedWindowRateLimiter();

    for (let index = 0; index < 10; index += 1) {
      expect(limiter.consume({ key: 'wallet-a', operation: 'start', nowMs: 1_000 }).allowed)
        .toBe(true);
    }
    expect(limiter.consume({ key: 'wallet-a', operation: 'start', nowMs: 1_000 }))
      .toMatchObject({ allowed: false, remaining: 0 });
    expect(limiter.consume({ key: 'wallet-b', operation: 'start', nowMs: 1_000 }).allowed)
      .toBe(true);
    expect(limiter.consume({ key: 'wallet-a', operation: 'start', nowMs: 61_000 }).allowed)
      .toBe(true);
  });

  it('prefers Cloudflare or the closest trusted proxy address and rejects spoofed text', () => {
    expect(competitionRequestKey(new Request('https://hub.test', {
      headers: { 'x-forwarded-for': '203.0.113.10, 10.0.0.2' },
    }))).toBe('10.0.0.2');
    expect(competitionRequestKey(new Request('https://hub.test', {
      headers: {
        'cf-connecting-ip': '203.0.113.11',
        'x-real-ip': '10.0.0.3',
      },
    }))).toBe('203.0.113.11');
    expect(competitionRequestKey(new Request('https://hub.test', {
      headers: { 'x-forwarded-for': 'attacker-controlled' },
    }))).toBe('unknown');
    expect(competitionRequestKey(new Request('https://hub.test'))).toBe('unknown');
  });
});
