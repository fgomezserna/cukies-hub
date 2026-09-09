jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));
jest.mock('@/lib/uki-economy/cukie-pool/recovery-read', () => ({
  readPoolRecoveryPositions: jest.fn(),
}));

import type { Db } from 'mongodb';

import { parseUkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';
import {
  listMyCukieCollectionFromDb,
  resolveCukieSaleEligibility,
} from '@/lib/cukies-data/my-collection';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { readPoolRecoveryPositions } from '@/lib/uki-economy/cukie-pool/recovery-read';

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
const recoveryReadMock = readPoolRecoveryPositions as jest.MockedFunction<typeof readPoolRecoveryPositions>;

const v2Marketplace = {
  ready: true,
  chainId: 97 as const,
  collectionAddresses: [collection],
};

function saleEligibility(overrides: Partial<Parameters<typeof resolveCukieSaleEligibility>[0]> = {}) {
  return resolveCukieSaleEligibility({
    chainId: 97,
    network: 'BSC',
    collectionAddress: collection,
    ownerMatches: true,
    custody: 'wallet',
    state: 'available',
    marketplace: v2Marketplace,
    ...overrides,
  });
}

describe('eligibilidad de venta por identidad', () => {
  it('permite Legacy BSC56 y Legacy TRON aunque V2 no esté listo', () => {
    expect(saleEligibility({
      chainId: 56,
      network: 'BSC',
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      marketplace: { ...v2Marketplace, ready: false },
    })).toEqual({ canSell: true, surface: 'legacy' });
    expect(saleEligibility({
      chainId: null,
      network: 'TRON',
      collectionAddress: legacyMarketplaceContracts.tron.contracts.token,
      marketplace: { ...v2Marketplace, ready: false },
    })).toEqual({ canSell: true, surface: 'legacy' });
  });

  it('exige colección exacta y readiness para V2 BSC97', () => {
    expect(saleEligibility()).toEqual({ canSell: true, surface: 'uki' });
    expect(saleEligibility({ marketplace: { ...v2Marketplace, ready: false } }))
      .toEqual({ canSell: false, surface: 'uki' });
    expect(saleEligibility({ collectionAddress: '0x9999999999999999999999999999999999999999' }))
      .toEqual({ canSell: false, surface: null });
    expect(saleEligibility({
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
    })).toEqual({ canSell: false, surface: null });
    expect(saleEligibility({
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
      marketplace: {
        ...v2Marketplace,
        collectionAddresses: [legacyMarketplaceContracts.bsc.contracts.token],
      },
    })).toEqual({ canSell: false, surface: null });
  });

  it('admite V2 BSC56 cuando la configuración de Marketplace coincide', () => {
    expect(saleEligibility({
      chainId: 56,
      marketplace: {
        ready: true,
        chainId: 56,
        collectionAddresses: [collection],
      },
    })).toEqual({ canSell: true, surface: 'uki' });
  });

  it.each([
    ['owner mismatch', { ownerMatches: false }],
    ['custody', { custody: 'cukie_pool' as const }],
    ['listing', { state: 'listed' as const }],
    ['staking', { state: 'soft_staked' as const }],
  ])('falla cerrado ante %s', (_label, overrides) => {
    expect(saleEligibility(overrides)).toEqual({ canSell: false, surface: 'uki' });
  });
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
  beforeEach(() => {
    recoveryReadMock.mockResolvedValue([]);
  });

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

  it('expone capacidades contextualizadas para venta, Pool y staking Master', async () => {
    const docs = ['1', '2', '3', '4'].map((tokenId) => inventory(tokenId));
    const poolPosition = position('2', 'active');
    const masterPosition = position('3', 'custodied');
    const ukiOrder = {
      chainId: 97,
      collectionAddressNormalized: collection,
      tokenId: '1',
      sellerNormalized: wallet,
      status: 'active',
    };
    const db = {
      collection: (name: string) => ({
        find: () => {
          if (name === 'cukie_pool_nft_vault_positions') return cursor([poolPosition]);
          if (name === 'cukie_master_nft_positions') return cursor([masterPosition]);
          if (name === 'uki_marketplace_orders') return cursor([ukiOrder]);
          if (name === 'nft_asset_locks') return cursor([]);
          return cursor(docs);
        },
      }),
    } as unknown as Db;

    const result = await listMyCukieCollectionFromDb({ db, walletAddress: wallet, config });

    expect(result.items.find((item) => item.tokenId === '1')).toMatchObject({
      state: 'listed',
      saleKind: 'uki',
      availableActions: ['cancel_sale'],
    });
    expect(result.items.find((item) => item.tokenId === '2')).toMatchObject({
      custody: 'cukie_pool',
      availableActions: ['request_pool_exit'],
    });
    expect(result.items.find((item) => item.tokenId === '3')).toMatchObject({
      custody: 'cukie_master',
      availableActions: ['withdraw_master'],
    });
    expect(result.items.find((item) => item.tokenId === '4')).toMatchObject({
      availableActions: ['deposit_pool', 'stake_master'],
    });
  });

  it('no vuelve a solicitar salida cuando el Pool ya está en exit_requested', async () => {
    const poolPosition = position('9', 'exit_requested');
    const db = {
      collection: (name: string) => ({
        find: () => {
          if (name === 'cukie_pool_nft_vault_positions') return cursor([poolPosition]);
          if (name === 'cukie_master_nft_positions') return cursor([]);
          if (name === 'uki_marketplace_orders') return cursor([]);
          if (name === 'nft_asset_locks') return cursor([]);
          return cursor([inventory('9')]);
        },
      }),
    } as unknown as Db;
    const result = await listMyCukieCollectionFromDb({ db, walletAddress: wallet, config });
    expect(result.items[0]).toMatchObject({
      custody: 'cukie_pool',
      poolStatus: 'exit_requested',
      availableActions: [],
    });
  });

  it('bloquea Pool y Master actuales aunque ownerOf vaya por delante de Mongo', async () => {
    const currentAssetId = `97:${collection}:4`;
    const currentPoolAssetId = `97:${collection}:5`;
    recoveryReadMock.mockResolvedValue([{
      assetId: currentAssetId,
      status: 'current_custody',
      vaultAddress: masterVault,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    }, {
      assetId: currentPoolAssetId,
      status: 'current_custody',
      vaultAddress: poolVault,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    }]);
    const db = {
      collection: (name: string) => ({
        find: () => {
          if (name === 'cukie_pool_nft_vault_positions') return cursor([]);
          if (name === 'cukie_master_nft_positions') return cursor([]);
          if (name === 'uki_marketplace_orders') return cursor([]);
      if (name === 'nft_asset_locks') return cursor([]);
          return cursor([inventory('4'), inventory('5')]);
        },
      }),
    } as unknown as Db;

    const result = await listMyCukieCollectionFromDb({ db, walletAddress: wallet, config });

    expect(result.items.find((item) => item.tokenId === '4')).toMatchObject({
      custody: 'cukie_master',
      state: 'unknown',
      availableActions: [],
    });
    expect(result.items.find((item) => item.tokenId === '5')).toMatchObject({
      custody: 'cukie_pool',
      state: 'unknown',
      availableActions: [],
    });
  });
});
