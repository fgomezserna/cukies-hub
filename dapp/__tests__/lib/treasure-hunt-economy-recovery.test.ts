jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameSession: { findUnique: jest.fn() },
  },
}));
jest.mock('@/lib/uki-economy/game-economy/coordinator', () => ({
  assertTreasureHuntAuthorityGameSession: jest.fn(),
  completeGameSession: jest.fn(),
  openGameSession: jest.fn(),
  rejectGameSession: jest.fn(),
}));

import { createGameEconomyService } from '@/lib/uki-economy/game-economy/service';
import {
  createMemoryGameEconomyPorts,
  createMemoryGameEconomyRunner,
  MemoryGameEconomyRepository,
  testGameEconomyRule,
} from '@/lib/uki-economy/game-economy/testing';
import {
  buildGameResourceReservationResultHash,
  stableGameEconomyHash,
} from '@/lib/uki-economy/game-economy/rules';
import {
  buildGameCukieAssignmentEvidence,
  buildGameOwnCukieAssignmentEvidence,
} from '@/lib/uki-economy/game-economy/resource-evidence';
import { TREASURE_HUNT_ECONOMY_POLICY } from '@/lib/uki-economy/game-economy/treasure-hunt-policy';
import type { GameEconomyEvent, GameEconomySession } from '@/lib/uki-economy/game-economy/types';
import {
  ownCukieAssignmentId,
  ownCukieEpochId,
  ownCukieQuota,
  stableOwnCukieHash,
} from '@/lib/uki-economy/own-cukie/rules';
import type { OwnCukieAssignment, OwnCukieEpoch, OwnCukieEvent } from '@/lib/uki-economy/own-cukie/types';
import {
  deterministicSeikuAssetId,
  stableCukiePoolHash,
} from '@/lib/uki-economy/cukie-pool/rules';
import type { CukiePoolAssignment, CukiePoolEvent } from '@/lib/uki-economy/cukie-pool/types';
import {
  buildNftAssetLockEvent,
  buildNftLockPayloadHash,
} from '@/lib/nft-inventory/lock-types';
import type { NftAssetLockDocument, NftAssetLockEventDocument } from '@/lib/nft-inventory/lock-types';
import type { Db } from 'mongodb';
import {
  inspectTreasureHuntEconomyRecovery,
  treasureHuntRecoveryReplacementIdempotencyKey,
} from '@/lib/uki-economy/game-economy/treasure-hunt-recovery';
import {
  openTreasureHuntEconomyRun,
  treasureHuntEconomyOpenCreateIdempotencyKey,
} from '@/lib/uki-economy/game-economy/treasure-hunt';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { prisma } from '@/lib/prisma';
import { openGameSession } from '@/lib/uki-economy/game-economy/coordinator';

const WALLET = `0x${'1'.repeat(40)}`;
const NOW = new Date('2026-07-10T12:00:00.000Z');
const CREATE_KEY = 'treasure-create';

type Doc = Record<string, unknown>;

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

function valueAt(document: Doc, path: string): unknown {
  const read = (value: unknown, parts: string[]): unknown => {
    if (parts.length === 0) return value;
    if (Array.isArray(value)) return value.flatMap((item) => {
      const child = read(item, parts);
      return Array.isArray(child) ? child : [child];
    }).filter((item) => item !== undefined);
    if (!value || typeof value !== 'object') return undefined;
    return read((value as Doc)[parts[0]], parts.slice(1));
  };
  return read(document, path.split('.'));
}

function equalValue(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matches(document: Doc, filter: Doc): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    if (key === '$or') {
      if (!Array.isArray(expected) || !expected.some((candidate) => matches(document, candidate as Doc))) {
        return false;
      }
      continue;
    }
    const actual = valueAt(document, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      const operator = expected as Doc;
      if ('$in' in operator) {
        const actualValues = Array.isArray(actual) ? actual : [actual];
        if (!Array.isArray(operator.$in) || !operator.$in.some((item) => actualValues.some((value) => equalValue(value, item)))) return false;
        continue;
      }
      if ('$exists' in operator) {
        if (Boolean(operator.$exists) !== (actual !== undefined)) return false;
        continue;
      }
    }
    if (Array.isArray(actual)) {
      if (!actual.some((item) => equalValue(item, expected))) return false;
    } else if (!equalValue(actual, expected)) {
      return false;
    }
  }
  return true;
}

