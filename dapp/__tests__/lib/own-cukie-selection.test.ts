jest.mock('server-only', () => ({}), { virtual: true });

import {
  CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT,
  canonicalOwnershipHistoryQueryWindow,
  isCanonicalOwnershipHistoryWindowComplete,
  resolveCanonicalOwnershipHistory,
  type CanonicalOwnershipHistoryRow,
} from '@/lib/uki-economy/own-cukie/ownership';
import { createOwnCukieService } from '@/lib/uki-economy/own-cukie/service';
import {
  assertOwnCukieAssetEligible,
  OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION,
  ownCukieEpochId,
  ownCukiePeriodEpochId,
  ownCukieQuota,
} from '@/lib/uki-economy/own-cukie/rules';
import type { OwnCukieAssetSnapshot } from '@/lib/uki-economy/own-cukie/types';
import { createNftAssetLockService } from '@/lib/nft-inventory/locks';
import type { NftAssetLockDocument, NftAssetLockEventDocument } from '@/lib/nft-inventory/lock-types';
import type { NftAssetLockRepository } from '@/lib/nft-inventory/lock-repository';
import type {
  OwnCukieAssignment,
  OwnCukieEpoch,
  OwnCukieEvent,
} from '@/lib/uki-economy/own-cukie/types';

const OWNER = '0x1111111111111111111111111111111111111111';
const BUYER = '0x2222222222222222222222222222222222222222';
const COLLECTION = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function transfer(
  id: string,
  blockNumber: number,
  from: string,
  to: string,
  overrides: Partial<CanonicalOwnershipHistoryRow> = {},
): CanonicalOwnershipHistoryRow {
  return {
    _id: id,
    eventName: 'Transfer',
    status: 'projected',
    chain: 'BSC',
    chainId: 97,
    contractAlias: 'TOKEN_V2',
    contractAddress: COLLECTION,
    blockNumber,
    logIndex: 0,
    blockHash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
    txHash: `0x${id.replace(/[^a-f0-9]/gi, '').padStart(64, '0').slice(-64)}`,
    timestampMs: blockNumber * 1_000,
    normalized: {
      tokenId: '7',
      fromNormalized: from.toLowerCase(),
      toNormalized: to.toLowerCase(),
    },
    ...overrides,
  };
}

function transferToken(
  id: string,
  blockNumber: number,
  from: string,
  to: string,
  tokenId: string,
): CanonicalOwnershipHistoryRow {
  const row = transfer(id, blockNumber, from, to);
  return {
    ...row,
    normalized: {
      ...row.normalized,
      tokenId,
    },
  };
}

function asset(overrides: Partial<OwnCukieAssetSnapshot> = {}): OwnCukieAssetSnapshot {
  return {
    assetId: 'cukies:97:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:7',
    tokenId: '7',
    network: 'bsc',
    ownerWallet: OWNER,
    ownerNormalized: OWNER.toLowerCase(),
    rarity: 'rare',
    generation: 'original',
    canonicalState: 'available',
    blockers: [],
    activeLocks: [],
    sourceRefs: [],
    ownershipEventId: 'mint-event',
    ...overrides,
  };
}

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, clone(child)]),
    ) as T;
  }
  return value;
}

