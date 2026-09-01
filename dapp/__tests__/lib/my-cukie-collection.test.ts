jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import type { Db } from 'mongodb';

import { parseUkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';
import { listMyCukieCollectionFromDb } from '@/lib/cukies-data/my-collection';

const wallet = '0x1111111111111111111111111111111111111111';
const collection = '0x3333333333333333333333333333333333333333';
const poolVault = '0x4444444444444444444444444444444444444444';
const masterVault = '0x5555555555555555555555555555555555555555';
const config = parseUkiNftVaultPublicConfig({
  chainId: '97',
  collectionAddress: collection,
  cukiePoolNftVaultAddress: poolVault,
  cukieMasterNftVaultAddress: masterVault,
});

function cursor<T>(rows: T[]) {
  const value = {
    sort: () => value,
    limit: () => value,
    toArray: async () => rows,
  };
  return value;
}

function inventory(tokenId: string) {
  const index = Number(tokenId.slice(-2));
  return {
    _id: tokenId,
    tokenId,
    owner: wallet,
    ownerNormalized: wallet,
    network: 'BSC',
    birthNetwork: 'BSC',
    chainId: 97,
    collectionAddressNormalized: collection,
    state: 'available',
    generation: index <= 6 ? 1 : 2,
    rarity: ((index - 1) % 6) + 1,
  };
}

function position(tokenId: string, lifecycle: string) {
  return {
    assetId: `97:${collection}:${tokenId}`,
    chainId: 97,
    collectionAddressNormalized: collection,
    tokenId,
    beneficiaryNormalized: wallet,
    lifecycle,
    lifecycleOpen: true,
    activationAt: '1',
  };
}

describe('my canonical Cukie collection', () => {
  it('excludes old fixtures and reconciles wallet, pool and Cukie Master custody', async () => {
    const canonical = Array.from({ length: 12 }, (_, index) => inventory(`980000${String(index + 1).padStart(2, '0')}`));
    const oldFixtures = Array.from({ length: 6 }, (_, index) => ({
      ...inventory(`970000${String(index + 1).padStart(2, '0')}`),
      chainId: undefined,
      collectionAddressNormalized: undefined,
    }));
    const pool = ['98000001', '98000003', '98000004', '98000007']
      .map((token, index) => position(token, index === 0 ? 'pending_activation' : 'active'));
    const master = ['98000002', '98000006']
      .map((token) => position(token, 'custodied'));
    let inventoryFilter: Record<string, unknown> | null = null;
    const db = {
      collection: (name: string) => ({
        find: (filter: Record<string, unknown>) => {
          if (name === 'cukie_pool_nft_vault_positions') return cursor(pool);
          if (name === 'cukie_master_nft_positions') return cursor(master);
          if (name === 'nft_asset_locks') return cursor([]);
          inventoryFilter = filter;
          const source = [...canonical, ...oldFixtures];
          return cursor(source.filter((document) => (
            document.chainId === 97
            && document.collectionAddressNormalized === collection
          )));
        },
      }),
    } as unknown as Db;

    const result = await listMyCukieCollectionFromDb({ db, walletAddress: wallet, config });

    expect(inventoryFilter).toEqual(expect.objectContaining({ $or: expect.any(Array) }));
    expect(result.items).toHaveLength(12);
    expect(result.items.map((item) => item.tokenId)).not.toContain('97000001');
    expect(result.summary).toEqual({
      total: 12,
      inWallet: 6,
      available: 6,
      onSale: 0,
      inPool: 4,
      inCukieMaster: 2,
      otherInUse: 0,
    });
    expect(result.items.find((item) => item.tokenId === '98000001')).toMatchObject({
      custody: 'cukie_pool',
      state: 'in_pool',
      poolStatus: 'active',
    });
    expect(result.items.find((item) => item.tokenId === '98000002')).toMatchObject({
      custody: 'cukie_master',
      state: 'cukie_master',
    });
  });
});
