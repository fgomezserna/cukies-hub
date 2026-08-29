jest.mock('@/lib/indexer-db/mongodb', () => ({ withEconomyTransaction: jest.fn() }));

import { assertCukiePoolAssignmentIntegrity } from '@/lib/uki-economy/cukie-pool/service';
import { SchemaNotReadyError } from '@/lib/uki-economy/errors';
import {
  createCukiePoolVaultAssignmentService,
  type CukiePoolVaultAssetLease,
  type CukiePoolVaultAssignmentRepository,
  type CukiePoolVaultPeriodUsage,
} from '@/lib/uki-economy/cukie-pool/vault-assignment';
import type {
  CukiePoolVaultCandidate,
  CukiePoolVaultPeriod,
} from '@/lib/uki-economy/cukie-pool/vault-source';
import type { CukiePoolAssignment } from '@/lib/uki-economy/cukie-pool/types';

const OWNER = `0x${'a'.repeat(40)}`;
const COLLECTION = `0x${'c'.repeat(40)}`;
const VAULT = `0x${'d'.repeat(40)}`;
const NOW = new Date('2026-08-15T15:00:00.000Z');
const PERIOD: CukiePoolVaultPeriod = {
  periodId: '100',
  startsAt: new Date('2026-08-15T14:00:00.000Z'),
  endsAt: new Date('2026-08-16T14:00:00.000Z'),
  calendarVersion: '2',
};

const QUOTA_CASES = [
  { generation: 'original', rarity: 'common', gamesQuota: 2, poolPriority: 0 },
  { generation: 'original', rarity: 'uncommon', gamesQuota: 4, poolPriority: 0 },
  { generation: 'original', rarity: 'rare', gamesQuota: 6, poolPriority: 0 },
  { generation: 'original', rarity: 'epic', gamesQuota: 8, poolPriority: 0 },
  { generation: 'original', rarity: 'legendary', gamesQuota: 10, poolPriority: 0 },
  { generation: 'original', rarity: 'goat', gamesQuota: 12, poolPriority: 0 },
  { generation: 'second_generation', rarity: 'common', gamesQuota: 1, poolPriority: 1 },
  { generation: 'second_generation', rarity: 'uncommon', gamesQuota: 2, poolPriority: 1 },
  { generation: 'second_generation', rarity: 'rare', gamesQuota: 3, poolPriority: 1 },
  { generation: 'second_generation', rarity: 'epic', gamesQuota: 4, poolPriority: 1 },
  { generation: 'second_generation', rarity: 'legendary', gamesQuota: 5, poolPriority: 1 },
  { generation: 'second_generation', rarity: 'goat', gamesQuota: 6, poolPriority: 1 },
] as const;

function candidate(
  tokenId: string,
  overrides: Partial<CukiePoolVaultCandidate> = {},
): CukiePoolVaultCandidate {
  const assetId = `97:${COLLECTION}:${tokenId}`;
  return {
    positionId: `${assetId}:epoch:1`,
    assetId,
    chainId: 97,
    collectionAddressNormalized: COLLECTION,
    tokenId,
    vaultAddressNormalized: VAULT,
    ownerNormalized: OWNER,
    depositEpoch: '1',
    depositedAt: new Date('2026-08-14T13:00:00.000Z'),
    activationAt: new Date('2026-08-15T14:00:00.000Z'),
    withdrawableAt: null,
    ownerRewardEligible: true,
    generation: 'original',
    rarity: 'common',
    gamesQuota: 2,
    poolPriority: 0,
    ...overrides,
  };
}

function cloneAssignment(value: CukiePoolAssignment) {
  return {
    ...value,
    assignedAt: new Date(value.assignedAt),
    expiresAt: new Date(value.expiresAt),
    updatedAt: new Date(value.updatedAt),
    ...(value.periodStartsAt ? { periodStartsAt: new Date(value.periodStartsAt) } : {}),
    ...(value.periodEndsAt ? { periodEndsAt: new Date(value.periodEndsAt) } : {}),
    ...(value.releasedAt ? { releasedAt: new Date(value.releasedAt) } : {}),
  };
}