function ownServiceHarness(
  initialAsset: OwnCukieAssetSnapshot,
  additionalAssets: OwnCukieAssetSnapshot[] = [],
) {
  const state = {
    asset: clone(initialAsset),
    additionalAssets: additionalAssets.map((item) => clone(item)),
    epochs: new Map<string, OwnCukieEpoch>(),
    assignments: new Map<string, OwnCukieAssignment>(),
    events: new Map<string, OwnCukieEvent>(),
    locks: new Map<string, NftAssetLockDocument>(),
    lockEvents: new Map<string, NftAssetLockEventDocument>(),
  };
  const lockRepository = {
    findLockById: async (lockId: string) => clone(state.locks.get(lockId) ?? null),
    findLockByIdempotencyKey: async (key: string) => (
      clone([...state.locks.values()].find((lock) => lock.idempotencyKey === key) ?? null)
    ),
    findEventByIdempotencyKey: async (key: string) => (
      clone([...state.lockEvents.values()].find((event) => event.idempotencyKey === key) ?? null)
    ),
    findActiveLockByAssetId: async (assetId: string) => (
      clone([...state.locks.values()].find((lock) => lock.assetId === assetId && lock.status === 'active') ?? null)
    ),
    findExpiredActiveLocks: async () => [],
    insertLock: async (lock: NftAssetLockDocument) => {
      state.locks.set(lock.lockId, clone(lock));
    },
    compareAndSetActiveLock: async (
      lockId: string,
      expectedFencingToken: number,
      replacement: NftAssetLockDocument,
    ) => {
      const current = state.locks.get(lockId);
      if (!current || current.status !== 'active' || current.fencingToken !== expectedFencingToken) return null;
      state.locks.set(lockId, clone(replacement));
      return clone(replacement);
    },
    insertEvent: async (event: NftAssetLockEventDocument) => {
      state.lockEvents.set(event.eventId, clone(event));
    },
    enqueueRecalculation: async () => {},
  } as unknown as NftAssetLockRepository;
  const allAssets = () => [state.asset, ...state.additionalAssets];
  const snapshotWithLocks = (source: OwnCukieAssetSnapshot) => ({
    ...clone(source),
    activeLocks: [...state.locks.values()]
      .filter((lock) => lock.assetId === source.assetId && lock.status === 'active')
      .map((lock) => ({
        lockId: lock.lockId,
        assetId: lock.assetId,
        ownerNormalized: lock.ownerNormalized,
        reason: lock.reason,
        state: lock.reason === 'game_assignment' ? 'assigned_to_game' as const : 'unknown' as const,
      })),
  });
  const repository = {
    listWalletAssets: async (ownerNormalized: string) => {
      return allAssets()
        .filter((source) => source.ownerNormalized === ownerNormalized)
        .map(snapshotWithLocks);
    },
    findAsset: async (assetId: string) => {
      const source = allAssets().find((item) => item.assetId === assetId);
      return source ? snapshotWithLocks(source) : null;
    },
    findEpoch: async (epochId: string) => clone(state.epochs.get(epochId) ?? null),
    insertEpoch: async (epoch: OwnCukieEpoch) => { state.epochs.set(epoch.epochId, clone(epoch)); },
    compareAndSetEpoch: async (current: OwnCukieEpoch, replacement: OwnCukieEpoch) => {
      const stored = state.epochs.get(current.epochId);
      if (
        !stored
        || stored.revision !== current.revision
        || stored.status !== current.status
        || stored.gamesRemaining !== current.gamesRemaining
      ) return null;
      state.epochs.set(replacement.epochId, clone(replacement));
      return clone(replacement);
    },
    findAssignmentById: async (id: string) => clone(state.assignments.get(id) ?? null),
    findAssignmentBySessionId: async (sessionId: string) => clone(
      [...state.assignments.values()].find((assignment) => assignment.sessionId === sessionId) ?? null,
    ),
    findAssignmentByIdempotencyKey: async (key: string) => clone(
      [...state.assignments.values()].find((assignment) => assignment.idempotencyKey === key) ?? null,
    ),
    insertAssignment: async (assignment: OwnCukieAssignment) => {
      state.assignments.set(assignment.assignmentId, clone(assignment));
    },
    compareAndSetAssignment: async (current: OwnCukieAssignment, replacement: OwnCukieAssignment) => {
      const stored = state.assignments.get(current.assignmentId);
      if (
        !stored
        || stored.revision !== current.revision
        || stored.status !== current.status
        || stored.lockFencingToken !== current.lockFencingToken
      ) return null;
      state.assignments.set(replacement.assignmentId, clone(replacement));
      return clone(replacement);
    },
    findEventByIdempotencyKey: async (key: string) => clone(
      [...state.events.values()].find((event) => event.idempotencyKey === key) ?? null,
    ),
    insertEvent: async (event: OwnCukieEvent) => { state.events.set(event.eventId, clone(event)); },
  } as any;
  const lockService = createNftAssetLockService(async (work) => work(lockRepository));
  const service = createOwnCukieService(async (work) => work({
    repository,
    lockRepository,
    lockService,
  }));
  return { state, service };
}

