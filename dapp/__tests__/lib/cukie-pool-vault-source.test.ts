import type { Db } from 'mongodb';

import {
  loadCukiePoolVaultCandidates,
  resolveCukiePoolVaultPeriod,
  type CukiePoolVaultConfig,
} from '@/lib/uki-economy/cukie-pool/vault-source';
import { SchemaNotReadyError } from '@/lib/uki-economy/errors';

const OWNER = `0x${'a'.repeat(40)}`;
const VAULT = `0x${'b'.repeat(40)}`;
const COLLECTION = `0x${'c'.repeat(40)}`;
const CONFIG: CukiePoolVaultConfig = {
  chainId: 97,
  vaultAddressNormalized: VAULT,
  collectionAddresses: [COLLECTION],
};

function cursor(values: unknown[]) {
  const result = {
    sort: () => result,
    limit: () => result,
    toArray: async () => values,
  };
  return result;
}

function position(input: {
  tokenId: string;
  activationAt: number;
  depositedAt: number;
  exitRequestedAt?: number;
  withdrawableAt?: number;
}) {
  const assetId = `97:${COLLECTION}:${input.tokenId}`;
  return {
    _id: `${assetId}:epoch:1`,
    positionId: `${assetId}:epoch:1`,
    chain: 'BSC',
    chainId: 97,
    collectionAddressNormalized: COLLECTION,
    tokenId: input.tokenId,
    assetId,
    vaultAlias: 'CUKIE_POOL_NFT_VAULT',
    vaultAddressNormalized: VAULT,
    beneficiaryNormalized: OWNER,
    depositEpoch: '1',
    depositedAt: String(input.depositedAt),
    depositPeriodId: '10',
    activationAt: String(input.activationAt),
    activationPeriodId: '11',
    depositCalendarVersion: '1',
    lifecycle: input.exitRequestedAt ? 'exit_requested' : 'active',
    lifecycleOpen: true,
    custody: 'cukie_pool_nft_vault',
    ownerRewardEligible: !input.exitRequestedAt,
    ...(input.exitRequestedAt
      ? {
          exitRequestedAt: String(input.exitRequestedAt),
          exitPeriodId: '11',
          withdrawableAt: String(input.withdrawableAt),
          exitCalendarVersion: '1',
        }
      : {}),
  };
}

describe('Cukie Pool custodial source', () => {
  it('derives periods from append-only calendars, including a configurable short transition', () => {
    const calendars = [
      {
        chain: 'BSC',
        chainId: 97,
        vaultAddressNormalized: VAULT,
        calendarVersion: '1',
        effectiveAt: '50400',
        firstCutoffAt: '136800',
        firstPeriodId: '0',
        periodAnchorSeconds: '50400',
      },
      {
        chain: 'BSC',
        chainId: 97,
        vaultAddressNormalized: VAULT,
        calendarVersion: '2',
        effectiveAt: '223200',
        firstCutoffAt: '230400',
        firstPeriodId: '2',
        periodAnchorSeconds: '57600',
      },
    ];

    expect(resolveCukiePoolVaultPeriod(
      calendars,
      CONFIG,
      new Date(225_000 * 1_000),
    )).toEqual({
      periodId: '2',
      startsAt: new Date(223_200 * 1_000),
      endsAt: new Date(230_400 * 1_000),
      calendarVersion: '2',
    });
    expect(resolveCukiePoolVaultPeriod(
      calendars,
      CONFIG,
      new Date(230_400 * 1_000),
    )).toMatchObject({
      periodId: '3',
      startsAt: new Date(230_400 * 1_000),
      endsAt: new Date(316_800 * 1_000),
    });
  });

  it('filters activation/cutoff, resolves exact metadata and orders Original before Second', async () => {
    const nowSeconds = 2_000_000_000;
    const rows = [
      position({ tokenId: '2', depositedAt: nowSeconds - 2_000, activationAt: nowSeconds - 1_000 }),
      position({ tokenId: '1', depositedAt: nowSeconds - 1_500, activationAt: nowSeconds - 500 }),
      position({
        tokenId: '3',
        depositedAt: nowSeconds - 1_600,
        activationAt: nowSeconds - 600,
        exitRequestedAt: nowSeconds - 100,
        withdrawableAt: nowSeconds + 100,
      }),
      position({ tokenId: '4', depositedAt: nowSeconds - 100, activationAt: nowSeconds + 100 }),
      position({
        tokenId: '5',
        depositedAt: nowSeconds - 2_000,
        activationAt: nowSeconds - 1_000,
        exitRequestedAt: nowSeconds - 200,
        withdrawableAt: nowSeconds,
      }),
    ];
    delete (rows[0] as { chain?: unknown }).chain;
    const metadata = new Map([
      ['1', { rarity: 1, generation: 1 }],
      ['2', { rarity: 6, generation: 2 }],
      ['3', { rarity: 3, generation: 1 }],
      ['4', { rarity: 4, generation: 1 }],
      ['5', { rarity: 5, generation: 1 }],
    ]);
    const db = {
      collection: (name: string) => ({
        find: (filter: Record<string, unknown>) => {
          if (name === 'cukie_pool_nft_vault_positions') return cursor(rows);
          if (name === 'nft_asset_locks') return cursor([]);
          const tokenIds = new Set((filter.tokenId as { $in: unknown[] }).$in.map(String));
          const values = [...metadata.entries()]
            .filter(([tokenId]) => tokenIds.has(tokenId))
            .map(([tokenId, values]) => ({
                _id: tokenId,
                tokenId,
                owner: OWNER,
                ownerNormalized: OWNER,
                network: 'BSC',
                state: 'available',
                chainId: 97,
                collectionAddressNormalized: COLLECTION,
                ...values,
              }));
          return cursor(values);
        },
      }),
    } as unknown as Db;

    const result = await loadCukiePoolVaultCandidates(
      db,
      CONFIG,
      new Date(nowSeconds * 1_000),
    );
    expect(result.map((item) => ({
      tokenId: item.tokenId,
      generation: item.generation,
      rarity: item.rarity,
      quota: item.gamesQuota,
      ownerRewardEligible: item.ownerRewardEligible,
    }))).toEqual([
      {
        tokenId: '3',
        generation: 'original',
        rarity: 'rare',
        quota: 6,
        ownerRewardEligible: false,
      },
      {
        tokenId: '1',
        generation: 'original',
        rarity: 'common',
        quota: 2,
        ownerRewardEligible: true,
      },
      {
        tokenId: '2',
        generation: 'second_generation',
        rarity: 'goat',
        quota: 6,
        ownerRewardEligible: true,
      },
    ]);
  });

  it('rejects an explicit non-BSC chain while accepting only the historical omission', async () => {
    const nowSeconds = 2_000_000_000;
    const corrupted = {
      ...position({
        tokenId: '9',
        depositedAt: nowSeconds - 2_000,
        activationAt: nowSeconds - 1_000,
      }),
      chain: 'TRON',
    };
    const db = {
      collection: () => ({
        find: () => cursor([corrupted]),
      }),
    } as unknown as Db;

    await expect(loadCukiePoolVaultCandidates(
      db,
      CONFIG,
      new Date(nowSeconds * 1_000),
    )).rejects.toBeInstanceOf(SchemaNotReadyError);
  });
});
