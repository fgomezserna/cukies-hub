import type { LegacyMarketplaceLiveState } from './live-marketplace';
import type { LegacyMarketplaceCukiItem } from './types';

export type LegacyMarketplaceReconciliation = {
  item: LegacyMarketplaceCukiItem;
  fingerprint: string;
  marketplaceListingStatus: 'active' | 'inactive';
};

export function buildLegacyMarketplaceReconciliation(
  item: LegacyMarketplaceCukiItem,
  live: Pick<
    LegacyMarketplaceLiveState,
    'owner' | 'isOnSale' | 'price' | 'priceOriginal'
  >,
): LegacyMarketplaceReconciliation {
  const canUseMarketplaceState = item.state === 'available' || item.state === 'onSale';
  const state = canUseMarketplaceState
    ? live.isOnSale ? 'onSale' : 'available'
    : item.state;
  const priceOriginal = live.isOnSale ? live.priceOriginal : '0';
  const price = live.isOnSale ? live.price : 0;
  const marketplaceListingStatus = live.isOnSale ? 'active' : 'inactive';
  const fingerprint = [
    item.network,
    live.owner,
    marketplaceListingStatus,
    priceOriginal,
  ].join(':');
  return {
    item: {
      ...item,
      owner: live.owner,
      state,
      price,
      priceOriginal,
    },
    fingerprint,
    marketplaceListingStatus,
  };
}
