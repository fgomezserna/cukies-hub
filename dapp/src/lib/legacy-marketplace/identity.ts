import { legacyMarketplaceContracts } from './config';
import type {
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceCukiReference,
} from './types';

type MarketplaceLegacyIdentity = Pick<
  LegacyMarketplaceCukiItem | LegacyMarketplaceCukiReference,
  'tokenId' | 'network'
>;

export function getLegacyMarketplaceCollection(network: string | null) {
  if (network === 'BSC') return legacyMarketplaceContracts.bsc.contracts.token;
  if (network === 'TRON') return legacyMarketplaceContracts.tron.contracts.token;
  return null;
}

export function getLegacyMarketplaceDetailHref(
  item: MarketplaceLegacyIdentity,
) {
  const params = new URLSearchParams({ source: 'legacy' });
  if (item.network) params.set('network', item.network);
  const collection = getLegacyMarketplaceCollection(item.network);
  if (collection) params.set('collection', collection);
  return `/marketplace/${encodeURIComponent(item.tokenId)}?${params.toString()}`;
}

export function matchesLegacyMarketplaceIdentity(
  item: LegacyMarketplaceCukiItem,
  input: { network?: string; collection?: string },
) {
  if (input.network && input.network !== item.network) return false;
  if (input.collection) {
    if (!item.collectionAddress) return false;
    const matchesCollection = item.network === 'BSC'
      ? input.collection.toLowerCase() === item.collectionAddress.toLowerCase()
      : input.collection === item.collectionAddress;
    if (!matchesCollection) return false;
  }
  return true;
}
