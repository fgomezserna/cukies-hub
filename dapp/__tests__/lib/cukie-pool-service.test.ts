import type { NormalizedNftAsset } from '@/lib/nft-inventory';
import {
  createMemoryCukiePoolHarness,
} from '@/lib/uki-economy/cukie-pool/testing';
import {
  createCukiePoolService,
  lockMatchesOpenPoolPosition,
} from '@/lib/uki-economy/cukie-pool/service';
import { UkiEconomyError } from '@/lib/uki-economy/errors';

const OWNER = `0x${'a'.repeat(40)}`;
const OTHER = `0x${'b'.repeat(40)}`;
const T0 = new Date('2026-07-10T10:00:00.000Z');
const T24 = new Date('2026-07-11T10:00:00.000Z');

function asset(
  id: string,
  overrides: Partial<NormalizedNftAsset> = {},
): NormalizedNftAsset {
  return {
    assetId: `cukies:${id}`,
    tokenId: id,
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
      documentId: id,
      tokenId: id,
      observedAt: T0.toISOString(),
    }],
    ...overrides,
  };
}

function depositInput(id: string, key = `deposit:${id}`, now = T0) {
  return {
    walletAddress: OWNER,
    assetId: `cukies:${id}`,
    idempotencyKey: key,
    now,
  };
}

function assignmentInput(sessionId: string, now = T24) {
  return {
    sessionId,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    idempotencyKey: `assign:${sessionId}`,
    now,
  };
}

