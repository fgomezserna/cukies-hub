import {
  buildCukieMasterSnapshot,
  cukieMasterSnapshotEventKey,
  cukieMasterSnapshotId,
} from '@/lib/uki-economy/cukie-master';

const calculatedAt = new Date('2026-07-08T00:00:00.000Z');

function nftAssetSnapshot(assetId: string, overrides: Partial<{
  tokenId: string | null;
  network: string;
  ownerNormalized: string | null;
  rarity: string;
  rarityPoints: number;
  generation: string;
  canonicalState: string;
}> = {}) {
  return {
    assetId,
    tokenId: overrides.tokenId ?? assetId.split(':').at(-1) ?? null,
    network: overrides.network ?? 'bsc',
    ownerNormalized: overrides.ownerNormalized ?? '0xabcdef',
    rarity: overrides.rarity ?? 'common',
    rarityPoints: overrides.rarityPoints ?? 1,
    generation: overrides.generation ?? 'original',
    canonicalState: overrides.canonicalState ?? 'available',
    activeLocks: [],
    sourceRefs: [{
      source: 'cukies',
      collection: 'cukies',
      documentId: assetId,
      observedAt: calculatedAt.toISOString(),
    }],
  };
}

describe('Cukie Master snapshots', () => {
  it('builds a 5-per-route snapshot with a potential total of 10 slots', () => {
    const snapshot = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 120_000,
      originalCukiePoints: 15,
      calculatedAt,
      source: {
        presaleVestedUki: 100_000,
        releasedOrStakedUki: 20_000,
        nftAssetIds: ['BSC:0xToken:1', 'BSC:0xToken:2', 'BSC:0xToken:3'],
        nftAssets: [
          nftAssetSnapshot('BSC:0xToken:2', {
            tokenId: '2',
            rarity: 'rare',
            rarityPoints: 4,
          }),
          {
            ...nftAssetSnapshot('BSC:0xToken:1', {
              tokenId: '1',
              rarity: 'legendary',
              rarityPoints: 10,
              canonicalState: 'soft_staked',
            }),
            activeLocks: [{
              lockId: 'lock-1',
              ownerNormalized: '0xabcdef',
              reason: 'soft_stake',
              state: 'soft_staked',
            }],
          },
          nftAssetSnapshot('BSC:0xToken:3', {
            tokenId: '3',
          }),
        ],
      },
    });

    expect(snapshot.walletNormalized).toBe('0xabcdef');
    expect(snapshot.routes.uki.slots).toBe(5);
    expect(snapshot.routes.nft.slots).toBe(5);
    expect(snapshot.totalSlots).toBe(10);
    expect(snapshot.maxTotalSlots).toBe(10);
    expect(snapshot.dailyCreditsPreview).toBe(1_000);
    expect(snapshot.routes.uki.presaleVestedUki).toBe(100_000);
    expect(snapshot.routes.nft.nftAssetIds).toEqual([
      'BSC:0xToken:1',
      'BSC:0xToken:2',
      'BSC:0xToken:3',
    ]);
    expect(snapshot.routes.nft.nftAssets).toEqual([
      {
        assetId: 'BSC:0xToken:1',
        tokenId: '1',
        network: 'bsc',
        ownerNormalized: '0xabcdef',
        rarity: 'legendary',
        rarityPoints: 10,
        generation: 'original',
        canonicalState: 'soft_staked',
        activeLocks: [{
          lockId: 'lock-1',
          ownerNormalized: '0xabcdef',
          reason: 'soft_stake',
          state: 'soft_staked',
        }],
        sourceRefs: [{
          source: 'cukies',
          collection: 'cukies',
          documentId: 'BSC:0xToken:1',
          observedAt: calculatedAt.toISOString(),
        }],
      },
      {
        assetId: 'BSC:0xToken:2',
        tokenId: '2',
        network: 'bsc',
        ownerNormalized: '0xabcdef',
        rarity: 'rare',
        rarityPoints: 4,
        generation: 'original',
        canonicalState: 'available',
        activeLocks: [],
        sourceRefs: [{
          source: 'cukies',
          collection: 'cukies',
          documentId: 'BSC:0xToken:2',
          observedAt: calculatedAt.toISOString(),
        }],
      },
      {
        assetId: 'BSC:0xToken:3',
        tokenId: '3',
        network: 'bsc',
        ownerNormalized: '0xabcdef',
        rarity: 'common',
        rarityPoints: 1,
        generation: 'original',
        canonicalState: 'available',
        activeLocks: [],
        sourceRefs: [{
          source: 'cukies',
          collection: 'cukies',
          documentId: 'BSC:0xToken:3',
          observedAt: calculatedAt.toISOString(),
        }],
      },
    ]);
    expect(snapshot.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses stable snapshot and event identifiers', () => {
    const snapshot = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 100_000,
      originalCukiePoints: 15,
      calculatedAt,
    });

    expect(cukieMasterSnapshotId(snapshot)).toBe(
      `0xabcdef:2026-07-08:${snapshot.ruleVersion}`,
    );
    expect(cukieMasterSnapshotEventKey(snapshot)).toBe(
      `cukie-master-snapshot:0xabcdef:2026-07-08:${snapshot.ruleVersion}:${snapshot.snapshotHash}`,
    );
  });

  it('keeps event idempotency stable for the same material inputs only', () => {
    const first = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 100_000,
      originalCukiePoints: 15,
      calculatedAt,
    });
    const sameMaterialLater = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 100_000,
      originalCukiePoints: 15,
      calculatedAt: new Date('2026-07-08T01:00:00.000Z'),
    });
    const changedMaterial = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 80_000,
      originalCukiePoints: 15,
      calculatedAt,
    });

    expect(cukieMasterSnapshotEventKey(sameMaterialLater)).toBe(
      cukieMasterSnapshotEventKey(first),
    );
    expect(cukieMasterSnapshotEventKey(changedMaterial)).not.toBe(
      cukieMasterSnapshotEventKey(first),
    );
  });

  it('deduplicates and sorts NFT asset ids before hashing material state', () => {
    const first = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 100_000,
      originalCukiePoints: 15,
      calculatedAt,
      source: {
        nftAssetIds: ['BSC:0xToken:2', 'BSC:0xToken:1', 'BSC:0xToken:2'],
        nftAssets: [
          nftAssetSnapshot('BSC:0xToken:2', {
            tokenId: '2',
            rarity: 'rare',
            rarityPoints: 4,
          }),
          nftAssetSnapshot('BSC:0xToken:1', {
            tokenId: '1',
          }),
        ],
      },
    });
    const reordered = buildCukieMasterSnapshot({
      walletAddress: '0xABCDEF',
      periodId: '2026-07-08',
      eligibleUki: 100_000,
      originalCukiePoints: 15,
      calculatedAt,
      source: {
        nftAssetIds: ['BSC:0xToken:1', 'BSC:0xToken:2'],
        nftAssets: [
          nftAssetSnapshot('BSC:0xToken:1', {
            tokenId: '1',
          }),
          nftAssetSnapshot('BSC:0xToken:2', {
            tokenId: '2',
            rarity: 'rare',
            rarityPoints: 4,
          }),
        ],
      },
    });

    expect(first.routes.nft.nftAssetIds).toEqual(['BSC:0xToken:1', 'BSC:0xToken:2']);
    expect(first.routes.nft.nftAssets.map((asset) => asset.assetId)).toEqual([
      'BSC:0xToken:1',
      'BSC:0xToken:2',
    ]);
    expect(first.snapshotHash).toBe(reordered.snapshotHash);
    expect(cukieMasterSnapshotEventKey(first)).toBe(cukieMasterSnapshotEventKey(reordered));
  });
});
