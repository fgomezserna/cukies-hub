import 'server-only';

import type { CukieMasterNftInventoryItem } from '@/lib/uki-economy/cukie-master/nft-operations';

import {
  UkiMarketplaceUnavailableError,
  UkiMarketplaceValidationError,
} from './errors';
import { ukiMarketplacePublicConfig, type UkiMarketplacePublicConfig } from './public-config';
import { ukiMarketplaceRuntime } from './runtime';
import type {
  UkiMarketplaceInventoryBlocker,
  UkiMarketplaceInventoryItem,
  UkiMarketplaceRuntime,
} from './types';

const CANONICAL_TOKEN_ID = /^(0|[1-9][0-9]*)$/;
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);
const NON_LISTING_METADATA_BLOCKERS = new Set([
  'second_generation',
  'missing_generation',
  'missing_rarity',
]);

export type UkiMarketplaceInventoryDependencies = {
  runtime: UkiMarketplaceRuntime;
  publicConfig: UkiMarketplacePublicConfig;
  loadInventory: (walletAddress: string) => Promise<CukieMasterNftInventoryItem[]>;
};

function defaultDependencies(): UkiMarketplaceInventoryDependencies {
  return {
    runtime: ukiMarketplaceRuntime,
    publicConfig: ukiMarketplacePublicConfig,
    loadInventory: async (walletAddress) => {
      const { getCukieMasterNftInventory } = await import(
        '@/lib/uki-economy/cukie-master/nft-operations'
      );
      return getCukieMasterNftInventory(walletAddress);
    },
  };
}

function exactTokenId(value: string | null) {
  if (!value || !CANONICAL_TOKEN_ID.test(value)) return null;
  try {
    return BigInt(value) <= MAX_UINT256 ? value : null;
  } catch {
    return null;
  }
}

function sameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function validateDependencies(dependencies: UkiMarketplaceInventoryDependencies) {
  const { runtime, publicConfig } = dependencies;
  if (
    !runtime.ready
    || !runtime.chainId
    || !runtime.marketplaceAddress
    || !publicConfig.ready
    || !publicConfig.chainId
    || !publicConfig.marketplaceAddress
    || runtime.chainId !== publicConfig.chainId
    || !sameAddress(runtime.marketplaceAddress, publicConfig.marketplaceAddress)
    || publicConfig.collectionAddresses.length === 0
  ) {
    throw new UkiMarketplaceUnavailableError();
  }
  return publicConfig;
}

export function buildUkiMarketplaceSellerInventory(input: {
  items: CukieMasterNftInventoryItem[];
  config: UkiMarketplacePublicConfig;
}): UkiMarketplaceInventoryItem[] {
  if (!input.config.ready || !input.config.chainId) {
    throw new UkiMarketplaceUnavailableError();
  }
  const collections = new Set(
    input.config.collectionAddresses.map((address) => address.toLowerCase()),
  );
  const canonical = input.items.flatMap((item) => {
    const collectionAddress = item.collectionAddress?.toLowerCase();
    const tokenId = exactTokenId(item.tokenId);
    if (
      item.custody !== 'wallet'
      || item.custodyMode !== 'custodial'
      || !collectionAddress
      || !collections.has(collectionAddress)
      || tokenId === null
      || item.canonicalAssetId !== `${input.config.chainId}:${collectionAddress}:${tokenId}`
      || item.assetId !== item.canonicalAssetId
      || item.blockers.includes('owner_mismatch')
      || item.blockers.includes('unknown_owner')
    ) return [];

    const listingBlockers: UkiMarketplaceInventoryBlocker[] = [];
    if (item.state !== 'available') listingBlockers.push('asset_not_available');
    if (item.blockers.some((blocker) => !NON_LISTING_METADATA_BLOCKERS.has(blocker))) {
      listingBlockers.push('conflicting_activity');
    }
    return [{
      assetId: item.assetId,
      collectionAddress: collectionAddress as `0x${string}`,
      tokenId,
      imageUrl: item.imageUrl,
      rarity: item.rarity,
      state: item.state,
      listingEligible: listingBlockers.length === 0,
      listingBlockers: [...new Set(listingBlockers)],
    } satisfies UkiMarketplaceInventoryItem];
  });

  const counts = new Map<string, number>();
  for (const item of canonical) counts.set(item.assetId, (counts.get(item.assetId) ?? 0) + 1);
  return canonical
    .filter((item) => counts.get(item.assetId) === 1)
    .sort((left, right) => {
      const leftTokenId = BigInt(left.tokenId);
      const rightTokenId = BigInt(right.tokenId);
      return leftTokenId === rightTokenId ? 0 : leftTokenId < rightTokenId ? -1 : 1;
    });
}

export async function listUkiMarketplaceSellerInventory(
  input: { walletAddress: string },
  dependencies: UkiMarketplaceInventoryDependencies = defaultDependencies(),
) {
  const walletAddress = input.walletAddress.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress) || /^0x0{40}$/i.test(walletAddress)) {
    throw new UkiMarketplaceValidationError('walletAddress is not a valid EVM wallet');
  }
  const publicConfig = validateDependencies(dependencies);
  const items = await dependencies.loadInventory(walletAddress);
  return buildUkiMarketplaceSellerInventory({ items, config: publicConfig });
}
