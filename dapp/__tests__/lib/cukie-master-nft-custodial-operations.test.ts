import type { Db } from 'mongodb';

import { parseUkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';
import type { NftAssetLockDocument } from '@/lib/nft-inventory/lock-types';
import {
  buildCukieMasterCustodialDepositInventory,
  custodialInventoryFromDb,
} from '@/lib/uki-economy/cukie-master/nft-operations';
import { readPoolRecoveryPositions } from '@/lib/uki-economy/cukie-pool/recovery-read';

jest.mock('@/lib/uki-economy/cukie-pool/recovery-read', () => ({
  readPoolRecoveryPositions: jest.fn().mockResolvedValue([]),
}));

const mockRecovery = readPoolRecoveryPositions as jest.MockedFunction<
  typeof readPoolRecoveryPositions
>;

const wallet = '0x1111111111111111111111111111111111111111';
const masterVault = '0x2222222222222222222222222222222222222222';
const poolVault = '0x3333333333333333333333333333333333333333';
const collectionA = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const collectionB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const now = new Date('2026-08-15T12:00:00.000Z');

function config(collections = [collectionA, collectionB]) {
  return parseUkiNftVaultPublicConfig({
    chainId: '97',
    cukieMasterNftVaultAddress: masterVault,
    cukiePoolNftVaultAddress: poolVault,
    collectionAddresses: collections.join(','),
  });
}

function metadata(
  documentId: string,
  tokenId: string,
  collectionAddressNormalized: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: documentId,
    tokenId,
    chainId: 97,
    collectionAddressNormalized,
    owner: wallet,
    ownerNormalized: wallet,
    network: 'BSC',
    state: 'available',
    rarity: 3,
    generation: 1,
    origin: 'mint',
    updatedAt: now,
    ...overrides,
  };
}

function activeLock(assetId: string): NftAssetLockDocument {
  return {
    _id: `lock:${assetId}`,
    lockId: `lock:${assetId}`,
    assetId,
    ownerNormalized: wallet,
    reason: 'game_assignment',
    status: 'active',
    fencingToken: 1,
    createdBy: 'test',
    idempotencyKey: `test:${assetId}`,
    payloadHash: `sha256:${assetId}`,
    createdAt: now,
    updatedAt: now,
  };
}

function fakeDb(collections: Record<string, unknown[]>): Db {
  return {
    collection(name: string) {
      return {
        find() {
          const rows = collections[name] ?? [];
          let limit = rows.length;
          const cursor = {
            sort: () => cursor,
            limit: (value: number) => {
              limit = value;
              return cursor;
            },
            toArray: async () => rows.slice(0, limit),
          };
          return cursor;
        },
      };
    },
  } as unknown as Db;
}

function openMasterPosition(tokenId: string) {
  const assetId = `97:${collectionA}:${tokenId}`;
  const positionId = `${assetId}:epoch:1`;
  return {
    _id: positionId,
    positionId,
    assetId,
    chainId: 97,
    collectionAddressNormalized: collectionA,
    tokenId,
    vaultAlias: 'CUKIE_MASTER_NFT_VAULT',
    vaultAddressNormalized: masterVault,
    beneficiaryNormalized: wallet,
    depositEpoch: '1',
    depositedAt: '1786795200',
    lifecycle: 'custodied',
    lifecycleOpen: true,
    custody: 'cukie_master_nft_vault',
    rewardEligible: true,
    depositEvidence: {
      eventId: `deposit:${tokenId}`,
      txHash: `0x${'a'.repeat(64)}`,
      blockNumber: 123,
      observedAt: now,
    },
    lastEventId: `deposit:${tokenId}`,
    updatedAt: now,
  };
}

