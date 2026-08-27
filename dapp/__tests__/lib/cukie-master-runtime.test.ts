import {
  fullReconciliationRoutesForSource,
  legacyNftRecalculationJobRepair,
  recalculationFenceFilter,
  recalculationRetryBackoffMs,
  routedRecalculationJobId,
} from '@/lib/uki-economy/cukie-master/runtime-queue';
import {
  FULL_RECONCILIATION_SOURCES,
  NFT_OWNERSHIP_CURSOR_SORT,
  cukiesAssetFilter,
  evaluateNftOwnership,
  fullReconciliationCycleId,
  fullReconciliationJobId,
  fullReconciliationSourceFilter,
  nftOwnershipCursorFilter,
  normalizedWalletsFromSourcePage,
  parseCukiesAssetLookup,
  runtimeRouteBinding,
  schedulerHeartbeatHealthy,
  sameRuntimeRouteBinding,
} from '@/lib/uki-economy/cukie-master/runtime-policy';

const WALLET_A = '0x00000000000000000000000000000000000000aa';
const WALLET_B = '0x00000000000000000000000000000000000000bb';

describe('Cukie Master runtime queue', () => {
  it('backs retries off and caps poison jobs', () => {
    expect([1, 2, 3, 4].map(recalculationRetryBackoffMs)).toEqual([
      5_000,
      10_000,
      20_000,
      40_000,
    ]);
    expect(recalculationRetryBackoffMs(100)).toBeLessThanOrEqual(6 * 60 * 60_000);
  });

  it('fences completion to the exact worker lease generation', () => {
    const current = recalculationFenceFilter({ _id: 'job-1', fenceToken: 7 }, 'worker-a');
    expect(current).toEqual({
      _id: 'job-1',
      status: 'processing',
      leasedBy: 'worker-a',
      fenceToken: 7,
    });
    expect(recalculationFenceFilter({ _id: 'job-1', fenceToken: 8 }, 'worker-b'))
      .not.toEqual(current);
  });

  it('binds every queue identity to one route', () => {
    expect(routedRecalculationJobId('chain-event:event-1:0xabc', 'uki')).toBe(
      'chain-event:event-1:0xabc:uki',
    );
    expect(routedRecalculationJobId('chain-event:event-1:0xabc', 'nft')).toBe(
      'chain-event:event-1:0xabc:nft',
    );
  });
});

describe('Cukie Master runtime cursor policy', () => {
  it('binds grace/waitlist cursors to round revision and proposal epoch', () => {
    const base = {
      roundId: 'uki:v1',
      revision: 3,
      ruleVersion: 'v1',
      requirement: { route: 'uki' as const, ukiRaw: '20000' },
      pendingRequirement: { route: 'uki' as const, ukiRaw: '30000' },
      proposalIdempotencyKey: 'proposal-1',
      graceEndsAt: new Date('2026-07-12T00:00:00.000Z'),
    };
    const binding = runtimeRouteBinding(base);
    expect(sameRuntimeRouteBinding(binding, binding)).toBe(true);
    expect(sameRuntimeRouteBinding(runtimeRouteBinding({
      ...base,
      revision: 4,
    }), binding)).toBe(false);
    expect(sameRuntimeRouteBinding(runtimeRouteBinding({
      ...base,
      proposalIdempotencyKey: 'proposal-2',
    }), binding)).toBe(false);
  });

  it('uses the same _id field for ownership ordering and continuation', () => {
    expect(NFT_OWNERSHIP_CURSOR_SORT).toEqual({ _id: 1 });
    expect(nftOwnershipCursorFilter('lock-100')).toEqual({
      status: 'active',
      _id: { $gt: 'lock-100' },
    });
  });

  it('ties NFT lookup to exact asset identity and BSC token, never a token-only OR', () => {
    const documentLookup = parseCukiesAssetLookup('cukies:42');
    const tokenLookup = parseCukiesAssetLookup('cukies:bsc:42');
    expect(documentLookup).toEqual({ kind: 'document', documentId: '42' });
    expect(tokenLookup).toEqual({ kind: 'token', network: 'BSC', tokenId: '42' });
    expect(cukiesAssetFilter(documentLookup!)).toEqual({ _id: '42' });
    expect(cukiesAssetFilter(tokenLookup!)).toEqual({
      network: { $in: ['BSC', 'bsc'] },
      tokenId: '42',
    });
    expect(cukiesAssetFilter(tokenLookup!)).not.toHaveProperty('$or');
  });

  it('fails closed for missing owner/asset and homonymous token candidates', () => {
    const lookup = parseCukiesAssetLookup('cukies:bsc:42')!;
    expect(evaluateNftOwnership({
      lookup,
      assets: [],
      lockOwnerNormalized: WALLET_A,
    })).toEqual({ action: 'invalidate_integrity', reason: 'nft_lock_asset_missing' });
    expect(evaluateNftOwnership({
      lookup,
      assets: [
        { _id: 'bsc-42', network: 'BSC', tokenId: '42', ownerNormalized: WALLET_A },
        { _id: 'other-42', network: 'BSC', tokenId: '42', ownerNormalized: WALLET_B },
      ],
      lockOwnerNormalized: WALLET_A,
    })).toEqual({ action: 'invalidate_integrity', reason: 'nft_lock_asset_ambiguous' });
    expect(evaluateNftOwnership({
      lookup,
      assets: [{ _id: 'bsc-42', network: 'BSC', tokenId: '42' }],
      lockOwnerNormalized: WALLET_A,
    })).toEqual({ action: 'invalidate_integrity', reason: 'nft_lock_owner_missing' });
  });
});

