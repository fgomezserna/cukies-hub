import {
  normalizeCukiesInventoryDocument,
  summarizeCukieMasterNftEntitlement,
  summarizeCukieMasterNftRoute,
} from '@/lib/nft-inventory';

const now = new Date('2026-07-10T00:00:00.000Z');
const owner = '0xABCDEF';

function assetWithLocks(locks: Array<Record<string, unknown>>) {
  return normalizeCukiesInventoryDocument({
    _id: '1',
    tokenId: '1',
    owner,
    ownerNormalized: owner.toLowerCase(),
    network: 'BSC',
    state: 'available',
    type: 'rare',
    skills: { generation: 1 },
  }, locks, now);
}

describe('Cukie Master NFT entitlement', () => {
  it('keeps available NFTs in preview but excludes them from active entitlement', () => {
    const asset = assetWithLocks([]);
    expect(summarizeCukieMasterNftRoute({ walletAddress: owner, assets: [asset] }).originalCukiePoints)
      .toBe(4);
    const entitlement = summarizeCukieMasterNftEntitlement({ walletAddress: owner, assets: [asset] });
    expect(entitlement.originalCukiePoints).toBe(0);
    expect(entitlement.rejectedAssets[0].blockers).toContain('soft_stake_required');
  });

  it('counts only a non-expired active soft_stake lock owned by the same wallet', () => {
    const own = assetWithLocks([{
      _id: 'own', assetId: 'cukies:1', status: 'active', reason: 'soft_stake',
      ownerNormalized: owner.toLowerCase(), expiresAt: new Date(now.getTime() + 1000),
    }]);
    const expired = assetWithLocks([{
      _id: 'expired', assetId: 'cukies:1', status: 'active', reason: 'soft_stake',
      ownerNormalized: owner.toLowerCase(), expiresAt: new Date(now.getTime() - 1),
    }]);
    const other = assetWithLocks([{
      _id: 'other', assetId: 'cukies:1', status: 'active', reason: 'soft_stake',
      ownerNormalized: '0xother', expiresAt: new Date(now.getTime() + 1000),
    }]);

    expect(summarizeCukieMasterNftEntitlement({ walletAddress: owner, assets: [own] }).originalCukiePoints)
      .toBe(4);
    expect(summarizeCukieMasterNftEntitlement({ walletAddress: owner, assets: [expired] }).originalCukiePoints)
      .toBe(0);
    expect(summarizeCukieMasterNftEntitlement({ walletAddress: owner, assets: [other] }).originalCukiePoints)
      .toBe(0);
  });

  it('retains entitlement during an own-game assignment only with explicit soft-stake metadata', () => {
    const retained = assetWithLocks([{
      _id: 'game-retained',
      assetId: 'cukies:1',
      status: 'active',
      reason: 'game_assignment',
      ownerNormalized: owner.toLowerCase(),
      sessionId: 'session-1',
      retainsSoftStakeEntitlement: true,
      expiresAt: new Date(now.getTime() + 1000),
    }]);
    const ordinaryGameAssignment = assetWithLocks([{
      _id: 'game-ordinary',
      assetId: 'cukies:1',
      status: 'active',
      reason: 'game_assignment',
      ownerNormalized: owner.toLowerCase(),
      sessionId: 'session-2',
      expiresAt: new Date(now.getTime() + 1000),
    }]);

    const entitlement = summarizeCukieMasterNftEntitlement({
      walletAddress: owner,
      assets: [retained],
    });
    expect(retained.canonicalState).toBe('assigned_to_game');
    expect(entitlement.originalCukiePoints).toBe(4);
    expect(entitlement.eligibleAssets[0].activeLocks[0]).toMatchObject({
      reason: 'game_assignment',
      retainsSoftStakeEntitlement: true,
    });
    expect(summarizeCukieMasterNftEntitlement({
      walletAddress: owner,
      assets: [ordinaryGameAssignment],
    }).originalCukiePoints).toBe(0);
  });
});
