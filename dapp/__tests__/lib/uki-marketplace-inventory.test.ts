import type { CukieMasterNftInventoryItem } from '@/lib/uki-economy/cukie-master/nft-operations';
import { buildUkiMarketplaceSellerInventory } from '@/lib/uki-marketplace/inventory';
import type { UkiMarketplacePublicConfig } from '@/lib/uki-marketplace/public-config';

const marketplace = '0x1111111111111111111111111111111111111111';
const collection = '0x2222222222222222222222222222222222222222';
const config: UkiMarketplacePublicConfig = {
  ready: true,
  chainId: 97,
  marketplaceAddress: marketplace,
  collectionAddresses: [collection],
  explorerBaseUrl: 'https://testnet.bscscan.com',
  issues: [],
};

function inventoryItem(
  override: Partial<CukieMasterNftInventoryItem> = {},
): CukieMasterNftInventoryItem {
  return {
    assetId: `97:${collection}:73`,
    canonicalAssetId: `97:${collection}:73`,
    collectionAddress: collection,
    tokenId: '73',
    imageUrl: '/cuki/73.png',
    rarity: 'rare',
    rarityPoints: 3,
    contributesToCukieMaster: false,
    contributionPoints: 0,
    state: 'available',
    custody: 'wallet',
    custodyMode: 'custodial',
    depositEpoch: null,
    blockers: [],
    lock: null,
    canDeposit: true,
    canWithdraw: false,
    canSoftStake: false,
    canUnstake: false,
    ...override,
  };
}

describe('inventario vendedor UKI', () => {
  it('publica solo identidades canónicas de la colección Stage', () => {
    expect(buildUkiMarketplaceSellerInventory({
      config,
      items: [
        inventoryItem(),
        inventoryItem({
          assetId: '97:0x3333333333333333333333333333333333333333:74',
          canonicalAssetId: '97:0x3333333333333333333333333333333333333333:74',
          collectionAddress: '0x3333333333333333333333333333333333333333',
          tokenId: '74',
        }),
        inventoryItem({ custody: 'cukie_master_nft_vault', canDeposit: false, canWithdraw: true }),
      ],
    })).toEqual([expect.objectContaining({
      assetId: `97:${collection}:73`,
      listingEligible: true,
      listingBlockers: [],
    })]);
  });

  it('permite segunda generación aunque no compute para Cukie Master', () => {
    const [item] = buildUkiMarketplaceSellerInventory({
      config,
      items: [inventoryItem({ blockers: ['second_generation'] })],
    });
    expect(item.listingEligible).toBe(true);
  });

  it('mantiene visibles pero bloqueados los activos con otra actividad', () => {
    const [item] = buildUkiMarketplaceSellerInventory({
      config,
      items: [inventoryItem({ state: 'onSale', blockers: ['listed'] })],
    });
    expect(item).toMatchObject({
      listingEligible: false,
      listingBlockers: ['asset_not_available', 'conflicting_activity'],
    });
  });

  it('oculta duplicados y ownership no verificable para fallar cerrado', () => {
    expect(buildUkiMarketplaceSellerInventory({
      config,
      items: [inventoryItem(), inventoryItem()],
    })).toEqual([]);
    expect(buildUkiMarketplaceSellerInventory({
      config,
      items: [inventoryItem({ blockers: ['owner_mismatch'] })],
    })).toEqual([]);
  });
});