describe('Cukie Master full reconciliation policy', () => {
  it('discovers a new wallet from already-projected sources without an outbox job', () => {
    expect(FULL_RECONCILIATION_SOURCES.map((source) => source.id)).toEqual([
      'projected-positions',
      'staking-positions',
      'vesting-positions',
      'presale-participants',
      'presale-entitlements',
      'nft-owners',
      'nft-active-locks',
      'nft-custodial-positions',
    ]);
    expect(normalizedWalletsFromSourcePage([
      { _id: 'stake-1', walletNormalized: WALLET_B.toUpperCase() },
      { _id: 'stake-2', walletNormalized: WALLET_B },
    ], 'walletNormalized')).toEqual([WALLET_B]);
  });

  it('uses a stable composite source cursor and deterministic UTC-period job ids', () => {
    const source = FULL_RECONCILIATION_SOURCES[2];
    expect(fullReconciliationSourceFilter(source, {
      afterWallet: WALLET_A,
      afterId: `${WALLET_A}:schedule-a`,
    })).toEqual({
      $or: [
        { walletNormalized: { $gt: WALLET_A } },
        {
          walletNormalized: WALLET_A,
          _id: { $gt: `${WALLET_A}:schedule-a` },
        },
      ],
    });
    const cycleId = fullReconciliationCycleId(new Date('2026-07-10T23:59:59.000Z'));
    expect(cycleId).toBe('2026-07-10');
    expect(fullReconciliationJobId(cycleId, WALLET_A)).toBe(
      `full-reconciliation:2026-07-10:${WALLET_A}`,
    );
    expect(fullReconciliationJobId(cycleId, WALLET_A)).toBe(
      fullReconciliationJobId(cycleId, WALLET_A),
    );
  });

  it('enqueues only the affected route, or both explicit jobs for projected positions', () => {
    expect(fullReconciliationRoutesForSource('staking-positions')).toEqual(['uki']);
    expect(fullReconciliationRoutesForSource('vesting-positions')).toEqual(['uki']);
    expect(fullReconciliationRoutesForSource('presale-participants')).toEqual(['uki']);
    expect(fullReconciliationRoutesForSource('nft-owners')).toEqual(['nft']);
    expect(fullReconciliationRoutesForSource('nft-active-locks')).toEqual(['nft']);
    expect(fullReconciliationRoutesForSource('nft-custodial-positions')).toEqual(['nft']);
    expect(fullReconciliationRoutesForSource('projected-positions')).toEqual(['uki', 'nft']);
    expect(() => fullReconciliationRoutesForSource('unknown-source')).toThrow(
      'Fuente de reconciliacion Cukie Master desconocida',
    );
  });

  it('repairs legacy NFT jobs that were created without a route', () => {
    const now = new Date('2026-08-16T12:00:00.000Z');
    expect(legacyNftRecalculationJobRepair(now)).toEqual({
      filter: {
        sourceType: 'nft_lock_event',
        route: { $exists: false },
        status: { $in: ['pending', 'failed'] },
        walletNormalized: { $regex: '^0x[0-9a-f]{40}$' },
      },
      update: {
        $set: { route: 'nft', status: 'pending', availableAt: now, updatedAt: now },
        $unset: {
          leasedBy: '', leaseExpiresAt: '', completedAt: '', expiresAt: '', lastErrorCode: '',
        },
      },
    });
  });
});

describe('Cukie Master scheduler heartbeat policy', () => {
  it('becomes unhealthy after continuous failures or stale attempts', () => {
    const now = new Date('2026-07-10T12:10:00.000Z');
    const heartbeat = {
      lastAttemptAt: new Date('2026-07-10T12:09:00.000Z'),
      lastSuccessAt: new Date('2026-07-10T12:08:00.000Z'),
      consecutiveFailures: 2,
    };
    expect(schedulerHeartbeatHealthy({
      now,
      heartbeat,
      maxLagMs: 5 * 60_000,
      maxConsecutiveFailures: 3,
    })).toBe(true);
    expect(schedulerHeartbeatHealthy({
      now,
      heartbeat: { ...heartbeat, consecutiveFailures: 3 },
      maxLagMs: 5 * 60_000,
      maxConsecutiveFailures: 3,
    })).toBe(false);
    expect(schedulerHeartbeatHealthy({
      now,
      heartbeat: {
        ...heartbeat,
        lastAttemptAt: new Date('2026-07-10T12:00:00.000Z'),
      },
      maxLagMs: 5 * 60_000,
      maxConsecutiveFailures: 3,
    })).toBe(false);
  });
});