describe('Cukie Pool service', () => {
  it('fails closed for non-BSC, wrong ownership, unknown metadata and unsafe state', async () => {
    const harness = createMemoryCukiePoolHarness([
      asset('tron', { network: 'tron' }),
      asset('owner', { ownerNormalized: OTHER, ownerWallet: OTHER }),
      asset('unknown', { rarity: 'unknown', blockers: ['missing_rarity'] }),
      asset('listed', { canonicalState: 'listed', blockers: ['listed'] }),
    ]);

    for (const id of ['tron', 'owner', 'unknown', 'listed']) {
      await expect(harness.service.depositCukiePoolPosition(depositInput(id))).rejects.toBeInstanceOf(
        UkiEconomyError,
      );
    }
    expect(harness.state.positions.size).toBe(0);
    expect(harness.state.locks.size).toBe(0);
  });

  it('deposits atomically, fences the NFT lock and is idempotent under concurrent retries', async () => {
    const harness = createMemoryCukiePoolHarness([asset('1', { rarity: 'legendary' })]);
    const [left, right] = await Promise.all([
      harness.service.depositCukiePoolPosition(depositInput('1')),
      harness.service.depositCukiePoolPosition(depositInput('1')),
    ]);

    expect(left.positionId).toBe(right.positionId);
    expect(left).toMatchObject({
      assetId: 'cukies:1',
      generation: 'original',
      rarity: 'legendary',
      gamesQuota: 10,
      gamesRemaining: 10,
      lockFencingToken: 1,
      status: 'active',
    });
    expect(left.eligibleAt).toEqual(T24);
    expect(harness.state.positions.size).toBe(1);
    expect(harness.state.locks.size).toBe(1);
    await expect(harness.service.depositCukiePoolPosition(
      depositInput('1', 'another-deposit'),
    )).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('allows lending before 24h but gates owner rewards and restarts eligibility after re-stake', async () => {
    const harness = createMemoryCukiePoolHarness([asset('1')]);
    const first = await harness.service.depositCukiePoolPosition(depositInput('1'));
    const early = await harness.service.assignCukiePoolSession(
      assignmentInput('early', new Date(T24.getTime() - 1)),
    );
    expect(early).toMatchObject({
      kind: 'pool_asset',
      positionId: first.positionId,
      ownerRewardEligible: false,
    });
    await harness.service.releaseCukiePoolAssignment({
      sessionId: early.sessionId,
      expectedRevision: 0,
      consumeGame: false,
      reason: 'test_release',
      idempotencyKey: 'release:early',
      now: T24,
    });

    const withdrawn = await harness.service.requestCukiePoolWithdrawal({
      walletAddress: OWNER,
      positionId: first.positionId,
      expectedRevision: 2,
      idempotencyKey: 'withdraw:first',
      now: T24,
    });
    expect(withdrawn.status).toBe('withdrawn');

    const restakeAt = new Date('2026-07-12T10:00:00.000Z');
    const restaked = await harness.service.depositCukiePoolPosition(
      depositInput('1', 'deposit:restake', restakeAt),
    );
    expect(restaked.eligibleAt).toEqual(new Date('2026-07-13T10:00:00.000Z'));
    const stillEarly = await harness.service.assignCukiePoolSession(
      assignmentInput('restake-early', new Date('2026-07-13T09:59:59.999Z')),
    );
    expect(stillEarly).toMatchObject({
      kind: 'pool_asset',
      positionId: restaked.positionId,
      ownerRewardEligible: false,
    });
    await harness.service.releaseCukiePoolAssignment({
      sessionId: stillEarly.sessionId,
      expectedRevision: 0,
      consumeGame: false,
      reason: 'test_release',
      idempotencyKey: 'release:restake-early',
      now: new Date('2026-07-13T09:59:59.999Z'),
    });
    const mature = await harness.service.assignCukiePoolSession(
      assignmentInput('restake-mature', new Date('2026-07-13T10:00:00.000Z')),
    );
    expect(mature.kind).toBe('pool_asset');
    expect(mature.positionId).toBe(restaked.positionId);
    expect(mature.ownerRewardEligible).toBe(true);
  });

  it('always assigns a mature Original before second generation and uses FIFO in each pool', async () => {
    const harness = createMemoryCukiePoolHarness([
      asset('second', { generation: 'second_generation', rarity: 'goat' }),
      asset('original-late', { generation: 'original', rarity: 'common' }),
      asset('original-first', { generation: 'original', rarity: 'rare' }),
    ]);
    await harness.service.depositCukiePoolPosition(
      depositInput('second', 'deposit:second', new Date(T0.getTime() - 60_000)),
    );
    await harness.service.depositCukiePoolPosition(
      depositInput('original-late', 'deposit:original-late', T0),
    );
    await harness.service.depositCukiePoolPosition(
      depositInput('original-first', 'deposit:original-first', new Date(T0.getTime() - 30_000)),
    );

    const assignment = await harness.service.assignCukiePoolSession(
      assignmentInput('priority', T24),
    );
    expect(assignment.assetId).toBe('cukies:original-first');
    expect(assignment.generation).toBe('original');
    expect(assignment.ownerRewardEligible).toBe(true);
  });

  it('binds public source health to the exact pool/game lock session and expiry', async () => {
    const harness = createMemoryCukiePoolHarness([asset('source-health')]);
    const position = await harness.service.depositCukiePoolPosition(
      depositInput('source-health'),
    );
    const poolLock = harness.state.locks.get(position.lockId)!;
    expect(lockMatchesOpenPoolPosition(position, poolLock)).toBe(true);
    expect(lockMatchesOpenPoolPosition(position, {
      ...poolLock,
      expiresAt: T24,
    })).toBe(false);
    expect(lockMatchesOpenPoolPosition({
      ...position,
      assignmentExpiresAt: T24,
    }, poolLock)).toBe(false);

    const assignment = await harness.service.assignCukiePoolSession(
      assignmentInput('source-health-game'),
    );
    const assignedPosition = harness.state.positions.get(position.positionId)!;
    const gameLock = harness.state.locks.get(assignedPosition.lockId)!;
    expect(lockMatchesOpenPoolPosition(assignedPosition, gameLock)).toBe(true);
    expect(lockMatchesOpenPoolPosition(assignedPosition, {
      ...gameLock,
      sessionId: 'another-session',
    })).toBe(false);
    expect(lockMatchesOpenPoolPosition(assignedPosition, {
      ...gameLock,
      expiresAt: new Date(assignment.expiresAt.getTime() + 1),
    })).toBe(false);
  });

  it('falls back to a deterministic Seiku without owner rewards when no asset is usable', async () => {
    const harness = createMemoryCukiePoolHarness();
    const first = await harness.service.assignCukiePoolSession(assignmentInput('seiku-session'));
    const retry = await harness.service.assignCukiePoolSession(assignmentInput('seiku-session'));

    expect(first).toEqual(retry);
    expect(first).toMatchObject({
      kind: 'seiku',
      generation: 'original',
      rarity: 'common',
      ownerNormalized: null,
      ownerRewardEligible: false,
      lockId: null,
    });
    expect(first.assetId).toMatch(/^seiku:[0-9a-f]{64}$/);
  });

  it('consumes exact quotas only on completed games and releases exhausted assets', async () => {
    const harness = createMemoryCukiePoolHarness([
      asset('quota', { generation: 'second_generation', rarity: 'common' }),
    ]);
    const position = await harness.service.depositCukiePoolPosition(depositInput('quota'));
    expect(position.gamesQuota).toBe(1);
    const assigned = await harness.service.assignCukiePoolSession(assignmentInput('quota-game'));
    expect(assigned.kind).toBe('pool_asset');
    expect(harness.state.positions.get(position.positionId)?.gamesRemaining).toBe(0);

    const completed = await harness.service.releaseCukiePoolAssignment({
      sessionId: assigned.sessionId,
      expectedRevision: 0,
      consumeGame: true,
      reason: 'game_completed',
      idempotencyKey: 'release:quota-game',
      now: new Date(T24.getTime() + 60_000),
    });
    expect(completed.status).toBe('completed');
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'exhausted',
      lifecycleOpen: false,
      gamesRemaining: 0,
    });
    expect(Array.from(harness.state.locks.values())[0].status).toBe('released');
  });

  it('restores a reserved game on cancellation and safely expires the assignment', async () => {
    const harness = createMemoryCukiePoolHarness([asset('cancel')]);
    const position = await harness.service.depositCukiePoolPosition(depositInput('cancel'));
    const assigned = await harness.service.assignCukiePoolSession(
      assignmentInput('cancel-game'),
    );
    const expiry = assigned.expiresAt;
    const result = await harness.service.expireCukiePoolAssignments({ now: expiry, limit: 10 });

    expect(result).toEqual({ scanned: 1, expired: 1, skipped: 0 });
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'active',
      gamesRemaining: 2,
      lockFencingToken: 1,
    });
    const activeLocks = Array.from(harness.state.locks.values()).filter((lock) => (
      lock.status === 'active'
    ));
    const expiredLocks = Array.from(harness.state.locks.values()).filter((lock) => (
      lock.status === 'expired'
    ));
    expect(activeLocks).toHaveLength(1);
    expect(expiredLocks).toHaveLength(1);
    expect(expiredLocks[0].fencingToken).toBe(3);
    expect(harness.state.positions.get(position.positionId)?.lockId).toBe(activeLocks[0].lockId);
    expect(harness.state.assignments.get(assigned.assignmentId)?.status).toBe('expired');
    expect(await harness.service.expireCukiePoolAssignments({ now: expiry, limit: 10 })).toEqual({
      scanned: 0,
      expired: 0,
      skipped: 0,
    });
  });

  it('never expires assignments owned by an existing GameEconomy saga', async () => {
    const harness = createMemoryCukiePoolHarness([asset('game-owned')]);
    const position = await harness.service.depositCukiePoolPosition(
      depositInput('game-owned'),
    );
    const active = await harness.service.assignCukiePoolSession(
      assignmentInput('game-active'),
    );
    const terminalIntent = await harness.service.assignCukiePoolSession(
      assignmentInput('game-terminal-intent'),
    );
    const orphan = await harness.service.assignCukiePoolSession(
      assignmentInput('orphan-session'),
    );
    harness.setGameSessionLifecycle(active.sessionId, { status: 'started' });
    harness.setGameSessionLifecycle(terminalIntent.sessionId, {
      status: 'validated',
      terminalIntentStatus: 'expired',
    });

    await expect(harness.service.expireCukiePoolAssignments({
      now: active.expiresAt,
      limit: 10,
    })).resolves.toEqual({ scanned: 3, expired: 1, skipped: 2 });
    expect(harness.state.assignments.get(active.assignmentId)?.status).toBe('active');
    expect(harness.state.assignments.get(terminalIntent.assignmentId)?.status).toBe('active');
    expect(harness.state.assignments.get(orphan.assignmentId)?.status).toBe('expired');
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'assigned',
      gamesRemaining: 1,
      assignmentSessionId: active.sessionId,
    });
  });

  it('paginates beyond 5000 unusable rows before deciding the real pool assignment', async () => {
    const harness = createMemoryCukiePoolHarness([asset('deep-page')]);
    const position = await harness.service.depositCukiePoolPosition(
      depositInput('deep-page'),
    );
    for (let index = 0; index < 5_001; index += 1) {
      const stakedAt = new Date(T0.getTime() - (5_002 - index));
      const documentId = `invalid-position-${String(index).padStart(5, '0')}`;
      harness.state.positions.set(documentId, {
        ...position,
        _id: documentId,
        positionId: 'corrupt-shared-position-id',
        stakedAt,
        eligibleAt: new Date(stakedAt.getTime() + 24 * 60 * 60 * 1000),
      });
    }

    const assignment = await harness.service.assignCukiePoolSession(
      assignmentInput('deep-page-session'),
    );
    expect(assignment).toMatchObject({
      kind: 'pool_asset',
      positionId: position.positionId,
      assetId: position.assetId,
      ownerRewardEligible: true,
    });
  });

  it('fails closed instead of returning Seiku when the source cursor does not advance', async () => {
    const harness = createMemoryCukiePoolHarness([asset('stalled-source')]);
    const position = await harness.service.depositCukiePoolPosition(
      depositInput('stalled-source'),
    );
    const stalledPage = Array.from({ length: 100 }, (_, index) => {
      const stakedAt = new Date(T0.getTime() - (100 - index));
      const positionId = `invalid-stalled-${String(index).padStart(3, '0')}`;
      return {
        ...position,
        _id: positionId,
        positionId,
        stakedAt,
        eligibleAt: new Date(stakedAt.getTime() + 24 * 60 * 60 * 1000),
      };
    });
    const stalledService = createCukiePoolService((work) => harness.runner((context) => {
      const repository = new Proxy(context.repository, {
        get(target, property) {
          if (property === 'listAssignablePositions') {
            return async () => stalledPage;
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      return work({ ...context, repository });
    }));

    await expect(stalledService.assignCukiePoolSession(
      assignmentInput('stalled-source-session'),
    )).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(harness.state.assignments.size).toBe(0);
  });

  it('recovers an assignment whose lock was already expired by a previous generic worker', async () => {
    const harness = createMemoryCukiePoolHarness([asset('legacy-expiry')]);
    const position = await harness.service.depositCukiePoolPosition(
      depositInput('legacy-expiry'),
    );
    const assigned = await harness.service.assignCukiePoolSession(
      assignmentInput('legacy-expiry-game'),
    );
    const staleLock = harness.state.locks.get(position.lockId)!;
    harness.state.locks.set(position.lockId, {
      ...staleLock,
      status: 'expired',
      fencingToken: staleLock.fencingToken + 1,
      updatedAt: assigned.expiresAt,
      releaseReason: 'expired',
    });

    await expect(harness.service.expireCukiePoolAssignments({
      now: assigned.expiresAt,
      limit: 10,
    })).resolves.toEqual({ scanned: 1, expired: 1, skipped: 0 });
    expect(harness.state.assignments.get(assigned.assignmentId)?.status).toBe('expired');
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'active',
      lifecycleOpen: true,
      gamesRemaining: 2,
    });
    expect(Array.from(harness.state.locks.values()).filter((lock) => (
      lock.status === 'active' && lock.reason === 'pool_deposit'
    ))).toHaveLength(1);
  });

  it('closes pool aggregates whose canonical lock was invalidated', async () => {
    const harness = createMemoryCukiePoolHarness([asset('ownership-change')]);
    const position = await harness.service.depositCukiePoolPosition(
      depositInput('ownership-change'),
    );
    const assigned = await harness.service.assignCukiePoolSession(
      assignmentInput('ownership-change-game'),
    );
    const staleLock = harness.state.locks.get(position.lockId)!;
    harness.state.locks.set(position.lockId, {
      ...staleLock,
      status: 'invalidated',
      fencingToken: staleLock.fencingToken + 1,
      updatedAt: new Date(T24.getTime() + 1_000),
      releaseReason: 'canonical_owner_changed',
    });

    await expect(harness.service.reconcileCukiePoolPositions({
      now: new Date(T24.getTime() + 1_000),
      limit: 10,
      actor: 'test-runtime',
    })).resolves.toEqual({
      scanned: 1,
      invalidated: 1,
      skipped: 0,
      nextCursor: null,
    });
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'invalidated',
      lifecycleOpen: false,
      closeReason: 'lock_reconciliation:test-runtime',
    });
    expect(harness.state.assignments.get(assigned.assignmentId)).toMatchObject({
      status: 'released',
      releaseReason: 'pool_position_invalidated:test-runtime',
    });
  });

  it('records withdrawal while assigned and only releases the asset with session liberation', async () => {
    const harness = createMemoryCukiePoolHarness([asset('withdraw')]);
    const position = await harness.service.depositCukiePoolPosition(depositInput('withdraw'));
    const assigned = await harness.service.assignCukiePoolSession(assignmentInput('withdraw-game'));
    const requested = await harness.service.requestCukiePoolWithdrawal({
      walletAddress: OWNER,
      positionId: position.positionId,
      expectedRevision: 1,
      idempotencyKey: 'withdraw:assigned',
      now: new Date(T24.getTime() + 1_000),
    });

    expect(requested).toMatchObject({ status: 'assigned', lifecycleOpen: true });
    expect(requested.withdrawalRequestedAt).toBeDefined();
    expect(Array.from(harness.state.locks.values())[0]).toMatchObject({
      status: 'active',
      reason: 'game_assignment',
    });

    await harness.service.releaseCukiePoolAssignment({
      sessionId: assigned.sessionId,
      expectedRevision: 0,
      consumeGame: false,
      reason: 'session_cancelled',
      idempotencyKey: 'release:withdraw-game',
      now: new Date(T24.getTime() + 2_000),
    });
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'withdrawn',
      lifecycleOpen: false,
      closeReason: 'withdrawal_after_assignment',
    });
    expect(Array.from(harness.state.locks.values())[0].status).toBe('released');
  });

  it('rechecks ownership/state before assignment and never lends an invalid asset', async () => {
    const source = asset('changed');
    const harness = createMemoryCukiePoolHarness([source]);
    const position = await harness.service.depositCukiePoolPosition(depositInput('changed'));
    harness.state.assets.get(source.assetId)!.canonicalState = 'listed';
    harness.state.assets.get(source.assetId)!.blockers = ['listed'];

    const assignment = await harness.service.assignCukiePoolSession(
      assignmentInput('invalid-source'),
    );
    expect(assignment.kind).toBe('seiku');
    expect(harness.state.positions.get(position.positionId)).toMatchObject({
      status: 'active',
      gamesRemaining: 2,
    });
  });

  it('serializes assignment races so one asset cannot be lent to two sessions', async () => {
    const harness = createMemoryCukiePoolHarness([
      asset('race', { generation: 'second_generation', rarity: 'common' }),
    ]);
    await harness.service.depositCukiePoolPosition(depositInput('race'));
    const [first, second] = await Promise.all([
      harness.service.assignCukiePoolSession(assignmentInput('race-a')),
      harness.service.assignCukiePoolSession(assignmentInput('race-b')),
    ]);
    expect([first.kind, second.kind].sort()).toEqual(['pool_asset', 'seiku']);
    const pooled = [first, second].find((assignment) => assignment.kind === 'pool_asset')!;
    expect(harness.state.positions.get(pooled.positionId!)).toMatchObject({
      status: 'assigned',
      assignmentSessionId: pooled.sessionId,
    });
  });
});
