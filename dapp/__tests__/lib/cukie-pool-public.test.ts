jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));
jest.mock('@/lib/contracts/uki-nft-vaults', () => ({
  ukiNftVaults: {
    chainId: 97,
    cukieMasterNftVaultAddress: null,
    cukiePoolNftVaultAddress: `0x${'b'.repeat(40)}`,
    collectionAddresses: [`0x${'c'.repeat(40)}`],
    explorerBaseUrl: 'https://testnet.bscscan.com',
    ready: { cukieMaster: false, cukiePool: false },
    mode: { cukieMaster: 'legacy', cukiePool: 'legacy' },
  },
}));

import type { NormalizedNftAsset } from '@/lib/nft-inventory';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { ukiNftVaults } from '@/lib/contracts/uki-nft-vaults';
import { listCukiePoolWalletPositions } from '@/lib/uki-economy/cukie-pool/public';
import { SchemaNotReadyError } from '@/lib/uki-economy/errors';
import { createMemoryCukiePoolHarness } from '@/lib/uki-economy/cukie-pool/testing';

const OWNER = `0x${'a'.repeat(40)}`;
const VAULT = `0x${'b'.repeat(40)}`;
const COLLECTION = `0x${'c'.repeat(40)}`;
const NOW = new Date('2026-07-10T10:00:00.000Z');
const NOW_SECONDS = Math.floor(NOW.getTime() / 1_000);
const REQUIRED_POOL_CURSOR_EVENTS = [
  'CukiePoolCollectionAllowedUpdated',
  'CukiePoolCalendarVersionScheduled',
  'CukiePoolDeposited',
  'CukiePoolExitRequested',
  'CukiePoolWithdrawableAtAdvanced',
  'CukiePoolWithdrawn',
  'CukiePoolUntrackedERC721Recovered',
] as const;

const vaultConfig = ukiNftVaults as unknown as {
  chainId: 56 | 97 | null;
  cukieMasterNftVaultAddress: string | null;
  cukiePoolNftVaultAddress: string | null;
  collectionAddresses: string[];
  ready: { cukiePool: boolean };
  mode: { cukieMaster: 'legacy' | 'custodial' | 'invalid'; cukiePool: 'legacy' | 'custodial' | 'invalid' };
};

function asset(): NormalizedNftAsset {
  return {
    assetId: 'cukies:public-health',
    tokenId: 'public-health',
    network: 'bsc',
    ownerWallet: OWNER,
    ownerNormalized: OWNER,
    rarity: 'common',
    generation: 'original',
    canonicalState: 'available',
    blockers: [],
    activeLocks: [],
    sourceRefs: [{
      source: 'cukies',
      collection: 'cukies',
      documentId: 'public-health',
      tokenId: 'public-health',
      observedAt: NOW.toISOString(),
    }],
  };
}

function cursor(values: unknown[]) {
  const result = {
    sort: () => result,
    limit: () => result,
    toArray: async () => values,
  };
  return result;
}

function calendarVersion() {
  return {
    _id: `97:${VAULT}:calendar:1`,
    chain: 'BSC',
    chainId: 97,
    vaultAddressNormalized: VAULT,
    calendarVersion: '1',
    effectiveAt: '50400',
    firstCutoffAt: '136800',
    firstPeriodId: '0',
    periodAnchorSeconds: '50400',
    evidence: { eventId: 'calendar:1' },
  };
}

function allowlistProjection(
  vaultAlias = 'CUKIE_POOL_NFT_VAULT',
  vaultAddress = VAULT,
) {
  return {
    _id: `97:${vaultAddress}:${COLLECTION}`,
    chain: 'BSC',
    chainId: 97,
    vaultAlias,
    vaultAddressNormalized: vaultAddress,
    collectionAddressNormalized: COLLECTION,
    allowed: true,
  };
}

