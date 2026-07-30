import {
  calculateTreasureHuntPrizePoolRaw,
  calculateTreasureHuntPrizePoolUki,
  formatTreasureHuntUkiRaw,
  formatTreasureHuntPrizePoolUki,
  TREASURE_HUNT_TOKEN_SCALE,
} from '@/lib/treasure-hunt-prize-pool';

describe('Treasure Hunt prize pool', () => {
  it('applies the approved formula after the 3500 ASM threshold', () => {
    expect(calculateTreasureHuntPrizePoolUki({
      totalAsmRaised: 3_822,
      ukiPerAsm: 888,
      poolBps: 2_500,
    })).toBe(71_484);
  });

  it('does not create a pool before the threshold', () => {
    expect(calculateTreasureHuntPrizePoolUki({ totalAsmRaised: 3_500 })).toBe(0);
  });

  it('formats the accumulated prize as UKI', () => {
    expect(formatTreasureHuntPrizePoolUki(71_484)).toBe('71.484 UKI');
  });

  it('calculates the indexed pool with exact bigint arithmetic', () => {
    const pool = calculateTreasureHuntPrizePoolRaw({
      totalAsmRaisedRaw: BigInt(5_000) * TREASURE_HUNT_TOKEN_SCALE,
      totalUkiSoldRaw: BigInt(4_440_000) * TREASURE_HUNT_TOKEN_SCALE,
      poolBps: 2_500,
    });

    expect(pool).toBe(BigInt(333_000) * TREASURE_HUNT_TOKEN_SCALE);
    expect(formatTreasureHuntUkiRaw(pool)).toBe('333.000 UKI');
  });
});