function fakeCollection<T extends Doc>(rows: T[]) {
  return {
    findOne: jest.fn(async (filter: Doc) => {
      const row = rows.find((candidate) => matches(candidate, filter));
      return row ? clone(row) : null;
    }),
    find: jest.fn((filter: Doc) => {
      let selected = rows.filter((candidate) => matches(candidate, filter));
      const cursor = {
        limit(limit: number) {
          selected = selected.slice(0, limit);
          return cursor;
        },
        toArray: async () => clone(selected),
      };
      return cursor;
    }),
  };
}

function fakeDb(collections: Record<string, Doc[]>) {
  const handles = new Map<string, ReturnType<typeof fakeCollection>>();
  return {
    collection: jest.fn((name: string) => {
      let handle = handles.get(name);
      if (!handle) {
        handle = fakeCollection(collections[name] ?? []);
        handles.set(name, handle);
      }
      return handle;
    }),
  } as unknown as Db;
}

function treasureRule() {
  return testGameEconomyRule({
    _id: `treasure-hunt:${TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion}`,
    gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
    version: TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
    cukie: {
      required: true,
      consumeOnSettle: false,
      minAssets: 0,
      maxAssets: 0,
      role: 'own_or_pool',
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
    },
  });
}

async function createRejectedSession(createKey = CREATE_KEY): Promise<GameEconomySession> {
  const repository = new MemoryGameEconomyRepository({ rules: [treasureRule()] });
  const ports = createMemoryGameEconomyPorts();
  ports.resources.fail('credit', 'reserve');
  const service = createGameEconomyService(createMemoryGameEconomyRunner(repository), ports);
  await expect(service.createSession({
    walletAddress: WALLET,
    gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
    cukieAssetIds: [],
    expectedRuleVersion: TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
    idempotencyKey: createKey,
    now: NOW,
  })).rejects.toThrow();
  return repository.state.sessions[0]!;
}

function eventFor(
  session: GameEconomySession,
  index: number,
  input: Pick<GameEconomyEvent, 'toStatus' | 'creditState' | 'cukieState'>,
): GameEconomyEvent {
  const previous = index === 0 ? null : eventFor(session, index - 1, {
    toStatus: index - 1 === session.revision ? session.status : 'created',
    creditState: index - 1 >= session.revision - 2 ? 'released' : 'pending',
    cukieState: index - 1 >= session.revision - 1 ? 'released' : 'pending',
  });
  const createdAt = session.updatedAt;
  const eventId = stableGameEconomyHash({
    kind: 'game-economy-session-event-id',
    sessionId: session.sessionId,
    toRevision: index,
  });
  const immutable = {
    eventId,
    sessionId: session.sessionId,
    fromRevision: previous?.toRevision ?? null,
    toRevision: index,
    fromStatus: previous?.toStatus ?? null,
    toStatus: input.toStatus,
    creditState: input.creditState,
    cukieState: input.cukieState,
    fenceToken: index === 0 ? 0 : Math.min(session.fenceToken, index),
    createdAt,
  } as const;
  return {
    _id: eventId,
    ...immutable,
    payloadHash: stableGameEconomyHash({ kind: 'game-economy-session-event', ...immutable }),
  };
}

function canonicalEvents(session: GameEconomySession): GameEconomyEvent[] {
  return Array.from({ length: session.revision + 1 }, (_, index) => eventFor(session, index, {
    toStatus: index === session.revision ? 'rejected' : 'created',
    creditState: index >= session.revision - 2 ? 'released' : 'pending',
    cukieState: index >= session.revision - 1 ? 'released' : 'pending',
  }));
}

function databaseFor(session: GameEconomySession, gameEvents = canonicalEvents(session), extras: Record<string, Doc[]> = {}) {
  return fakeDb({
    game_economy_sessions: [session as unknown as Doc],
    game_economy_events: gameEvents as unknown as Doc[],
    ...extras,
  });
}

