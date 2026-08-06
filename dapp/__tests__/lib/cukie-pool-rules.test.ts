import {
  CUKIE_POOL_GAMES_QUOTA,
  CUKIE_POOL_MATURITY_MS,
  deterministicSeikuAssetId,
  firstPoolEligibilityAt,
  gamesQuota,
} from '@/lib/uki-economy/cukie-pool/rules';

describe('Cukie Pool rules', () => {
  it('keeps the exact game quotas for Original and second generation Cukies', () => {
    expect(CUKIE_POOL_GAMES_QUOTA.original).toEqual({
      common: 2,
      uncommon: 4,
      rare: 6,
      epic: 8,
      legendary: 10,
      goat: 12,
    });
    expect(CUKIE_POOL_GAMES_QUOTA.second_generation).toEqual({
      common: 1,
      uncommon: 2,
      rare: 3,
      epic: 4,
      legendary: 5,
      goat: 6,
    });
    expect(gamesQuota('original', 'goat')).toBe(12);
    expect(gamesQuota('second_generation', 'goat')).toBe(6);
  });

  it('uses an exact 24 hour owner-reward eligibility and a deterministic session-bound Seiku', () => {
    const stakedAt = new Date('2026-07-10T10:00:00.000Z');
    expect(firstPoolEligibilityAt(stakedAt).getTime() - stakedAt.getTime()).toBe(
      CUKIE_POOL_MATURITY_MS,
    );
    expect(deterministicSeikuAssetId('session-1')).toBe(
      deterministicSeikuAssetId('session-1'),
    );
    expect(deterministicSeikuAssetId('session-1')).not.toBe(
      deterministicSeikuAssetId('session-2'),
    );
  });
});
