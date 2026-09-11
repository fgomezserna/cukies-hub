import { createPublicClient } from 'viem';

import {
  classifyPoolRecoveryRead,
  mergePoolRecoveryInspection,
  readPoolRecoveryPositions,
} from '@/lib/uki-economy/cukie-pool/recovery-read';
import { isPoolRecoverySourceFailure } from '@/lib/uki-economy/cukie-pool/vault-source';

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return { ...actual, createPublicClient: jest.fn() };
});

const mockCreatePublicClient = createPublicClient as jest.MockedFunction<typeof createPublicClient>;

const wallet = '0x1111111111111111111111111111111111111111';
const previousVault = '0x2222222222222222222222222222222222222222';
const otherOwner = '0x3333333333333333333333333333333333333333';
const assetId = '97:0x4444444444444444444444444444444444444444:98000001';

function position(beneficialOwner = wallet) {
  return [beneficialOwner, BigInt(1), BigInt(1_700_000_000), BigInt(1_700_000_100), BigInt(0), BigInt(0), BigInt(0), BigInt(1), BigInt(0)];
}

describe('Pool vault recovery read classification', () => {
  it('keeps a token owned by the wallet out of former-vault custody', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: wallet,
      rawPosition: position(),
    })).toMatchObject({ status: 'not_found', vaultAddress: null });
  });

  it('marks a token held by the allowlisted former vault as custodied', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: position(),
    })).toMatchObject({
      status: 'custodied',
      vaultAddress: previousVault,
      beneficialOwner: wallet,
    });
  });

  it('marks a token transferred to the active vault before its projection exists', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      activeVaultAddress: '0x6666666666666666666666666666666666666666',
      owner: '0x6666666666666666666666666666666666666666',
      rawPosition: null,
    })).toMatchObject({
      status: 'current_custody',
      vaultAddress: '0x6666666666666666666666666666666666666666',
    });
  });

  it('keeps another owner or malformed reads unknown', () => {
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: otherOwner,
      rawPosition: position(),
    })).toMatchObject({ status: 'unknown', reason: 'POOL_RECOVERY_OWNER_MISMATCH' });
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: null,
    })).toMatchObject({ status: 'unknown', reason: 'POOL_RECOVERY_RPC_READ_FAILED' });
    expect(classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: undefined,
      rawPosition: undefined,
    })).toMatchObject({ status: 'unknown', reason: 'POOL_RECOVERY_RPC_READ_FAILED' });
  });

  it('keeps confirmed custody when another former vault is inconclusive', () => {
    const confirmed = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: position(),
    });
    const unknown = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: otherOwner,
      owner: otherOwner,
      rawPosition: null,
    });
    expect(mergePoolRecoveryInspection(confirmed, unknown)).toEqual(confirmed);
    expect(mergePoolRecoveryInspection(unknown, confirmed)).toEqual(confirmed);
  });

  it('keeps active custody ahead of a missing projection and does not expose it', () => {
    const current = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      activeVaultAddress: previousVault,
      owner: previousVault,
      rawPosition: null,
    });
    const unknown = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: otherOwner,
      rawPosition: null,
    });
    expect(current.status).toBe('current_custody');
    expect(mergePoolRecoveryInspection(current, unknown)).toEqual(current);
  });

  it('fails closed when two former vaults both claim the same asset', () => {
    const confirmed = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: previousVault,
      owner: previousVault,
      rawPosition: position(),
    });
    const secondVault = '0x5555555555555555555555555555555555555555';
    const second = classifyPoolRecoveryRead({
      assetId,
      walletNormalized: wallet,
      vaultAddress: secondVault,
      owner: secondVault,
      rawPosition: position(),
    });
    expect(mergePoolRecoveryInspection(confirmed, second)).toMatchObject({
      status: 'unknown',
      reason: 'POOL_RECOVERY_VAULT_AMBIGUOUS',
    });
  });

  it('does not require a recovery RPC on a chain without an allowlisted vault', async () => {
    await expect(readPoolRecoveryPositions({
      walletNormalized: wallet,
      vaults: [{ chainId: 97, vaultAddress: previousVault }],
      assets: [{
        chainId: 56,
        collectionAddress: '0x4444444444444444444444444444444444444444',
        tokenId: '1',
      }],
    })).resolves.toMatchObject([{ status: 'not_found', reason: 'POOL_RECOVERY_NO_PROBE' }]);
  });

  it('fails closed for an oversized recovery batch instead of leaving tail assets unchecked', async () => {
    const assets = Array.from({ length: 201 }, (_, index) => ({
      chainId: 97 as const,
      collectionAddress: '0x4444444444444444444444444444444444444444',
      tokenId: String(index + 1),
    }));
    const result = await readPoolRecoveryPositions({
      walletNormalized: wallet,
      vaults: [{ chainId: 97, vaultAddress: previousVault }],
      assets,
    });
    expect(result).toHaveLength(201);
    expect(new Set(result.map((item) => item.status))).toEqual(new Set(['unknown']));
    expect(new Set(result.map((item) => item.reason))).toEqual(new Set(['POOL_RECOVERY_ASSET_LIMIT']));
  });

  it('keeps active and historical multicall offsets and scopes active addresses to their chain', async () => {
    const activeVault = '0x6666666666666666666666666666666666666666';
    const collection = '0x4444444444444444444444444444444444444444';
    const oldAsset = {
      chainId: 56 as const,
      collectionAddress: collection,
      tokenId: '3',
    };
    const originalTestnetUrls = process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS;
    const originalMainnetUrls = process.env.CHAIN_INDEXER_BSC_RPC_URLS;
    process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS = 'http://rpc97.test';
    process.env.CHAIN_INDEXER_BSC_RPC_URLS = 'http://rpc56.test';
    const multicall = jest.fn().mockResolvedValue([
      { status: 'success', result: activeVault },
      { status: 'success', result: wallet },
      // This is an old-vault read on chain 56. It must not be classified as
      // current chain-97 custody merely because the address is reused.
      { status: 'success', result: activeVault },
      { status: 'success', result: position() },
    ]);
    const getBlockNumber = jest.fn().mockResolvedValue(BigInt(500));
    mockCreatePublicClient.mockReturnValue({ multicall, getBlockNumber } as never);
    try {
      const result = await readPoolRecoveryPositions({
        walletNormalized: wallet,
        vaults: [{ chainId: 56, vaultAddress: previousVault }],
        activeVaultAddress: activeVault,
        activeVaultChainId: 97,
        assets: [
          { chainId: 97, collectionAddress: collection, tokenId: '1' },
          { chainId: 97, collectionAddress: collection, tokenId: '2' },
          oldAsset,
        ],
      });
      expect(multicall).toHaveBeenCalledTimes(2);
      expect(multicall.mock.calls[0]?.[0]).toMatchObject({
        contracts: expect.arrayContaining([expect.objectContaining({ functionName: 'ownerOf' })]),
        allowFailure: true,
        blockNumber: BigInt(500),
      });
      expect(result).toMatchObject([
        { assetId: '97:0x4444444444444444444444444444444444444444:1', status: 'current_custody', observedBlockNumber: '500' },
        { assetId: '97:0x4444444444444444444444444444444444444444:2', status: 'not_found', observedBlockNumber: '500' },
        { assetId: '56:0x4444444444444444444444444444444444444444:3', status: 'unknown', reason: 'POOL_RECOVERY_OWNER_MISMATCH' },
      ]);
    } finally {
      if (originalTestnetUrls === undefined) delete process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS;
      else process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS = originalTestnetUrls;
      if (originalMainnetUrls === undefined) delete process.env.CHAIN_INDEXER_BSC_RPC_URLS;
      else process.env.CHAIN_INDEXER_BSC_RPC_URLS = originalMainnetUrls;
      mockCreatePublicClient.mockReset();
    }
  });

  it('keeps an allowFailure ownerOf result as source-unavailable instead of not_found', async () => {
    const activeVault = '0x6666666666666666666666666666666666666666';
    const collection = '0x4444444444444444444444444444444444444444';
    const multicall = jest.fn().mockResolvedValue([
      { status: 'failure', error: new Error('ownerOf reverted') },
      { status: 'success', result: wallet },
    ]);
    const originalUrls = process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS;
    process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS = 'http://rpc97.test';
    const getBlockNumber = jest.fn().mockResolvedValue(BigInt(500));
    mockCreatePublicClient.mockReturnValue({ multicall, getBlockNumber } as never);
    try {
      const result = await readPoolRecoveryPositions({
        walletNormalized: wallet,
        activeVaultAddress: activeVault,
        activeVaultChainId: 97,
        assets: [
          { chainId: 97, collectionAddress: collection, tokenId: '7' },
          { chainId: 97, collectionAddress: collection, tokenId: '8' },
        ],
      });
      expect(result[0]).toMatchObject({
        status: 'unknown',
        reason: 'POOL_RECOVERY_RPC_READ_FAILED',
      });
      expect(isPoolRecoverySourceFailure(result[0]!)).toBe(true);
      expect(result[1]).toMatchObject({ status: 'not_found' });
    } finally {
      if (originalUrls === undefined) delete process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS;
      else process.env.CHAIN_INDEXER_BSC_TESTNET_RPC_URLS = originalUrls;
      mockCreatePublicClient.mockReset();
    }
  });
});
