jest.mock('server-only', () => ({}), { virtual: true });

import { parseUkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';
import { summarizeCukieMasterNftRoute } from '@/lib/nft-inventory';
import {
  normalizeCanonicalCukieMasterNftPosition,
  type CukieMasterNftVaultPositionDocument,
} from '@/lib/uki-economy/cukie-master/nft-vault-source';

const walletAddress = '0x1111111111111111111111111111111111111111';
const vaultAddress = '0x2222222222222222222222222222222222222222';
const collectionAddress = '0x3333333333333333333333333333333333333333';
const assetId = `97:${collectionAddress}:7`;
const positionId = `${assetId}:epoch:1`;
const eventId = `${assetId}:deposit:1`;
const txHash = `0x${'a'.repeat(64)}`;
const now = new Date('2026-08-15T14:00:00.000Z');
const config = parseUkiNftVaultPublicConfig({
  chainId: '97',
  cukieMasterNftVaultAddress: vaultAddress,
  collectionAddress,
});

function position(
  overrides: Partial<CukieMasterNftVaultPositionDocument> = {},
): CukieMasterNftVaultPositionDocument {
  return {
    _id: positionId,
    positionId,
    assetId,
    chainId: 97,
    collectionAddressNormalized: collectionAddress,
    tokenId: '7',
    vaultAlias: 'CUKIE_MASTER_NFT_VAULT',
    vaultAddressNormalized: vaultAddress,
    beneficiaryNormalized: walletAddress,
    depositEpoch: '1',
    depositedAt: '1786802400',
    lifecycle: 'custodied',
    lifecycleOpen: true,
    custody: 'cukie_master_nft_vault',
    rewardEligible: true,
    depositEvidence: {
      eventId,
      txHash,
      blockNumber: 12_345,
      observedAt: now,
    },
    lastEventId: eventId,
    updatedAt: now,
    ...overrides,
  };
}

const metadata = {
  _id: '7',
  tokenId: '7',
  chainId: 97,
  collectionAddressNormalized: collectionAddress,
  owner: vaultAddress,
  ownerNormalized: vaultAddress,
  network: 'BSC',
  state: 'available',
  type: 'rare',
  skills: { generation: 1 },
  updatedAt: now,
};

describe('canonical Cukie Master NFT vault source', () => {
  it('accepts only a fully evidenced open custody position and attributes it to the beneficiary', () => {
    const normalized = normalizeCanonicalCukieMasterNftPosition({
      document: position(),
      metadata,
      walletAddress,
      config,
      now,
    });

    expect(normalized).toMatchObject({
      positionId,
      assetId,
      chainId: 97,
      collectionAddress,
      tokenId: '7',
      beneficiaryNormalized: walletAddress,
      depositEpoch: '1',
      depositEventId: eventId,
      depositTxHash: txHash,
      depositBlockNumber: 12_345,
      asset: {
        assetId,
        tokenId: '7',
        network: 'bsc',
        ownerWallet: walletAddress,
        ownerNormalized: walletAddress,
        rarity: 'rare',
        generation: 'original',
        canonicalState: 'available',
        blockers: [],
      },
    });
    expect(normalized.asset.sourceRefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cukie_master_nft_positions',
        collection: 'cukie_master_nft_positions',
        documentId: positionId,
      }),
    ]));
    expect(summarizeCukieMasterNftRoute({
      walletAddress,
      assets: [normalized.asset],
    })).toMatchObject({
      originalCukiePoints: 4,
      nftAssetIds: [assetId],
    });
  });

  it.each([
    ['beneficiary mismatch', { beneficiaryNormalized: '0x4444444444444444444444444444444444444444' }],
    ['vault mismatch', { vaultAddressNormalized: '0x4444444444444444444444444444444444444444' }],
    ['closed lifecycle', { lifecycle: 'withdrawn', lifecycleOpen: false }],
    ['not reward eligible', { rewardEligible: false }],
    ['wrong position identity', { positionId: `${assetId}:epoch:2` }],
    ['missing canonical event match', { lastEventId: 'another-event' }],
    ['invalid canonical transaction evidence', {
      depositEvidence: { eventId, txHash: '0x1234', blockNumber: 12_345 },
    }],
  ])('fails closed for %s', (_label, overrides) => {
    expect(() => normalizeCanonicalCukieMasterNftPosition({
      document: position(overrides),
      metadata,
      walletAddress,
      config,
      now,
    })).toThrow('posicion abierta inconsistente');
  });

  it('keeps custody withdrawable but excludes unknown metadata from NFT entitlement', () => {
    const normalized = normalizeCanonicalCukieMasterNftPosition({
      document: position(),
      metadata: null,
      walletAddress,
      config,
      now,
    });
    const summary = summarizeCukieMasterNftRoute({
      walletAddress,
      assets: [normalized.asset],
    });

    expect(normalized.asset.blockers).toEqual(expect.arrayContaining([
      'missing_rarity',
      'missing_generation',
    ]));
    expect(summary.originalCukiePoints).toBe(0);
    expect(summary.rejectedAssets).toHaveLength(1);
  });

  it('rejects metadata from another chain or collection instead of joining by tokenId alone', () => {
    expect(() => normalizeCanonicalCukieMasterNftPosition({
      document: position(),
      metadata: {
        ...metadata,
        collectionAddressNormalized: '0x4444444444444444444444444444444444444444',
      },
      walletAddress,
      config,
      now,
    })).toThrow('identidad NFT inconsistente');
  });
});