function resourceBinding(session: GameEconomySession, kind: 'credit' | 'cukie', reservationId: string, evidenceHash: string) {
  return {
    _id: stableGameEconomyHash({ kind: 'game-resource-binding', sessionId: session.sessionId, resource: kind }),
    sessionId: session.sessionId,
    kind,
    reservationIdempotencyKey: `${session.sessionId}:${kind}:reserve`,
    requestHash: session[kind].reservationRequestHash,
    fenceToken: session.fenceToken,
    reservationId,
    evidenceHash,
    terminalIntent: 'released' as const,
    terminalIdempotencyKey: `${session.sessionId}:${kind}:release`,
    status: 'released' as const,
    revision: 2,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
}

function ownReleaseDocuments(session: GameEconomySession) {
  const assetId = 'asset-1';
  const ownershipEventId = 'ownership-1';
  const assignmentId = ownCukieAssignmentId(session.sessionId);
  const reserveKey = `${session.sessionId}:cukie:reserve`;
  const releaseKey = `${session.sessionId}:cukie:release`;
  const reason = 'game_economy_released';
  const epochId = ownCukieEpochId({ assetId, ownerNormalized: session.walletNormalized, ownershipEventId });
  const quota = ownCukieQuota('original', 'common');
  const epoch: OwnCukieEpoch = {
    _id: epochId,
    epochId,
    assetId,
    tokenId: '1',
    ownerNormalized: session.walletNormalized,
    ownershipEventId,
    generation: 'original',
    rarity: 'common',
    gamesQuota: quota,
    gamesRemaining: quota,
    status: 'active',
    revision: 2,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
  };
  const lockId = 'lock-own-1';
  const assignment: OwnCukieAssignment = {
    _id: assignmentId,
    assignmentId,
    sessionId: session.sessionId,
    status: 'released',
    epochId,
    assetId,
    tokenId: '1',
    ownerNormalized: session.walletNormalized,
    ownershipEventId,
    generation: 'original',
    rarity: 'common',
    lockId,
    lockFencingToken: 2,
    restoreSoftStake: false,
    idempotencyKey: reserveKey,
    requestHash: session.cukie.reservationRequestHash,
    assignedAt: session.createdAt,
    expiresAt: session.expiresAt,
    revision: 1,
    updatedAt: session.updatedAt,
    terminalAt: session.updatedAt,
    terminalReason: reason,
  };
  const lock: NftAssetLockDocument = {
    _id: lockId,
    lockId,
    assetId,
    ownerNormalized: session.walletNormalized,
    reason: 'game_assignment',
    status: 'released',
    fencingToken: 2,
    createdBy: 'own-cukie-service',
    idempotencyKey: `own-cukie:assign-lock:${reserveKey}`,
    payloadHash: 'a'.repeat(64),
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    releaseReason: reason,
  };
  const lockEvent = buildNftAssetLockEvent({
    operation: 'release',
    idempotencyKey: `own-cukie:terminal-lock:${releaseKey}`,
    payloadHash: buildNftLockPayloadHash('release', {
      lockId,
      expectedFencingToken: 1,
      sessionId: session.sessionId,
      restoreSoftStake: false,
      ownershipEventId,
      reason,
    }),
    previous: { ...lock, status: 'active', fencingToken: 1 },
    resulting: lock,
    actor: 'own-cukie-service',
    reason,
    timestamp: session.updatedAt,
  });
  const releaseRequestHash = stableOwnCukieHash({
    operation: 'release',
    sessionId: session.sessionId,
    assignmentId,
    reservationIdempotencyKey: reserveKey,
    consumeGame: false,
    reason,
  });
  const ownEvent: OwnCukieEvent = {
    _id: stableOwnCukieHash({ kind: 'own-cukie-event', operation: 'release', idempotencyKey: releaseKey, requestHash: releaseRequestHash }),
    eventId: stableOwnCukieHash({ kind: 'own-cukie-event', operation: 'release', idempotencyKey: releaseKey, requestHash: releaseRequestHash }),
    operation: 'release',
    idempotencyKey: releaseKey,
    requestHash: releaseRequestHash,
    sessionId: session.sessionId,
    epochId,
    assignmentId,
    resultingEpoch: epoch,
    resultingAssignment: assignment,
    createdAt: session.updatedAt,
  };
  return { assignment, epoch, lock, lockEvent, ownEvent };
}

function poolReleaseDocuments(session: GameEconomySession) {
  const assignmentId = stableCukiePoolHash({ kind: 'cukie-pool-assignment', sessionId: session.sessionId });
  const reserveKey = `${session.sessionId}:cukie:reserve`;
  const releaseKey = `${session.sessionId}:cukie:release`;
  const reason = 'game_economy_released';
  const requestHash = stableCukiePoolHash({ operation: 'assign', sessionId: session.sessionId, expiresAt: session.expiresAt });
  const terminalRequestHash = stableCukiePoolHash({ operation: 'release', sessionId: session.sessionId, expectedRevision: 0, consumeGame: false, reason });
  const assignment: CukiePoolAssignment = {
    _id: assignmentId,
    assignmentId,
    sessionId: session.sessionId,
    kind: 'seiku',
    status: 'released',
    assetId: deterministicSeikuAssetId(session.sessionId),
    tokenId: null,
    positionId: null,
    ownerNormalized: null,
    generation: 'original',
    rarity: 'common',
    ownerRewardEligible: false,
    lockId: null,
    lockFencingToken: null,
    idempotencyKey: reserveKey,
    requestHash,
    assignedAt: session.createdAt,
    expiresAt: session.expiresAt,
    revision: 1,
    updatedAt: session.updatedAt,
    releasedAt: session.updatedAt,
    releaseReason: reason,
    terminalIdempotencyKey: releaseKey,
    terminalRequestHash,
  };
  const eventId = stableCukiePoolHash({ kind: 'cukie-pool-event', operation: 'release', idempotencyKey: releaseKey, requestHash: terminalRequestHash });
  const poolEvent: CukiePoolEvent = {
    _id: eventId,
    eventId,
    operation: 'release',
    idempotencyKey: releaseKey,
    requestHash: terminalRequestHash,
    positionId: null,
    assignmentId,
    resultingPosition: null,
    resultingAssignment: assignment,
    createdAt: session.updatedAt,
  };
  return { assignment, poolEvent };
}

function inspectInput(session: GameEconomySession, db: Db = databaseFor(session)) {
  return {
    db,
    userId: 'user-1',
    walletNormalized: WALLET.toLowerCase(),
    authorityGameSessionId: 'parent-session-1',
    runId: 'run-1',
    expectedCreateIdempotencyKey: session.createCommand.idempotencyKey,
  };
}

describe('Treasure Hunt economy recovery inspector', () => {
  it('authorizes a deterministic restart when credit failed before Cukie was attempted', async () => {
    const session = await createRejectedSession();
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session));
    expect(decision).toEqual({
      kind: 'restart',
      replacementIdempotencyKey: treasureHuntRecoveryReplacementIdempotencyKey({
        userId: 'user-1',
        walletNormalized: WALLET.toLowerCase(),
        authorityGameSessionId: 'parent-session-1',
        gameEconomySessionId: session.sessionId,
      }),
    });
  });

  it('propagates the real server opening path with the safe restart code', async () => {
    const authorityGameSessionId = 'parent-session-1';
    const runId = `treasure-run-${stableGameEconomyHash({
      authorityGameSessionId,
      walletNormalized: WALLET.toLowerCase(),
    })}`;
    const session = await createRejectedSession(
      treasureHuntEconomyOpenCreateIdempotencyKey(runId),
    );
    const db = databaseFor(session);
    (getEconomyDb as jest.Mock).mockResolvedValue(db);
    (prisma.gameSession.findUnique as jest.Mock).mockResolvedValue({
      sessionId: authorityGameSessionId,
      userId: 'user-1',
      gameId: 'sybil-slayer',
      isActive: true,
    });
    (openGameSession as jest.Mock).mockRejectedValue(new Error('reservation failed'));

    await expect(openTreasureHuntEconomyRun({
      userId: 'user-1',
      walletAddress: WALLET,
      authorityGameSessionId,
      requestId: 'request-12345678',
      now: NOW,
    })).rejects.toMatchObject({
      code: 'CONFLICT',
      details: {
        publicCode: 'GAME_SESSION_RESTART_REQUIRED',
        replacementIdempotencyKey: treasureHuntRecoveryReplacementIdempotencyKey({
          userId: 'user-1',
          walletNormalized: WALLET.toLowerCase(),
          authorityGameSessionId,
          gameEconomySessionId: session.sessionId,
        }),
      },
    });
  });

  it('keeps the recovery pending when credit has an identity but Cukie binding is absent', async () => {
    const session = await createRejectedSession();
    const reservationId = `credit:${'a'.repeat(64)}`;
    const evidenceHash = 'b'.repeat(64);
    session.credit = {
      ...session.credit,
      reservationId,
      evidenceHash,
      reservationResultHash: buildGameResourceReservationResultHash({
        requestHash: session.credit.reservationRequestHash,
        reservationId,
        evidenceHash,
      }),
    };
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session));
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('accepts a released own Cukie only with its epoch, lock and terminal event', async () => {
    const session = await createRejectedSession();
    const documents = ownReleaseDocuments(session);
    const evidence = buildGameOwnCukieAssignmentEvidence(documents.assignment);
    session.cukie = {
      ...session.cukie,
      reservationId: documents.assignment.assignmentId,
      evidenceHash: evidence.evidenceHash,
      reservationResultHash: buildGameResourceReservationResultHash({
        requestHash: session.cukie.reservationRequestHash,
        reservationId: evidence.reservationId,
        evidenceHash: evidence.evidenceHash,
      }),
    };
    const db = databaseFor(session, canonicalEvents(session), {
      game_economy_resource_bindings: [resourceBinding(
        session,
        'cukie',
        evidence.reservationId,
        evidence.evidenceHash,
      )],
      game_owned_cukie_assignments: [documents.assignment],
      game_owned_cukie_epochs: [documents.epoch],
      game_owned_cukie_events: [documents.ownEvent],
      nft_asset_locks: [documents.lock],
      nft_asset_lock_events: [documents.lockEvent],
    });
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, db));
    expect(decision.kind).toBe('restart');
  });

  it('accepts a released pool fallback while rejecting a duplicate own source', async () => {
    const session = await createRejectedSession();
    const documents = poolReleaseDocuments(session);
    const evidence = buildGameCukieAssignmentEvidence(documents.assignment);
    session.cukie = {
      ...session.cukie,
      reservationId: documents.assignment.assignmentId,
      evidenceHash: evidence.evidenceHash,
      reservationResultHash: buildGameResourceReservationResultHash({
        requestHash: session.cukie.reservationRequestHash,
        reservationId: evidence.reservationId,
        evidenceHash: evidence.evidenceHash,
      }),
    };
    const db = databaseFor(session, canonicalEvents(session), {
      game_economy_resource_bindings: [resourceBinding(
        session,
        'cukie',
        evidence.reservationId,
        evidence.evidenceHash,
      )],
      cukie_pool_assignments: [documents.assignment],
      cukie_pool_events: [documents.poolEvent],
    });
    await expect(inspectTreasureHuntEconomyRecovery(inspectInput(session, db))).resolves.toEqual(
      expect.objectContaining({ kind: 'restart' }),
    );

    const own = ownReleaseDocuments(session);
    const duplicateDb = databaseFor(session, canonicalEvents(session), {
      game_economy_resource_bindings: [resourceBinding(
        session,
        'cukie',
        evidence.reservationId,
        evidence.evidenceHash,
      )],
      cukie_pool_assignments: [documents.assignment],
      cukie_pool_events: [documents.poolEvent],
      game_owned_cukie_assignments: [own.assignment],
      game_owned_cukie_epochs: [own.epoch],
      game_owned_cukie_events: [own.ownEvent],
      nft_asset_locks: [own.lock],
      nft_asset_lock_events: [own.lockEvent],
    });
    await expect(inspectTreasureHuntEconomyRecovery(inspectInput(session, duplicateDb))).resolves.toEqual(
      expect.objectContaining({ kind: 'pending' }),
    );
  });

  it('fails closed when the immutable event chain is incomplete', async () => {
    const session = await createRejectedSession();
    const events = canonicalEvents(session).slice(1);
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, databaseFor(session, events)));
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('does not authorize a restart while an economy run already exists', async () => {
    const session = await createRejectedSession();
    const db = databaseFor(session, canonicalEvents(session), {
      treasure_hunt_economy_runs: [{
        authorityGameSessionId: 'parent-session-1',
        gameEconomySessionId: session.sessionId,
      }],
    });
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, db));
    expect(decision).toEqual({ kind: 'pending', reason: 'run_exists' });
  });

  it('fails closed when a released own source remains active', async () => {
    const session = await createRejectedSession();
    const documents = ownReleaseDocuments(session);
    const evidence = buildGameOwnCukieAssignmentEvidence(documents.assignment);
    session.cukie = {
      ...session.cukie,
      reservationId: documents.assignment.assignmentId,
      evidenceHash: evidence.evidenceHash,
      reservationResultHash: buildGameResourceReservationResultHash({
        requestHash: session.cukie.reservationRequestHash,
        reservationId: evidence.reservationId,
        evidenceHash: evidence.evidenceHash,
      }),
    };
    const db = databaseFor(session, canonicalEvents(session), {
      game_economy_resource_bindings: [resourceBinding(
        session,
        'cukie',
        evidence.reservationId,
        evidence.evidenceHash,
      )],
      game_owned_cukie_assignments: [{ ...documents.assignment, status: 'active' }],
      game_owned_cukie_epochs: [documents.epoch],
      game_owned_cukie_events: [documents.ownEvent],
      nft_asset_locks: [documents.lock],
      nft_asset_lock_events: [documents.lockEvent],
    });
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, db));
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('fails closed when the canonical event payload has been altered', async () => {
    const session = await createRejectedSession();
    const events = canonicalEvents(session);
    events[events.length - 1] = { ...events[events.length - 1], payloadHash: '0'.repeat(64) };
    const decision = await inspectTreasureHuntEconomyRecovery(
      inspectInput(session, databaseFor(session, events)),
    );
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('returns not applicable without a server economy session', async () => {
    const session = await createRejectedSession();
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, fakeDb({})));
    expect(decision).toEqual({ kind: 'not_applicable', reason: 'economy_session_not_found' });
  });
});