describe('Cukie Master custodial inventory identity', () => {
  it('uses exact per-document identities and supports equal tokenIds across collections', () => {
    const inventory = buildCukieMasterCustodialDepositInventory({
      walletAddress: wallet,
      now,
      documents: [
        metadata('a-7', '7', collectionA, { img: 'https://cdn.example/a-7.png' }),
        metadata('b-7', '7', collectionB, { rarity: 5 }),
      ],
      locks: [],
      openVaultPositions: [],
      config: config(),
    });

    expect(inventory.map((item) => item.canonicalAssetId)).toEqual([
      `97:${collectionA}:7`,
      `97:${collectionB}:7`,
    ]);
    expect(inventory.map((item) => item.collectionAddress)).toEqual([collectionA, collectionB]);
    expect(inventory.every((item) => item.canDeposit)).toBe(true);
    expect(inventory[0]?.imageUrl).toBe('https://cdn.example/a-7.png');
    expect(inventory[1]?.imageUrl).toContain('/7.png');
  });

  it('fails closed for duplicate, legacy or non-normalized identities', () => {
    const inventory = buildCukieMasterCustodialDepositInventory({
      walletAddress: wallet,
      now,
      documents: [
        metadata('duplicate-a', '1', collectionA),
        metadata('duplicate-b', '1', collectionA),
        metadata('legacy', '2', collectionA, {
          chainId: undefined,
          collectionAddressNormalized: undefined,
        }),
        metadata('uppercase', '3', collectionA.toUpperCase()),
        metadata('uint256-overflow', (BigInt(1) << BigInt(256)).toString(), collectionA),
        metadata('valid', '4', collectionB),
      ],
      locks: [],
      openVaultPositions: [],
      config: config(),
    });

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      assetId: `97:${collectionB}:4`,
      canonicalAssetId: `97:${collectionB}:4`,
      canDeposit: true,
    });
  });

  it('excludes open Master/Pool positions and active canonical or legacy locks', () => {
    const documents = [
      metadata('1', '1', collectionA),
      metadata('2', '2', collectionA),
      metadata('3', '3', collectionA),
      metadata('4', '4', collectionA),
    ];
    const inventory = buildCukieMasterCustodialDepositInventory({
      walletAddress: wallet,
      now,
      documents,
      locks: [activeLock(`97:${collectionA}:3`), activeLock('cukies:4')],
      openVaultPositions: [
        { assetId: `97:${collectionA}:1`, lifecycleOpen: true },
        { assetId: `97:${collectionA}:2`, lifecycleOpen: true },
      ],
      config: config(),
    });

    expect(inventory).toEqual([]);
  });

  it('allows deposits only for eligible Originals', () => {
    const inventory = buildCukieMasterCustodialDepositInventory({
      walletAddress: wallet,
      now,
      documents: [
        metadata('original', '10', collectionA),
        metadata('second', '11', collectionA, { generation: 2 }),
        metadata('unknown', '12', collectionA, { generation: undefined }),
        metadata('legacy-rarity', '13', collectionA, { rarity: undefined, type: 'rare' }),
      ],
      locks: [],
      openVaultPositions: [],
      config: config(),
    });

    expect(inventory.find((item) => item.tokenId === '10')?.canDeposit).toBe(true);
    expect(inventory.find((item) => item.tokenId === '11')).toMatchObject({
      canDeposit: false,
      blockers: expect.arrayContaining(['second_generation']),
    });
    expect(inventory.find((item) => item.tokenId === '12')).toMatchObject({
      canDeposit: false,
      blockers: expect.arrayContaining(['missing_generation']),
    });
    expect(inventory.find((item) => item.tokenId === '13')).toMatchObject({
      canDeposit: true,
      rarity: 'rare',
      rarityPoints: 4,
      contributionPoints: 0,
      blockers: [],
    });
  });

  it('blocks an ownerOf-confirmed current or former vault asset before projection', () => {
    const assetId = `97:${collectionA}:14`;
    const inventory = buildCukieMasterCustodialDepositInventory({
      walletAddress: wallet,
      now,
      documents: [metadata('transition', '14', collectionA)],
      locks: [],
      openVaultPositions: [],
      custodyBlockers: new Map([[assetId, 'unknown_state']]),
      config: config(),
    });

    expect(inventory).toMatchObject([{
      assetId,
      state: 'unknown',
      blockers: ['unknown_state'],
      canDeposit: false,
      canSoftStake: false,
    }]);
  });

  it('keeps a known Master position withdrawable when metadata is duplicated and ineligible', async () => {
    const position = openMasterPosition('21');
    const duplicateMetadata = [
      metadata('metadata-a', '21', collectionA, { rarity: undefined, generation: undefined }),
      metadata('metadata-b', '21', collectionA, { rarity: 6, generation: 2 }),
    ];
    const inventory = await custodialInventoryFromDb(fakeDb({
      cukies: duplicateMetadata,
      cukie_master_nft_positions: [position],
      cukie_pool_nft_vault_positions: [],
      nft_asset_locks: [],
    }), wallet, now, undefined, config([collectionA]));

    expect(inventory).toHaveLength(1);
    expect(inventory[0]).toMatchObject({
      assetId: position.assetId,
      canonicalAssetId: position.assetId,
      custody: 'cukie_master_nft_vault',
      canDeposit: false,
      canWithdraw: true,
      blockers: expect.arrayContaining(['missing_rarity', 'missing_generation']),
    });
  });

  it('applies the shared owner guard to the real Master inventory path', async () => {
    const assetId = `97:${collectionA}:22`;
    mockRecovery.mockResolvedValueOnce([{
      assetId,
      status: 'current_custody',
      vaultAddress: masterVault,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    }]);
    const inventory = await custodialInventoryFromDb(fakeDb({
      cukies: [metadata('ahead-of-projection', '22', collectionA)],
      cukie_master_nft_positions: [],
      cukie_pool_nft_vault_positions: [],
      nft_asset_locks: [],
    }), wallet, now, undefined, config([collectionA]));

    expect(mockRecovery).toHaveBeenCalledWith(expect.objectContaining({
      activeVaultAddress: masterVault,
      activeVaultAddresses: [poolVault],
      activeVaultChainId: 97,
      assets: [{ chainId: 97, collectionAddress: collectionA, tokenId: '22' }],
    }));
    expect(inventory).toMatchObject([{
      assetId,
      state: 'unknown',
      blockers: ['unknown_state'],
      canDeposit: false,
      canSoftStake: false,
    }]);
  });

  it('ignores a stale Pool projection after ownerOf confirms the wallet', async () => {
    const tokenId = '23';
    const assetId = `97:${collectionA}:${tokenId}`;
    mockRecovery.mockResolvedValueOnce([{
      assetId,
      status: 'not_found',
      vaultAddress: null,
      beneficialOwner: null,
      exitRequestedAt: null,
      withdrawableAt: null,
    }]);

    const inventory = await custodialInventoryFromDb(fakeDb({
      cukies: [metadata('stale-pool', tokenId, collectionA, { state: 'in_pool' })],
      cukie_master_nft_positions: [],
      cukie_pool_nft_vault_positions: [{ assetId, lifecycleOpen: true }],
      nft_asset_locks: [activeLock(assetId)],
    }), wallet, now, undefined, config([collectionA]));

    expect(inventory).toMatchObject([{
      assetId,
      custody: 'wallet',
      canDeposit: true,
      blockers: [],
    }]);
  });
});