function healthyOperationalCollection(name: string) {
  if (name === 'chain_indexer_runs') {
    return {
      findOne: async (filter: Record<string, unknown>) => (
        filter.type === 'loop-error' ? null : { endedAt: NOW }
      ),
    };
  }
  if (name === 'chain_bsc_checkpoints') {
    return {
      findOne: async () => ({
        checkedAt: NOW,
        safeBlockNumber: 100,
        safeBlockHash: `0x${'1'.repeat(64)}`,
      }),
    };
  }
  if (name === 'chain_cursors') {
    return {
      find: () => cursor(REQUIRED_POOL_CURSOR_EVENTS.map((eventName) => ({
        chain: 'BSC',
        contractAlias: 'CUKIE_POOL_NFT_VAULT',
        contractAddress: VAULT,
        eventName,
        verifiedChainId: 97,
        bootstrapStatus: 'verified',
        bootstrapVerifiedAt: NOW,
        updatedAt: NOW,
        safeBlock: 100,
        nextBlock: 101,
      }))),
    };
  }
  if (
    name === 'chain_events'
    || name === 'chain_dead_letters'
    || name === 'chain_integrity_incidents'
  ) {
    return { findOne: async () => null };
  }
  return null;
}

function vaultPosition(
  tokenId: string,
  state: 'pending' | 'active' | 'exit_requested' | 'withdrawable' | 'withdrawn',
) {
  const assetId = `97:${COLLECTION}:${tokenId}`;
  const positionId = `${assetId}:epoch:1`;
  const exiting = state === 'exit_requested' || state === 'withdrawable' || state === 'withdrawn';
  const withdrawn = state === 'withdrawn';
  return {
    _id: positionId,
    positionId,
    chain: 'BSC',
    chainId: 97,
    collectionAddressNormalized: COLLECTION,
    tokenId,
    assetId,
    vaultAlias: 'CUKIE_POOL_NFT_VAULT',
    vaultAddressNormalized: VAULT,
    beneficiaryNormalized: OWNER,
    depositEpoch: '1',
    depositedAt: String(NOW_SECONDS - 1_000),
    depositPeriodId: '7',
    activationAt: String(state === 'pending' ? NOW_SECONDS + 100 : NOW_SECONDS - 500),
    activationPeriodId: '8',
    depositCalendarVersion: '1',
    lifecycle: withdrawn
      ? 'withdrawn'
      : exiting
        ? 'exit_requested'
        : 'pending_activation',
    lifecycleOpen: !withdrawn,
    custody: withdrawn ? 'wallet' : 'cukie_pool_nft_vault',
    ownerRewardEligible: !exiting,
    ...(exiting
      ? {
        exitRequestedAt: String(NOW_SECONDS - 50),
        exitPeriodId: '8',
        withdrawableAt: String(state === 'exit_requested' ? NOW_SECONDS + 50 : NOW_SECONDS - 10),
        exitCalendarVersion: '1',
      }
      : {}),
    ...(withdrawn ? { withdrawnAt: String(NOW_SECONDS) } : {}),
    lastEventId: `event:${tokenId}:${state}`,
    lastBlockNumber: 100 + Number(tokenId),
    lastLogIndex: 0,
  };
}

