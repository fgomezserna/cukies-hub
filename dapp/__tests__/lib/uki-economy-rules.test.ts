import {
  CUKIE_MASTER_DAILY_CREDITS_PER_SLOT,
  CUKIE_MASTER_MAX_TOTAL_SLOTS_PER_WALLET,
  CUKIE_MASTER_ROUTE_RULES,
  CUKIE_MASTER_UKI_REQUIREMENT_RAW,
  calculateCukieMasterUkiRouteSlotsRaw,
  calculateCukieMasterSlots,
} from '@/lib/uki-economy/rules';

describe('UKI economy Cukie Master rules', () => {
  it('caps the UKI route at 5 slots per wallet', () => {
    expect(
      calculateCukieMasterSlots({
        eligibleUki: 240_000,
        originalCukiePoints: 0,
      }),
    ).toMatchObject({
      ukiSlots: 5,
      nftSlots: 0,
      totalSlots: 5,
    });
  });

  it('caps the NFT route at 5 slots per wallet', () => {
    expect(
      calculateCukieMasterSlots({
        eligibleUki: 0,
        originalCukiePoints: 33,
      }),
    ).toMatchObject({
      ukiSlots: 0,
      nftSlots: 5,
      totalSlots: 5,
    });
  });

  it('allows 5 slots per route instead of 5 combined slots', () => {
    expect(
      calculateCukieMasterSlots({
        eligibleUki: 100_000,
        originalCukiePoints: 15,
      }),
    ).toEqual({
      ukiSlots: 5,
      nftSlots: 5,
      totalSlots: 10,
      maxTotalSlots: CUKIE_MASTER_MAX_TOTAL_SLOTS_PER_WALLET,
    });
  });

  it('keeps the configured launch requirements explicit', () => {
    expect(CUKIE_MASTER_ROUTE_RULES.uki).toMatchObject({
      initialGlobalSlots: 500,
      maxSlotsPerWallet: 5,
      requirementPerSlot: 20_000,
    });
    expect(CUKIE_MASTER_ROUTE_RULES.nft).toMatchObject({
      initialGlobalSlots: 500,
      maxSlotsPerWallet: 5,
      requirementPerSlot: 3,
    });
    expect(CUKIE_MASTER_DAILY_CREDITS_PER_SLOT).toBe(100);
    expect(CUKIE_MASTER_UKI_REQUIREMENT_RAW).toBe('20000000000000000000000');
    expect(calculateCukieMasterUkiRouteSlotsRaw('100000000000000000000000')).toBe(5);
  });
});