function harness(initialCandidates: CukiePoolVaultCandidate[]) {
  const assignments = new Map<string, CukiePoolAssignment>();
  const leases = new Map<string, CukiePoolVaultAssetLease>();
  const usages = new Map<string, CukiePoolVaultPeriodUsage>();
  let candidates = initialCandidates;
  const repository: CukiePoolVaultAssignmentRepository = {
    currentPeriod: async () => PERIOD,
    listCandidates: async () => candidates,
    findAssignmentBySessionId: async (sessionId) => (
      [...assignments.values()].find((item) => item.sessionId === sessionId) ?? null
    ),
    findAssignmentByIdempotencyKey: async (idempotencyKey) => (
      [...assignments.values()].find((item) => item.idempotencyKey === idempotencyKey) ?? null
    ),
    findActiveAssignmentByAssetId: async (assetId) => (
      [...assignments.values()].find((item) => (
        item.assetId === assetId && item.status === 'active'
      )) ?? null
    ),
    insertAssignment: async (assignment) => {
      if (
        assignments.has(assignment._id)
        || [...assignments.values()].some((item) => (
          item.sessionId === assignment.sessionId
          || item.idempotencyKey === assignment.idempotencyKey
        ))
      ) throw Object.assign(new Error('duplicate assignment'), { code: 11000 });
      assignments.set(assignment._id, cloneAssignment(assignment));
    },
    compareAndSetAssignment: async (current, replacement) => {
      const stored = assignments.get(current._id);
      if (!stored || stored.revision !== current.revision || stored.status !== current.status) return null;
      assignments.set(replacement._id, cloneAssignment(replacement));
      return cloneAssignment(replacement);
    },
    findLease: async (positionId) => leases.get(positionId) ?? null,
    insertLease: async (lease) => {
      if (leases.has(lease._id)) throw Object.assign(new Error('duplicate lease'), { code: 11000 });
      leases.set(lease._id, { ...lease });
    },
    deleteLease: async (lease) => {
      const stored = leases.get(lease._id);
      if (!stored || stored.assignmentId !== lease.assignmentId || stored.revision !== lease.revision) {
        return false;
      }
      leases.delete(lease._id);
      return true;
    },
    findUsage: async (id) => usages.get(id) ?? null,
    insertUsage: async (usage) => {
      if (usages.has(usage._id)) throw Object.assign(new Error('duplicate usage'), { code: 11000 });
      usages.set(usage._id, { ...usage, consumedAssignmentIds: [...usage.consumedAssignmentIds] });
    },
    compareAndSetUsage: async (current, replacement) => {
      const stored = usages.get(current._id);
      if (!stored || stored.revision !== current.revision) return null;
      usages.set(replacement._id, {
        ...replacement,
        consumedAssignmentIds: [...replacement.consumedAssignmentIds],
      });
      return replacement;
    },
    listExpiredAssignments: async (now, limit) => [...assignments.values()]
      .filter((item) => item.status === 'active' && item.expiresAt <= now)
      .slice(0, limit),
    findGameSessionLifecycle: async () => null,
  };
  const service = createCukiePoolVaultAssignmentService(async (work) => work(repository));
  return {
    service,
    assignments,
    leases,
    usages,
    setCandidates: (next: CukiePoolVaultCandidate[]) => { candidates = next; },
  };
}

function assignInput(sessionId: string, now = NOW) {
  return {
    sessionId,
    expiresAt: new Date(now.getTime() + 10 * 60_000),
    idempotencyKey: `assign:${sessionId}`,
    now,
  };
}