describe('own Cukie canonical selection', () => {
  it('reconstructs ownership from Transfer evidence and ignores self-transfer/replay', () => {
    const rows = [
      transfer('transfer-2', 20, OWNER, BUYER),
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('self-3', 21, BUYER, BUYER),
      transfer('transfer-2', 20, OWNER, BUYER),
    ];
    const result = resolveCanonicalOwnershipHistory(rows, {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    });
    expect(result.status).toBe('resolved');
    if (result.status !== 'resolved') return;
    expect(result.ownerNormalized).toBe(BUYER);
    expect(result.ownershipEventId).toBe('transfer-2');
    expect(result.latest.eventId).toBe('transfer-2');
  });

  it('fails closed for missing mint, ownership drift, wrong collection and same-tuple reorgs', () => {
    expect(resolveCanonicalOwnershipHistory([
      transfer('gift-1', 10, OWNER, BUYER),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    }).status).toBe('incomplete');

    expect(resolveCanonicalOwnershipHistory([
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('gift-2', 20, BUYER, BUYER),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    }).status).toBe('conflict');

    expect(resolveCanonicalOwnershipHistory([
      transfer('metadata-1', 9, '0x0000000000000000000000000000000000000000', OWNER, {
        eventName: 'CukieMetadataConfigured',
      }),
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: OWNER,
    }).status).toBe('resolved');

    expect(resolveCanonicalOwnershipHistory([
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
    ], {
      chainId: 97,
      collectionAddressNormalized: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      tokenId: '7',
      expectedOwnerNormalized: OWNER,
    }).status).toBe('incomplete');

    expect(resolveCanonicalOwnershipHistory([
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('gift-2', 20, OWNER, BUYER),
      transfer('gift-2', 20, OWNER, BUYER, {
        _id: 'gift-2b',
        blockHash: `0x${'f'.repeat(64)}`,
      }),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    }).status).toBe('conflict');

    expect(resolveCanonicalOwnershipHistory([
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('gift-2', 20, OWNER, BUYER),
      transfer('gift-2', 20, OWNER, BUYER, {
        blockHash: `0x${'f'.repeat(64)}`,
      }),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    }).status).toBe('conflict');

    expect(resolveCanonicalOwnershipHistory([
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('gift-2', 20, OWNER, BUYER),
      transfer('gift-2', 20, OWNER, OWNER),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    }).status).toBe('conflict');

    // A selected Transfer with incomplete evidence cannot be skipped: doing
    // so would let a stale mint/owner look current after a partial read.
    expect(resolveCanonicalOwnershipHistory([
      transfer('mint-1', 10, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('broken-2', 20, OWNER, BUYER, {
        normalized: {
          tokenId: '7',
          fromNormalized: OWNER.toLowerCase(),
        },
      }),
    ], {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    }).status).toBe('incomplete');
  });

  it('does not trust an old owner when the history window cuts a round trip', () => {
    const prefix = [
      transfer('mint-1', 1, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('to-buyer-before-cut', 2, OWNER, BUYER),
      ...Array.from({ length: CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT - 2 }, (_, index) => (
        transfer(`self-${index}`, 3 + index, BUYER, BUYER)
      )),
    ];
    const fullHistory = [
      ...prefix,
      transfer('back-to-owner-after-cut', 600, BUYER, OWNER),
      transfer('to-buyer-after-cut', 601, OWNER, BUYER),
    ];

    const truncated = resolveCanonicalOwnershipHistory(prefix, {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    });
    const complete = resolveCanonicalOwnershipHistory(fullHistory, {
      chainId: 97,
      collectionAddressNormalized: COLLECTION,
      tokenId: '7',
      expectedOwnerNormalized: BUYER,
    });

    expect(prefix).toHaveLength(CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT);
    expect(fullHistory).toHaveLength(CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT + 2);
    expect(truncated.status).toBe('resolved');
    if (truncated.status === 'resolved') {
      expect(truncated.ownershipEventId).toBe('to-buyer-before-cut');
    }
    expect(complete.status).toBe('resolved');
    if (complete.status === 'resolved') {
      expect(complete.ownershipEventId).toBe('to-buyer-after-cut');
    }
    // The repository keeps a sentinel row and therefore rejects `fullHistory`
    // instead of passing `truncated` to the reservation path.
    expect(isCanonicalOwnershipHistoryWindowComplete(prefix)).toBe(true);
    expect(isCanonicalOwnershipHistoryWindowComplete(fullHistory)).toBe(false);
    expect(isCanonicalOwnershipHistoryWindowComplete(prefix, { globalTruncated: true }))
      .toBe(false);
  });

  it('fails closed when a hot token consumes the shared history page before another token round trip', () => {
    const hotToken = [
      transfer('hot-mint', 1, '0x0000000000000000000000000000000000000000', OWNER),
      transfer('hot-to-buyer', 2, OWNER, BUYER),
      ...Array.from({ length: 698 }, (_, index) => (
        transfer(`hot-self-${index}`, 3 + index, BUYER, BUYER)
      )),
    ];
    const tokenBPrefix = [
      transferToken('token-b-mint', 1001, '0x0000000000000000000000000000000000000000', OWNER, '8'),
      transferToken('token-b-to-buyer-before-cut', 1002, OWNER, BUYER, '8'),
      ...Array.from({ length: 325 }, (_, index) => (
        transferToken(`token-b-self-${index}`, 1003 + index, BUYER, BUYER, '8')
      )),
    ];
    const tokenBTail = [
      transferToken('token-b-back-after-cut', 2000, BUYER, OWNER, '8'),
      transferToken('token-b-to-buyer-after-cut', 2001, OWNER, BUYER, '8'),
    ];
    const allRows = [...hotToken, ...tokenBPrefix, ...tokenBTail];
    const queryWindow = canonicalOwnershipHistoryQueryWindow(2);
    const queriedRows = allRows.slice(0, queryWindow.queryLimit);
    const tokenBRows = queriedRows.filter((row) => row.normalized?.tokenId === '8');
    const tokenBInput = {
      chainId: 97 as const,
      collectionAddressNormalized: COLLECTION,
      tokenId: '8',
      expectedOwnerNormalized: BUYER,
    };

    expect(queryWindow).toEqual({ sentinelBoundary: 1026, queryLimit: 1027 });
    expect(hotToken).toHaveLength(700);
    expect(tokenBPrefix).toHaveLength(327);
    expect(queriedRows).toHaveLength(queryWindow.queryLimit);
    expect(queriedRows.length).toBeGreaterThan(queryWindow.sentinelBoundary);
    expect(tokenBRows).toHaveLength(tokenBPrefix.length);
    expect(resolveCanonicalOwnershipHistory(tokenBRows, tokenBInput)).toMatchObject({
      status: 'resolved',
      ownershipEventId: 'token-b-to-buyer-before-cut',
    });
    expect(resolveCanonicalOwnershipHistory([...tokenBPrefix, ...tokenBTail], tokenBInput))
      .toMatchObject({
        status: 'resolved',
        ownershipEventId: 'token-b-to-buyer-after-cut',
      });
    expect(isCanonicalOwnershipHistoryWindowComplete(tokenBRows, {
      globalTruncated: queriedRows.length > queryWindow.sentinelBoundary,
    })).toBe(false);
  });

  it.each([
    ['soft-staked', { canonicalState: 'soft_staked' as const, activeLocks: [{
      lockId: 'master', assetId: 'asset', ownerNormalized: OWNER.toLowerCase(),
      reason: 'soft_stake', state: 'soft_staked' as const,
    }] }],
    ['pool', { canonicalState: 'in_pool' as const, activeLocks: [{
      lockId: 'pool', assetId: 'asset', ownerNormalized: OWNER.toLowerCase(),
      reason: 'pool_deposit', state: 'in_pool' as const,
    }] }],
    ['listed', { canonicalState: 'listed' as const, activeLocks: [] }],
    ['bridge', { canonicalState: 'bridging' as const, activeLocks: [] }],
    ['unknown', { canonicalState: 'unknown' as const, activeLocks: [] }],
  ])('excludes %s assets from a new own reservation', (_label, overrides) => {
    expect(() => assertOwnCukieAssetEligible(asset(overrides), OWNER.toLowerCase()))
      .toThrow(/no es elegible/);
  });

  it('keeps one cumulative quota per ownership event and resets only on a new transfer', () => {
    const first = ownCukieEpochId({
      assetId: asset().assetId,
      ownerNormalized: OWNER.toLowerCase(),
      ownershipEventId: 'transfer-1',
    });
    const replay = ownCukieEpochId({
      assetId: asset().assetId,
      ownerNormalized: OWNER.toLowerCase(),
      ownershipEventId: 'transfer-1',
    });
    const next = ownCukieEpochId({
      assetId: asset().assetId,
      ownerNormalized: OWNER.toLowerCase(),
      ownershipEventId: 'transfer-2',
    });
    expect(replay).toBe(first);
    expect(next).not.toBe(first);
    expect(ownCukieQuota('original', 'rare')).toBeGreaterThan(0);
  });

  it('runs inventory → epoch → own reservation → terminal close atomically for a wallet Cukie', async () => {
    const now = new Date('2026-09-10T12:00:00.000Z');
    const harness = ownServiceHarness(asset({ ownerNormalized: OWNER.toLowerCase() }));
    const assignment = await harness.service.reserve({
      sessionId: 'session-own-1',
      walletAddress: OWNER,
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
      idempotencyKey: 'reserve-own-1',
      requestHash: 'a'.repeat(64),
      expiresAt: new Date(now.getTime() + 60_000),
      now,
    });
    expect(assignment?.assetId).toBe('cukies:97:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:7');
    expect(harness.state.epochs.size).toBe(1);
    expect(harness.state.locks.size).toBe(1);

    const closed = await harness.service.finish({
      sessionId: 'session-own-1',
      assignmentId: assignment!.assignmentId,
      reservationIdempotencyKey: 'reserve-own-1',
      idempotencyKey: 'finish-own-1',
      consumeGame: true,
      reason: 'game_settled',
      now: new Date(now.getTime() + 10_000),
    });
    expect(closed.status).toBe('completed');
    expect([...harness.state.locks.values()][0].status).toBe('released');
    expect([...harness.state.epochs.values()][0].gamesRemaining)
      .toBe(ownCukieQuota('original', 'rare') - 1);
  });

  it('agrega el ledger diario y conserva el saldo al transferir el NFT', async () => {
    const period = {
      periodId: 'C1800-D:2026-09-10T12:00:00.000Z',
      startsAt: new Date('2026-09-10T12:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:30:00.000Z'),
      policyVersion: OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION,
    };
    const harness = ownServiceHarness(asset({ ownerNormalized: OWNER.toLowerCase() }));
    const first = await harness.service.reserve({
      sessionId: 'period-own-1',
      walletAddress: OWNER,
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
      idempotencyKey: 'period-reserve-1',
      requestHash: 'b'.repeat(64),
      expiresAt: new Date(period.startsAt.getTime() + 60_000),
      quotaPeriod: period,
      now: period.startsAt,
    });
    expect(first).toBeTruthy();
    const stableId = ownCukiePeriodEpochId({
      assetId: asset().assetId,
      periodId: period.periodId,
      quotaPolicyVersion: period.policyVersion,
    });
    expect(first?.epochId).toBe(stableId);
    await harness.service.finish({
      sessionId: 'period-own-1',
      assignmentId: first!.assignmentId,
      reservationIdempotencyKey: 'period-reserve-1',
      idempotencyKey: 'period-finish-1',
      consumeGame: true,
      reason: 'game_settled',
      now: new Date(period.startsAt.getTime() + 1_000),
    });

    harness.state.asset = asset({
      ownerWallet: BUYER,
      ownerNormalized: BUYER.toLowerCase(),
      ownershipEventId: 'transfer-to-buyer',
    });
    const second = await harness.service.reserve({
      sessionId: 'period-own-2',
      walletAddress: BUYER,
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
      idempotencyKey: 'period-reserve-2',
      requestHash: 'c'.repeat(64),
      expiresAt: new Date(period.startsAt.getTime() + 60_000),
      quotaPeriod: period,
      now: new Date(period.startsAt.getTime() + 2_000),
    });
    expect(second?.epochId).toBe(stableId);
    await harness.service.finish({
      sessionId: 'period-own-2',
      assignmentId: second!.assignmentId,
      reservationIdempotencyKey: 'period-reserve-2',
      idempotencyKey: 'period-finish-2',
      consumeGame: true,
      reason: 'game_settled',
      now: new Date(period.startsAt.getTime() + 3_000),
    });
    const availability = await harness.service.availability({
      walletAddress: BUYER,
      quotaPeriod: period,
      now: new Date(period.startsAt.getTime() + 4_000),
    });
    expect(availability).toMatchObject({
      status: 'ready',
      eligibleCukies: 1,
      totalGamesRemaining: ownCukieQuota('original', 'rare') - 2,
    });
  });

  it('excluye la capacidad de un Cukie con una reserva activa y la recupera al liberar', async () => {
    const period = {
      periodId: 'C1800-D:2026-09-10T12:00:00.000Z',
      startsAt: new Date('2026-09-10T12:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:30:00.000Z'),
      policyVersion: OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION,
    };
    const harness = ownServiceHarness(asset({ rarity: 'common' }));
    const assignment = await harness.service.reserve({
      sessionId: 'period-reserved-1',
      walletAddress: OWNER,
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
      idempotencyKey: 'period-reserve-active-1',
      requestHash: 'd'.repeat(64),
      expiresAt: new Date(period.startsAt.getTime() + 60_000),
      quotaPeriod: period,
      now: period.startsAt,
    });
    expect(assignment).toBeTruthy();
    await expect(harness.service.availability({
      walletAddress: OWNER,
      quotaPeriod: period,
      now: new Date(period.startsAt.getTime() + 1_000),
    })).resolves.toMatchObject({
      status: 'ready',
      totalGamesRemaining: 0,
      eligibleCukies: 0,
    });

    await harness.service.finish({
      sessionId: 'period-reserved-1',
      assignmentId: assignment!.assignmentId,
      reservationIdempotencyKey: 'period-reserve-active-1',
      idempotencyKey: 'period-release-active-1',
      consumeGame: false,
      reason: 'game_cancelled',
      now: new Date(period.startsAt.getTime() + 2_000),
    });
    await expect(harness.service.availability({
      walletAddress: OWNER,
      quotaPeriod: period,
      now: new Date(period.startsAt.getTime() + 3_000),
    })).resolves.toMatchObject({
      status: 'ready',
      totalGamesRemaining: ownCukieQuota('original', 'common'),
      eligibleCukies: 1,
    });
  });

  it('no convierte un activo con estado desconocido en cero disponible', async () => {
    const period = {
      periodId: 'C1800-D:2026-09-10T12:00:00.000Z',
      startsAt: new Date('2026-09-10T12:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:30:00.000Z'),
      policyVersion: OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION,
    };
    const harness = ownServiceHarness(asset({ canonicalState: 'unknown', blockers: ['unknown_state'] }));
    await expect(harness.service.availability({
      walletAddress: OWNER,
      quotaPeriod: period,
      now: period.startsAt,
    })).resolves.toMatchObject({
      status: 'unknown',
      totalGamesRemaining: null,
      eligibleCukies: null,
    });
  });

  it('no deja que un estado incompatible con ownership incompleto contamine el saldo', async () => {
    const period = {
      periodId: 'C1800-D:2026-09-10T12:00:00.000Z',
      startsAt: new Date('2026-09-10T12:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:30:00.000Z'),
      policyVersion: OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION,
    };
    const harness = ownServiceHarness(asset({
      canonicalState: 'soft_staked',
      ownershipEventId: '',
    }));
    await expect(harness.service.availability({
      walletAddress: OWNER,
      quotaPeriod: period,
      now: period.startsAt,
    })).resolves.toMatchObject({
      status: 'ready',
      totalGamesRemaining: 0,
      eligibleCukies: 0,
      unknownCukies: 0,
    });
  });

  it('expone capacidad confirmada como parcial cuando otro Cukie sigue pendiente', async () => {
    const period = {
      periodId: 'C1800-D:2026-09-10T12:00:00.000Z',
      startsAt: new Date('2026-09-10T12:00:00.000Z'),
      endsAt: new Date('2026-09-10T12:30:00.000Z'),
      policyVersion: OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION,
    };
    const harness = ownServiceHarness(
      asset({ rarity: 'rare' }),
      [asset({
        assetId: 'cukies:97:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:8',
        tokenId: '8',
        ownershipEventId: '',
      })],
    );
    await expect(harness.service.availability({
      walletAddress: OWNER,
      quotaPeriod: period,
      now: period.startsAt,
    })).resolves.toMatchObject({
      status: 'partial',
      totalGamesRemaining: ownCukieQuota('original', 'rare'),
      eligibleCukies: 1,
      unknownCukies: 1,
    });
  });
});
