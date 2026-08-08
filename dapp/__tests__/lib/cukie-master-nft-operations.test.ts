import { getCukieMasterNftRouteSummaryFromDb } from '@/lib/nft-inventory';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { getCukieMasterNftInventory } from '@/lib/uki-economy/cukie-master/nft-operations';

jest.mock('@/lib/nft-inventory', () => ({
  getCukieMasterNftRouteSummaryFromDb: jest.fn(),
}));
jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
}));

const mockSummary = getCukieMasterNftRouteSummaryFromDb as jest.MockedFunction<
  typeof getCukieMasterNftRouteSummaryFromDb
>;
const mockDb = getEconomyDb as jest.MockedFunction<typeof getEconomyDb>;
const wallet = '0x1111111111111111111111111111111111111111';

function asset(
  assetId: string,
  tokenId: string,
  rarity: string,
  canonicalState: string,
  rarityPoints: number,
) {
  return { assetId, tokenId, rarity, canonicalState, rarityPoints } as never;
}

describe('getCukieMasterNftInventory', () => {
  it('separates potential rarity points from the contribution retained by compatible locks', async () => {
    mockSummary.mockResolvedValue({
      walletNormalized: wallet,
      eligibleAssets: [
        asset('cukies:soft', '42', 'rare', 'soft_staked', 4),
        asset('cukies:game', '43', 'epic', 'assigned_to_game', 7),
        asset('cukies:available', '44', 'common', 'available', 1),
      ],
      rejectedAssets: [{
        asset: asset('cukies:listed', '45', 'rare', 'listed', 4),
        blockers: ['listed'],
      }],
    } as never);
    const locks = [
      {
        assetId: 'cukies:soft', lockId: 'lock-soft', status: 'active', reason: 'soft_stake',
        ownerNormalized: wallet, fencingToken: 2,
      },
      {
        assetId: 'cukies:game', lockId: 'lock-game', status: 'active', reason: 'game_assignment',
        ownerNormalized: wallet, fencingToken: 3, retainsSoftStakeEntitlement: true,
      },
    ];
    mockDb.mockResolvedValue({
      collection: () => ({
        find: () => ({ toArray: async () => locks }),
      }),
    } as never);

    const inventory = await getCukieMasterNftInventory(wallet, new Date('2026-08-08T10:00:00.000Z'));
    const byId = new Map(inventory.map((item) => [item.assetId, item]));

    expect(byId.get('cukies:soft')).toEqual(expect.objectContaining({
      imageUrl: expect.stringContaining('/42.png'),
      rarityPoints: 4,
      contributesToCukieMaster: true,
      contributionPoints: 4,
      canUnstake: true,
    }));
    expect(byId.get('cukies:game')).toEqual(expect.objectContaining({
      rarityPoints: 7,
      contributesToCukieMaster: true,
      contributionPoints: 7,
      canUnstake: false,
    }));
    expect(byId.get('cukies:available')).toEqual(expect.objectContaining({
      rarityPoints: 1,
      contributesToCukieMaster: false,
      contributionPoints: 0,
      canSoftStake: true,
    }));
    expect(byId.get('cukies:listed')).toEqual(expect.objectContaining({
      rarityPoints: 4,
      contributesToCukieMaster: false,
      contributionPoints: 0,
      blockers: ['listed'],
    }));
  });
});