describe('Cukie Pool custodial assignment', () => {
  it('binds period+depositEpoch, takes Original before Second and never double-leases an NFT', async () => {
    const second = candidate('2', {
      generation: 'second_generation',
      rarity: 'goat',
      gamesQuota: 6,
      poolPriority: 1,
    });
    const original = candidate('1');
    const state = harness([second, original]);

    const first = await state.service.assignCukiePoolSession(assignInput('game:1'));
    expect(assertCukiePoolAssignmentIntegrity(first)).toMatchObject({
      custodyMode: 'custodial',
      kind: 'pool_asset',
      assetId: original.assetId,
      depositEpoch: '1',
      periodId: '100',
      gamesQuota: 2,
      lockId: null,
      lockFencingToken: null,
    });
    const secondGame = await state.service.assignCukiePoolSession(assignInput('game:2'));
    expect(secondGame.assetId).toBe(second.assetId);
    expect(state.leases.size).toBe(2);
    expect(await state.service.assignCukiePoolSession(assignInput('game:1'))).toEqual(first);
  });

  it.each(QUOTA_CASES)(
    'enforces $gamesQuota games for $generation/$rarity before falling back to Seiku',
    async ({ generation, rarity, gamesQuota, poolPriority: expectedPriority }) => {
      const tokenId = `${generation === 'original' ? '1' : '2'}${String(gamesQuota).padStart(2, '0')}`;
      const asset = candidate(tokenId, {
        generation,
        rarity,
        gamesQuota,
        poolPriority: expectedPriority,
      });
      const state = harness([asset]);

      for (let game = 1; game <= gamesQuota; game += 1) {
        const sessionId = `${generation}:${rarity}:${game}`;
        const assigned = await state.service.assignCukiePoolSession(assignInput(sessionId));
        expect(assigned).toMatchObject({
          kind: 'pool_asset',
          assetId: asset.assetId,
          generation,
          rarity,
          gamesQuota,
        });
        await state.service.releaseCukiePoolAssignment({
          sessionId,
          expectedRevision: 0,
          consumeGame: true,
          reason: 'game_settled',
          idempotencyKey: `finish:${sessionId}`,
          now: new Date(NOW.getTime() + game * 1_000),
        });
      }

      expect(state.leases.size).toBe(0);
      expect(state.usages.get(`${asset.positionId}:period:${PERIOD.periodId}`)).toMatchObject({
        gamesQuota,
        consumedGames: gamesQuota,
      });
      await expect(state.service.assignCukiePoolSession(
        assignInput(`${generation}:${rarity}:exhausted`),
      )).resolves.toMatchObject({
        kind: 'seiku',
        generation: 'original',
        rarity: 'common',
        ownerRewardEligible: false,
        gamesQuota: null,
      });
    },
  );

  it('releases an expired lease without consuming quota and makes the NFT lendable again', async () => {
    const asset = candidate('expiry');
    const state = harness([asset]);
    const assigned = await state.service.assignCukiePoolSession(assignInput('expires'));
    expect(state.leases.size).toBe(1);

    await expect(state.service.expireCukiePoolAssignments({
      now: assigned.expiresAt,
      limit: 100,
      actor: 'test-expirer',
    })).resolves.toEqual({ scanned: 1, expired: 1, skipped: 0 });
    expect(state.assignments.get(assigned.assignmentId)).toMatchObject({
      status: 'expired',
      releaseReason: 'assignment_expired:test-expirer',
    });
    expect(state.leases.size).toBe(0);
    expect(state.usages.size).toBe(0);

    const reassigned = await state.service.assignCukiePoolSession(assignInput(
      'after-expiry',
      new Date(assigned.expiresAt.getTime() + 1),
    ));
    expect(reassigned).toMatchObject({ kind: 'pool_asset', assetId: asset.assetId });
  });

  it('fails closed if repository metadata tries to alter priority or quota', async () => {
    const state = harness([
      candidate('corrupt-priority', { poolPriority: 1 }),
    ]);
    await expect(state.service.assignCukiePoolSession(
      assignInput('corrupt-priority'),
    )).rejects.toBeInstanceOf(SchemaNotReadyError);

    state.setCandidates([
      candidate('corrupt-quota', { gamesQuota: 12 }),
    ]);
    await expect(state.service.assignCukiePoolSession(
      assignInput('corrupt-quota'),
    )).rejects.toBeInstanceOf(SchemaNotReadyError);
    expect(state.assignments.size).toBe(0);
    expect(state.leases.size).toBe(0);
  });

  it('does not consume quota on release, consumes exactly once on completion and never restores it', async () => {
    const asset = candidate('quota');
    const state = harness([asset]);

    const releasedReservation = await state.service.assignCukiePoolSession(assignInput('cancelled'));
    await state.service.releaseCukiePoolAssignment({
      sessionId: releasedReservation.sessionId,
      expectedRevision: 0,
      consumeGame: false,
      reason: 'game_cancelled',
      idempotencyKey: 'finish:cancelled',
      now: new Date(NOW.getTime() + 1_000),
    });
    expect(state.usages.size).toBe(0);

    for (const sessionId of ['completed:1', 'completed:2']) {
      const assigned = await state.service.assignCukiePoolSession(assignInput(sessionId));
      const input = {
        sessionId,
        expectedRevision: 0,
        consumeGame: true,
        reason: 'game_settled',
        idempotencyKey: `finish:${sessionId}`,
        now: new Date(NOW.getTime() + 2_000),
      };
      const completed = await state.service.releaseCukiePoolAssignment(input);
      expect(completed.status).toBe('completed');
      expect(await state.service.releaseCukiePoolAssignment(input)).toEqual(completed);
      expect(assigned.periodId).toBe('100');
    }

    expect([...state.usages.values()][0]).toMatchObject({
      positionId: asset.positionId,
      assetId: asset.assetId,
      depositEpoch: '1',
      periodId: '100',
      gamesQuota: 2,
      consumedGames: 2,
    });
    const fallback = await state.service.assignCukiePoolSession(assignInput('after-quota'));
    expect(fallback).toMatchObject({
      kind: 'seiku',
      ownerRewardEligible: false,
      gamesQuota: null,
      custodyMode: 'custodial',
    });
  });

  it('keeps an exit-requested NFT lendable until cutoff but removes owner reward eligibility', async () => {
    const exiting = candidate('exit', {
      ownerRewardEligible: false,
      withdrawableAt: new Date('2026-08-16T14:00:00.000Z'),
    });
    const state = harness([exiting]);
    const assignment = await state.service.assignCukiePoolSession(assignInput('exit-game'));
    expect(assignment).toMatchObject({
      kind: 'pool_asset',
      assetId: exiting.assetId,
      ownerRewardEligible: false,
    });
  });

  it('keys quota by position/depositEpoch/period and a new epoch starts with a clean ledger', async () => {
    const firstEpoch = candidate('restake');
    const state = harness([firstEpoch]);
    const first = await state.service.assignCukiePoolSession(assignInput('epoch:1'));
    await state.service.releaseCukiePoolAssignment({
      sessionId: first.sessionId,
      expectedRevision: 0,
      consumeGame: true,
      reason: 'settled',
      idempotencyKey: 'finish:epoch:1',
      now: new Date(NOW.getTime() + 1_000),
    });

    const nextEpoch = candidate('restake', {
      positionId: `${firstEpoch.assetId}:epoch:2`,
      depositEpoch: '2',
    });
    state.setCandidates([nextEpoch]);
    const second = await state.service.assignCukiePoolSession(assignInput('epoch:2'));
    expect(second).toMatchObject({ positionId: nextEpoch.positionId, depositEpoch: '2' });
    expect([...state.usages.keys()]).toEqual([
      `${firstEpoch.positionId}:period:${PERIOD.periodId}`,
    ]);
  });
});