describe('Cukie Pool public source health', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    vaultConfig.chainId = 97;
    vaultConfig.cukieMasterNftVaultAddress = null;
    vaultConfig.cukiePoolNftVaultAddress = VAULT;
    vaultConfig.collectionAddresses = [COLLECTION];
    vaultConfig.ready.cukiePool = false;
    vaultConfig.mode.cukieMaster = 'legacy';
    vaultConfig.mode.cukiePool = 'legacy';
  });

  it('returns an explicit unhealthy state when the active lock does not match', async () => {
    const harness = createMemoryCukiePoolHarness([asset()]);
    const position = await harness.service.depositCukiePoolPosition({
      walletAddress: OWNER,
      assetId: 'cukies:public-health',
      idempotencyKey: 'deposit:public-health',
      now: NOW,
    });
    const lock = harness.state.locks.get(position.lockId)!;
    const collection = jest.fn((name: string) => ({
      find: () => name === 'cukie_pool_positions'
        ? cursor([position])
        : cursor([{ ...lock, reason: 'game_assignment', sessionId: 'wrong-session' }]),
    }));
    (getEconomyDb as jest.Mock).mockResolvedValue({ collection });

    await expect(listCukiePoolWalletPositions({
      walletAddress: OWNER,
    })).resolves.toMatchObject({
      sourceHealthy: false,
      positions: [{ positionId: position.positionId, sourceHealthy: false }],
    });
  });

  it('reads only the configured custodial projection and derives every public lifecycle', async () => {
    vaultConfig.ready.cukiePool = true;
    vaultConfig.mode.cukiePool = 'custodial';
    const { chain: _historicalChain, ...historicalPosition } = vaultPosition('1', 'pending');
    const documents = [
      historicalPosition,
      vaultPosition('2', 'active'),
      vaultPosition('3', 'exit_requested'),
      vaultPosition('4', 'withdrawable'),
      vaultPosition('5', 'withdrawn'),
    ];
    const find = jest.fn(() => cursor(documents));
    const collection = jest.fn((name: string) => {
      const operational = healthyOperationalCollection(name);
      if (operational) return operational;
      if (name === 'nft_vault_collections') {
        return { find: () => cursor([allowlistProjection()]) };
      }
      if (name === 'cukie_pool_calendar_versions') {
        return { find: () => cursor([calendarVersion()]) };
      }
      if (name === 'cukies') return { find: () => cursor([]) };
      if (name === 'cukie_pool_nft_vault_positions') return { find };
      throw new Error(`unexpected collection ${name}`);
    });
    (getEconomyDb as jest.Mock).mockResolvedValue({ collection });

    const result = await listCukiePoolWalletPositions({
      walletAddress: OWNER,
      now: NOW,
    });

    expect(result).toMatchObject({
      mode: 'custodial_vault',
      sourceCollection: 'cukie_pool_nft_vault_positions',
      walletNormalized: OWNER,
      sourceHealthy: true,
      availableAssets: [],
      nftCustody: {
        mode: 'custodial',
        chainId: 97,
        vaultAddress: VAULT,
        collectionAddresses: [COLLECTION],
        indexer: { status: 'ready' },
      },
    });
    expect(result.positions.map((position) => position.status)).toEqual([
      'pending',
      'active',
      'exit_requested',
      'withdrawable',
      'withdrawn',
    ]);
    expect(result.positions[0]).toMatchObject({
      chain: 'BSC',
      chainId: 97,
      collectionAddress: COLLECTION,
      tokenId: '1',
      assetId: `97:${COLLECTION}:1`,
      vaultAddress: VAULT,
      depositedAt: new Date((NOW_SECONDS - 1_000) * 1_000),
      activationAt: new Date((NOW_SECONDS + 100) * 1_000),
      exitRequestedAt: null,
      withdrawableAt: null,
      withdrawnAt: null,
    });
    expect(find).toHaveBeenCalledWith({
      chainId: 97,
      vaultAlias: 'CUKIE_POOL_NFT_VAULT',
      vaultAddressNormalized: VAULT,
      beneficiaryNormalized: OWNER,
      collectionAddressNormalized: { $in: [COLLECTION] },
    });
  });

  it.each([
    ['a mismatched canonical identity', { assetId: `97:${COLLECTION}:another-token` }],
    ['an explicit non-BSC chain', { chain: 'TRON' }],
  ])('fails closed instead of exposing a projection with %s', async (_case, override) => {
    vaultConfig.ready.cukiePool = true;
    vaultConfig.mode.cukiePool = 'custodial';
    const corrupted = {
      ...vaultPosition('9', 'active'),
      ...override,
    };
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => {
        const operational = healthyOperationalCollection(name);
        if (operational) return operational;
        return {
          find: () => cursor(
            name === 'nft_vault_collections'
              ? [allowlistProjection()]
              : name === 'cukie_pool_calendar_versions'
                ? [calendarVersion()]
                : name === 'cukies'
                  ? []
                  : [corrupted],
          ),
        };
      },
    });

    await expect(listCukiePoolWalletPositions({
      walletAddress: OWNER,
      now: NOW,
    })).rejects.toBeInstanceOf(SchemaNotReadyError);
  });

  it('publishes only wallet-custodied assets and excludes either open NFT vault', async () => {
    const masterVault = `0x${'d'.repeat(40)}`;
    vaultConfig.ready.cukiePool = true;
    vaultConfig.mode.cukiePool = 'custodial';
    vaultConfig.mode.cukieMaster = 'custodial';
    vaultConfig.cukieMasterNftVaultAddress = masterVault;
    const inventory = ['10', '11', '12'].map((tokenId, index) => ({
      _id: tokenId,
      tokenId,
      owner: OWNER,
      ownerNormalized: OWNER,
      network: 'BSC',
      state: 'available',
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      rarity: index + 1,
      generation: index === 2 ? 2 : 1,
    }));
    const asset = (tokenId: string) => `97:${COLLECTION}:${tokenId}`;
    const open = (tokenId: string, alias: string, vaultAddress: string) => ({
      chain: 'BSC',
      chainId: 97,
      vaultAlias: alias,
      vaultAddressNormalized: vaultAddress,
      assetId: asset(tokenId),
      lifecycleOpen: true,
    });
    const {
      chain: _historicalMasterChain,
      ...historicalMasterPosition
    } = open('12', 'CUKIE_MASTER_NFT_VAULT', masterVault);
    let masterPositions: Record<string, unknown>[] = [historicalMasterPosition];
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => {
        const operational = healthyOperationalCollection(name);
        if (operational) return operational;
        return {
          find: (filter: Record<string, unknown>) => cursor(
            name === 'nft_vault_collections'
              ? [filter.vaultAlias === 'CUKIE_MASTER_NFT_VAULT'
                  ? allowlistProjection('CUKIE_MASTER_NFT_VAULT', masterVault)
                  : allowlistProjection()]
              : name === 'cukie_pool_calendar_versions'
                ? [calendarVersion()]
                : name === 'cukies'
                  ? inventory
                  : name === 'nft_asset_locks'
                    ? []
                    : name === 'cukie_master_nft_positions'
                      ? masterPositions
                      : name === 'cukie_pool_nft_vault_positions'
                        ? ('beneficiaryNormalized' in filter
                            ? []
                            : [open('11', 'CUKIE_POOL_NFT_VAULT', VAULT)])
                        : [],
          ),
        };
      },
    });

    const result = await listCukiePoolWalletPositions({ walletAddress: OWNER, now: NOW });
    expect(result.availableAssets).toEqual([{
      assetId: asset('10'),
      chain: 'BSC',
      chainId: 97,
      collectionAddress: COLLECTION,
      tokenId: '10',
      generation: 'original',
      rarity: 'common',
      custody: 'wallet',
      status: 'available',
      canDeposit: true,
    }]);

    masterPositions = [{ ...historicalMasterPosition, chain: 'TRON' }];
    await expect(listCukiePoolWalletPositions({
      walletAddress: OWNER,
      now: NOW,
    })).resolves.toMatchObject({
      sourceHealthy: false,
      availableAssets: [],
      nftCustody: { indexer: { status: 'unavailable' } },
    });
  });

  it('keeps canonical recovery positions visible when indexer health is unavailable', async () => {
    vaultConfig.ready.cukiePool = true;
    vaultConfig.mode.cukiePool = 'custodial';
    const position = vaultPosition('20', 'exit_requested');
    const collection = jest.fn((name: string) => ({
      find: () => cursor(
        name === 'nft_vault_collections'
          ? []
          : name === 'cukie_pool_nft_vault_positions'
            ? [position]
            : [],
      ),
    }));
    (getEconomyDb as jest.Mock).mockResolvedValue({ collection });

    const result = await listCukiePoolWalletPositions({ walletAddress: OWNER, now: NOW });
    expect(result).toMatchObject({
      sourceHealthy: false,
      nftCustody: { indexer: { status: 'unavailable' } },
      availableAssets: [],
      positions: [{
        positionId: position.positionId,
        status: 'exit_requested',
        sourceHealthy: true,
      }],
    });
    expect(collection).not.toHaveBeenCalledWith('cukies');
  });

  it('fails closed when a vault address was provided with incomplete configuration', async () => {
    vaultConfig.ready.cukiePool = false;
    vaultConfig.mode.cukiePool = 'invalid';
    (getEconomyDb as jest.Mock).mockResolvedValue({ collection: jest.fn() });

    await expect(listCukiePoolWalletPositions({
      walletAddress: OWNER,
      now: NOW,
    })).rejects.toBeInstanceOf(SchemaNotReadyError);
  });
});
