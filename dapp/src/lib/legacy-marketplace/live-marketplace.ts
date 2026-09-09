import { TronWeb } from 'tronweb';
import { formatEther } from 'viem';

import { legacyBscPublicClient } from './bsc';
import { legacyMarketplaceBscAbis, legacyMarketplaceTronAbis } from './abis';
import { legacyMarketplaceContracts } from './config';
import type { LegacyMarketplaceCukiItem } from './types';

type BscMarketToken = readonly [string, bigint, bigint, boolean, bigint, bigint];
export type LegacyMarketplaceUnavailableNetwork = 'BSC' | 'TRON';
export type LegacyMarketplacePausedNetwork = 'BSC' | 'TRON';
export type LegacyMarketplaceLiveState = {
  network: LegacyMarketplaceUnavailableNetwork;
  owner: string;
  isOnSale: boolean;
  paused: boolean;
  price: number;
  priceOriginal: string;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs = 5_000) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timeout = setTimeout(
        () => reject(new Error('LEGACY_MARKETPLACE_RPC_TIMEOUT')),
        timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function tronField(value: unknown, name: string, index: number) {
  if (Array.isArray(value)) return value[index];
  if (value && typeof value === 'object') {
    return (value as Record<string, unknown>)[name]
      ?? (value as Record<string, unknown>)[String(index)];
  }
  return undefined;
}

function integer(value: unknown) {
  const normalized = value && typeof value === 'object' && 'toString' in value
    ? String(value)
    : typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string'
      ? String(value)
      : '';
  if (!/^\d+$/.test(normalized)) throw new Error('INVALID_LEGACY_MARKETPLACE_VALUE');
  return BigInt(normalized);
}

export function selectLegacyMarketplaceOwner(
  tokenOwner: unknown,
  listingOwner: unknown,
  isOnSale: boolean,
) {
  const normalizedTokenOwner = String(tokenOwner ?? '').trim();
  if (!isOnSale) return normalizedTokenOwner;

  const normalizedListingOwner = String(listingOwner ?? '').trim();
  if (!normalizedListingOwner) {
    throw new Error('INVALID_LEGACY_MARKETPLACE_LISTING_OWNER');
  }

  return normalizedListingOwner;
}

function bscLiveState(
  owner: string,
  listing: BscMarketToken,
  paused: boolean,
): LegacyMarketplaceLiveState {
  const priceOriginal = listing[1].toString();
  const isOnSale = listing[3] && listing[1] > BigInt(0);
  return {
    network: 'BSC',
    owner: selectLegacyMarketplaceOwner(owner, listing[0], isOnSale),
    isOnSale,
    paused,
    price: Number(formatEther(listing[1])) * 10_000,
    priceOriginal,
  };
}

function tronLiveState(
  item: LegacyMarketplaceCukiItem,
  ownerValue: unknown,
  listing: unknown,
  pausedValue: unknown,
): LegacyMarketplaceLiveState {
  const price = integer(tronField(listing, 'price', 1));
  const isOnSale = tronField(listing, 'isOnSale', 3) === true && price > BigInt(0);
  const ownerHex = selectLegacyMarketplaceOwner(
    ownerValue,
    tronField(listing, 'owner', 0),
    isOnSale,
  );
  let owner = item.owner ?? ownerHex;
  try {
    owner = TronWeb.address.fromHex(ownerHex);
  } catch {
    owner = item.owner ?? ownerHex;
  }
  return {
    network: 'TRON',
    owner,
    isOnSale,
    paused:
      pausedValue === true
      || pausedValue === 1
      || pausedValue === '1'
      || pausedValue === 'true',
    price: Number(price) / 1_000_000,
    priceOriginal: price.toString(),
  };
}

export async function readLegacyMarketplaceLiveState(
  item: LegacyMarketplaceCukiItem,
): Promise<LegacyMarketplaceLiveState> {
  if (item.network === 'BSC') {
    const [paused, owner, listing] = await withTimeout(Promise.all([
      legacyBscPublicClient.readContract({
        address: legacyMarketplaceContracts.bsc.contracts.marketplace,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'paused',
      }),
      legacyBscPublicClient.readContract({
        address: legacyMarketplaceContracts.bsc.contracts.token,
        abi: legacyMarketplaceBscAbis.token,
        functionName: 'ownerOf',
        args: [BigInt(item.tokenId)],
      }),
      legacyBscPublicClient.readContract({
        address: legacyMarketplaceContracts.bsc.contracts.marketplace,
        abi: legacyMarketplaceBscAbis.marketplace,
        functionName: 'marketTokens',
        args: [BigInt(item.tokenId)],
      }),
    ]));
    return bscLiveState(String(owner), listing as BscMarketToken, Boolean(paused));
  }
  if (item.network !== 'TRON') throw new Error('INVALID_LEGACY_MARKETPLACE_NETWORK');
  const tronWeb = new TronWeb({
    fullHost: process.env.CUKIES_LEGACY_TRON_READ_RPC_URL?.trim()
      || legacyMarketplaceContracts.tron.readRpcUrl,
  });
  tronWeb.setAddress(legacyMarketplaceContracts.tron.contracts.token);
  const token = tronWeb.contract(
    legacyMarketplaceTronAbis.token as unknown as Parameters<typeof tronWeb.contract>[0],
    legacyMarketplaceContracts.tron.contracts.token,
  );
  const marketplace = tronWeb.contract(
    legacyMarketplaceTronAbis.marketplace as unknown as Parameters<typeof tronWeb.contract>[0],
    legacyMarketplaceContracts.tron.contracts.marketplace,
  );
  const [paused, owner, listing] = await withTimeout(Promise.all([
    marketplace.paused().call(),
    token.ownerOf(item.tokenId).call(),
    marketplace.marketTokens(item.tokenId).call(),
  ]));
  return tronLiveState(item, owner, listing, paused);
}

async function verifyBscListings(items: LegacyMarketplaceCukiItem[]) {
  if (items.length === 0) return { items: [], paused: false };
  const paused = await legacyBscPublicClient.readContract({
    address: legacyMarketplaceContracts.bsc.contracts.marketplace,
    abi: legacyMarketplaceBscAbis.marketplace,
    functionName: 'paused',
  });
  if (paused) return { items: [], paused: true };
  const listings = await legacyBscPublicClient.multicall({
    allowFailure: false,
    contracts: items.map((item) => ({
      address: legacyMarketplaceContracts.bsc.contracts.marketplace,
      abi: legacyMarketplaceBscAbis.marketplace,
      functionName: 'marketTokens',
      args: [BigInt(item.tokenId)],
    })),
  }) as BscMarketToken[];
  return {
    paused: false,
    items: items.flatMap((item, index) => {
      const listing = listings[index];
      if (!listing?.[3] || listing[1] <= BigInt(0)) return [];
      return [{
        ...item,
        owner: listing[0],
        state: 'onSale',
        priceOriginal: listing[1].toString(),
        price: Number(formatEther(listing[1])) * 10_000,
      }];
    }),
  };
}

async function verifyTronListings(items: LegacyMarketplaceCukiItem[]) {
  if (items.length === 0) return { items: [], paused: false };
  const tronWeb = new TronWeb({
    fullHost: process.env.CUKIES_LEGACY_TRON_READ_RPC_URL?.trim()
      || legacyMarketplaceContracts.tron.readRpcUrl,
  });
  tronWeb.setAddress(legacyMarketplaceContracts.tron.contracts.token);
  const marketplace = tronWeb.contract(
    legacyMarketplaceTronAbis.marketplace as unknown as Parameters<typeof tronWeb.contract>[0],
    legacyMarketplaceContracts.tron.contracts.marketplace,
  );
  const paused = await marketplace.paused().call();
  if (paused === true || paused === 1 || paused === '1' || paused === 'true') {
    return { items: [], paused: true };
  }
  const listings: unknown[] = [];
  const concurrency = 24;
  for (let offset = 0; offset < items.length; offset += concurrency) {
    const batch = items.slice(offset, offset + concurrency);
    listings.push(...await Promise.all(
      batch.map((item) => marketplace.marketTokens(item.tokenId).call()),
    ));
  }
  return {
    paused: false,
    items: items.flatMap((item, index) => {
      const listing = listings[index];
      const isOnSale = tronField(listing, 'isOnSale', 3);
      const price = integer(tronField(listing, 'price', 1));
      if (isOnSale !== true || price <= BigInt(0)) return [];
      const ownerHex = String(tronField(listing, 'owner', 0) ?? '');
      let owner = item.owner;
      try {
        owner = TronWeb.address.fromHex(ownerHex);
      } catch {
        owner = item.owner;
      }
      return [{
        ...item,
        owner,
        state: 'onSale',
        priceOriginal: price.toString(),
        price: Number(price) / 1_000_000,
      }];
    }),
  };
}

export async function verifyLegacyMarketplaceListings(
  items: LegacyMarketplaceCukiItem[],
) {
  const result = await verifyLegacyMarketplaceListingsByNetwork(items);
  if (result.unavailableNetworks.length > 0) {
    throw new Error('LEGACY_MARKETPLACE_RPC_UNAVAILABLE');
  }
  if (result.pausedNetworks.length > 0) {
    throw new Error('LEGACY_MARKETPLACE_PAUSED');
  }
  return result.items;
}

export async function verifyLegacyMarketplaceListingsByNetwork(
  items: LegacyMarketplaceCukiItem[],
) {
  const bsc = items.filter((item) => item.network === 'BSC');
  const tron = items.filter((item) => item.network === 'TRON');
  const [bscResult, tronResult] = await Promise.allSettled([
    bsc.length > 0
      ? withTimeout(verifyBscListings(bsc))
      : Promise.resolve({ items: [], paused: false }),
    tron.length > 0
      ? withTimeout(verifyTronListings(tron))
      : Promise.resolve({ items: [], paused: false }),
  ]);
  const unavailableNetworks: LegacyMarketplaceUnavailableNetwork[] = [];
  const pausedNetworks: LegacyMarketplacePausedNetwork[] = [];
  if (bsc.length > 0 && bscResult.status === 'rejected') unavailableNetworks.push('BSC');
  if (tron.length > 0 && tronResult.status === 'rejected') unavailableNetworks.push('TRON');
  if (bscResult.status === 'fulfilled' && bscResult.value.paused) pausedNetworks.push('BSC');
  if (tronResult.status === 'fulfilled' && tronResult.value.paused) pausedNetworks.push('TRON');
  const verifiedBsc = bscResult.status === 'fulfilled' ? bscResult.value.items : [];
  const verifiedTron = tronResult.status === 'fulfilled' ? tronResult.value.items : [];
  const verified = new Map(
    [...verifiedBsc, ...verifiedTron].map((item) => [
      `${item.network}:${item.tokenId}`,
      item,
    ]),
  );
  return {
    items: items.flatMap((item) => {
      const current = verified.get(`${item.network}:${item.tokenId}`);
      return current ? [current] : [];
    }),
    unavailableNetworks,
    pausedNetworks,
  };
}
