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
  buildGameCreditReservationEvidence,
  buildGameCukieAssignmentEvidence,
  buildGameOwnCukieAssignmentEvidence,
} from '@/lib/uki-economy/game-economy/resource-evidence';
import type {
  GameCukieResourcePort,
  GameCreditResourcePort,
  GameEconomyPorts,
} from '@/lib/uki-economy/game-economy/ports';
import { createNftAssetLockService } from '@/lib/nft-inventory/locks';
import type { NftAssetLockRepository } from '@/lib/nft-inventory/lock-repository';
import type { NftAssetLockDocument, NftAssetLockEventDocument } from '@/lib/nft-inventory/lock-types';
import type { NormalizedNftAsset } from '@/lib/nft-inventory';
import {
  createCompetitionCreditService,
  validateReservationIntegrity,
} from '@/lib/uki-economy/credits/service';
import {
  createMemoryCompetitionCreditRunner,
  MemoryCompetitionCreditRepository,
  testCompetitionCreditRule,
} from '@/lib/uki-economy/credits/testing';
import type { CukieMasterSlot } from '@/lib/uki-economy/cukie-master/types';
import { createOwnCukieService } from '@/lib/uki-economy/own-cukie/service';
import type { OwnCukieRepository } from '@/lib/uki-economy/own-cukie/repository';
import { TREASURE_HUNT_ECONOMY_POLICY } from '@/lib/uki-economy/game-economy/treasure-hunt-policy';
import type {
  GameEconomyEvent,
  GameEconomyRule,
  GameEconomySession,
} from '@/lib/uki-economy/game-economy/types';
import {
  ownCukieAssignmentId,
  ownCukieEpochId,
  ownCukieQuota,
  stableOwnCukieHash,
} from '@/lib/uki-economy/own-cukie/rules';
import type { OwnCukieAssignment, OwnCukieAssetSnapshot, OwnCukieEpoch, OwnCukieEvent } from '@/lib/uki-economy/own-cukie/types';
import {
  deterministicSeikuAssetId,
  stableCukiePoolHash,
} from '@/lib/uki-economy/cukie-pool/rules';
import type { CukiePoolAssignment, CukiePoolEvent } from '@/lib/uki-economy/cukie-pool/types';
import {
  buildNftAssetLockEvent,
  buildNftLockPayloadHash,
} from '@/lib/nft-inventory/lock-types';
import { createMemoryCukiePoolHarness } from '@/lib/uki-economy/cukie-pool/testing';
import type { Db } from 'mongodb';
import { buildGameEconomySessionEvent } from '@/lib/uki-economy/game-economy/repository';
import {
  inspectTreasureHuntEconomyRecovery,
  treasureHuntRecoveryReplacementIdempotencyKey,
} from '@/lib/uki-economy/game-economy/treasure-hunt-recovery';
import {
  openTreasureHuntEconomyRun,
  reconcileTreasureHuntEconomyRuns,
  treasureHuntEconomyOpenCreateIdempotencyKey,
} from '@/lib/uki-economy/game-economy/treasure-hunt';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { prisma } from '@/lib/prisma';
import { openGameSession } from '@/lib/uki-economy/game-economy/coordinator';

const WALLET = `0x${'1'.repeat(40)}`;
const OTHER = `0x${'2'.repeat(40)}`;
const NOW = new Date('2026-07-10T12:00:00.000Z');
const CREATE_KEY = 'treasure-create';
const CREDIT_CUTOFF = new Date('2026-07-10T12:00:00.000Z');
const GAME_SESSION_TTL_MS = 10 * 60_000;
const CREDIT_COST_CODE = 'arena:start';
const CREDIT_RULE_VERSION = 'credits-recovery-test-v1';

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
      if ('$gte' in operator) {
        const bound = operator.$gte as Date;
        if (!(actual instanceof Date) || !(bound instanceof Date) || actual.getTime() < bound.getTime()) return false;
        continue;
      }
      if ('$lte' in operator) {
        const bound = operator.$lte as Date;
        if (!(actual instanceof Date) || !(bound instanceof Date) || actual.getTime() > bound.getTime()) return false;
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
        sort(specification: Record<string, 1 | -1>) {
          const fields = Object.entries(specification);
          selected.sort((left, right) => {
            for (const [field, direction] of fields) {
              const leftValue = valueAt(left, field);
              const rightValue = valueAt(right, field);
              if (leftValue instanceof Date && rightValue instanceof Date) {
                if (leftValue.getTime() !== rightValue.getTime()) {
                  return (leftValue.getTime() - rightValue.getTime()) * direction;
                }
              } else if (leftValue !== rightValue) {
                return (String(leftValue) < String(rightValue) ? -1 : 1) * direction;
              }
            }
            return 0;
          });
          return cursor;
        },
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

function treasureRule(
  credit: Partial<GameEconomyRule['credit']> = {},
  overrides: Partial<GameEconomyRule> = {},
) {
  const defaultCredit = testGameEconomyRule().credit;
  return testGameEconomyRule({
    _id: `treasure-hunt:${TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion}`,
    gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
    version: TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
    credit: { ...defaultCredit, ...credit },
    cukie: {
      required: true,
      consumeOnSettle: false,
      minAssets: 0,
      maxAssets: 0,
      role: 'own_or_pool',
      selectionPolicy: 'owned_bsc_quota_then_pool_v1',
    },
    ...overrides,
  });
}

async function createRejectedSessionWithPorts(input: {
  createKey: string;
  gameRule: GameEconomyRule;
  ports: GameEconomyPorts;
  expectedRuleVersion?: string;
}) {
  const repository = new MemoryGameEconomyRepository({ rules: [input.gameRule] });
  const gameEvents: GameEconomyEvent[] = [];
  const insertSession = repository.insertSession.bind(repository);
  repository.insertSession = async (session) => {
    await insertSession(session);
    gameEvents.push(buildGameEconomySessionEvent(null, session));
  };
  const replaceSession = repository.replaceSession.bind(repository);
  repository.replaceSession = async (previous, next) => {
    const replaced = await replaceSession(previous, next);
    if (replaced) gameEvents.push(buildGameEconomySessionEvent(previous, replaced));
    return replaced;
  };
  const service = createGameEconomyService(
    createMemoryGameEconomyRunner(repository),
    input.ports,
  );
  await expect(service.createSession({
    walletAddress: WALLET,
    gameId: TREASURE_HUNT_ECONOMY_POLICY.gameId,
    cukieAssetIds: [],
    expectedRuleVersion: input.expectedRuleVersion ?? TREASURE_HUNT_ECONOMY_POLICY.gameRuleVersion,
    idempotencyKey: input.createKey,
    now: NOW,
  })).rejects.toThrow();
  const session = repository.state.sessions[0]!;
  recordedGameEvents.set(session.sessionId, gameEvents);
  return session;
}

async function createRejectedSession(createKey = CREATE_KEY): Promise<GameEconomySession> {
  const ports = createMemoryGameEconomyPorts();
  ports.resources.fail('credit', 'reserve');
  return createRejectedSessionWithPorts({
    createKey,
    gameRule: treasureRule(),
    ports,
  });
}

function recoveryCreditSlot(walletAddress = WALLET): CukieMasterSlot {
  const sourceBlockTimestamp = new Date(CREDIT_CUTOFF.getTime() - 60_000);
  return {
    _id: 'recovery-credit-slot-1',
    walletAddress,
    walletNormalized: walletAddress.toLowerCase(),
    route: 'uki',
    ordinal: 1,
    eligibilityEpoch: 1,
    status: 'active',
    qualifiedSince: new Date(CREDIT_CUTOFF.getTime() - 2 * 60_000),
    creditEligibleFrom: new Date(CREDIT_CUTOFF.getTime() - 60_000),
    roundId: 'recovery-credit-round',
    ruleVersion: 'cukie-master-v1',
    sourceHash: 'a'.repeat(64),
    sourceBlockNumber: 100,
    sourceBlockHash: `0x${'b'.repeat(64)}`,
    sourceBlockTimestamp,
    revision: 1,
    createdAt: sourceBlockTimestamp,
    updatedAt: CREDIT_CUTOFF,
  };
}

async function openRecoveryCreditRun(
  service: ReturnType<typeof createCompetitionCreditService>,
) {
  await service.refreshSourceWatermark({
    route: 'uki',
    expectedRuleVersion: CREDIT_RULE_VERSION,
    now: CREDIT_CUTOFF,
  });
  const run = await service.createDailyRun({
    route: 'uki',
    cutoff: CREDIT_CUTOFF,
    expectedRuleVersion: CREDIT_RULE_VERSION,
    now: new Date(CREDIT_CUTOFF.getTime() + 1_000),
  });
  const claimed = await service.claimRun({
    runId: run.runId,
    workerId: 'recovery-test-worker',
    now: new Date(CREDIT_CUTOFF.getTime() + 2_000),
  });
  await service.processRunBatch({
    runId: run.runId,
    workerId: 'recovery-test-worker',
    fenceToken: claimed.fenceToken,
    now: new Date(CREDIT_CUTOFF.getTime() + 3_000),
  });
  const opened = await service.openRun({
    runId: run.runId,
    workerId: 'recovery-test-worker',
    fenceToken: claimed.fenceToken,
    now: new Date(CREDIT_CUTOFF.getTime() + 4_000),
  });
  expect(opened.run.status).toBe('open');
  return opened.run;
}

function recoveryCreditPort(
  service: ReturnType<typeof createCompetitionCreditService>,
): GameCreditResourcePort {
  return {
    async reserve(input) {
      const reservation = await service.reserve({
        walletAddress: input.walletNormalized,
        sessionId: input.sessionId,
        costCode: input.costCode,
        expectedRuleVersion: input.creditRuleVersion,
        expectedRuleConfigHash: input.creditRuleConfigHash,
        idempotencyKey: input.idempotencyKey,
        expiresAtCap: input.expiresAt,
        now: new Date(input.expiresAt.getTime() - GAME_SESSION_TTL_MS),
      });
      return buildGameCreditReservationEvidence(validateReservationIntegrity(reservation));
    },
    async consume(input) {
      if (!input.reservationId) throw new Error('credit reservation is required');
      const reservation = await service.consumeReservation({
        reservationId: input.reservationId,
        idempotencyKey: input.idempotencyKey,
        committedAt: input.committedAt,
        now: input.now,
      });
      return {
        outcome: 'consumed' as const,
        reservation: buildGameCreditReservationEvidence(validateReservationIntegrity(reservation)),
      };
    },
    async release(input) {
      if (!input.reservationId) return { outcome: 'released' as const, reservation: null };
      const reservation = await service.releaseReservation({
        reservationId: input.reservationId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });
      return {
        outcome: 'released' as const,
        reservation: buildGameCreditReservationEvidence(validateReservationIntegrity(reservation)),
      };
    },
  };
}

type OwnRecoveryMemoryState = {
  assets: Map<string, OwnCukieAssetSnapshot>;
  epochs: Map<string, OwnCukieEpoch>;
  assignments: Map<string, OwnCukieAssignment>;
  events: Map<string, OwnCukieEvent>;
  locks: Map<string, NftAssetLockDocument>;
  lockEvents: Map<string, NftAssetLockEventDocument>;
};

function ownRecoveryAsset(): OwnCukieAssetSnapshot {
  return {
    assetId: 'cukies:own-recovery-1',
    tokenId: '1',
    network: 'bsc',
    ownerWallet: WALLET,
    ownerNormalized: WALLET.toLowerCase(),
    rarity: 'common',
    generation: 'original',
    canonicalState: 'available',
    blockers: [],
    activeLocks: [],
    sourceRefs: [],
    ownershipEventId: 'ownership:own-recovery-1',
  };
}

function ownAssetWithLocks(
  state: OwnRecoveryMemoryState,
  asset: OwnCukieAssetSnapshot,
  now: Date,
) {
  const locks = [...state.locks.values()].filter((lock) => (
    lock.assetId === asset.assetId
    && lock.status === 'active'
    && (!lock.expiresAt || lock.expiresAt.getTime() > now.getTime())
  ));
  const canonicalState = locks.some((lock) => lock.reason === 'game_assignment')
    ? 'assigned_to_game' as const
    : locks.some((lock) => lock.reason === 'soft_stake')
      ? 'soft_staked' as const
      : 'available' as const;
  return {
    ...clone(asset),
    canonicalState,
    activeLocks: locks.map((lock) => ({
      lockId: lock.lockId,
      assetId: lock.assetId,
      ownerNormalized: lock.ownerNormalized,
      reason: lock.reason,
      state: lock.reason === 'game_assignment'
        ? 'assigned_to_game' as const
        : lock.reason === 'soft_stake'
          ? 'soft_staked' as const
          : 'unknown' as const,
      ...(lock.retainsSoftStakeEntitlement ? { retainsSoftStakeEntitlement: true as const } : {}),
    })),
  } satisfies OwnCukieAssetSnapshot;
}

function createMemoryOwnCukieHarness() {
  const state: OwnRecoveryMemoryState = {
    assets: new Map([[ownRecoveryAsset().assetId, ownRecoveryAsset()]]),
    epochs: new Map(),
    assignments: new Map(),
    events: new Map(),
    locks: new Map(),
    lockEvents: new Map(),
  };
  const lockRepository: NftAssetLockRepository = {
    findLockById: async (lockId) => {
      const lock = state.locks.get(lockId);
      return lock ? clone(lock) : null;
    },
    findLockByIdempotencyKey: async (idempotencyKey) => {
      const lock = [...state.locks.values()].find((candidate) => candidate.idempotencyKey === idempotencyKey);
      return lock ? clone(lock) : null;
    },
    findEventByIdempotencyKey: async (idempotencyKey) => {
      const event = [...state.lockEvents.values()].find((candidate) => candidate.idempotencyKey === idempotencyKey);
      return event ? clone(event) : null;
    },
    findActiveLockByAssetId: async (assetId) => {
      const lock = [...state.locks.values()].find((candidate) => (
        candidate.assetId === assetId && candidate.status === 'active'
      ));
      return lock ? clone(lock) : null;
    },
    findExpiredActiveLocks: async (now, limit, excludeReasons = []) => [...state.locks.values()]
      .filter((lock) => (
        lock.status === 'active'
        && Boolean(lock.expiresAt)
        && lock.expiresAt!.getTime() <= now.getTime()
        && !excludeReasons.includes(lock.reason)
      ))
      .slice(0, limit)
      .map((lock) => clone(lock)),
    insertLock: async (lock) => {
      state.locks.set(lock.lockId, clone(lock));
    },
    compareAndSetActiveLock: async (lockId, expectedFencingToken, replacement, options) => {
      const current = state.locks.get(lockId);
      if (
        !current
        || current.status !== 'active'
        || current.fencingToken !== expectedFencingToken
        || (
          options?.expiresAtLte
          && (!current.expiresAt || current.expiresAt.getTime() > options.expiresAtLte.getTime())
        )
        || (
          options?.notExpiredAt
          && current.expiresAt
          && current.expiresAt.getTime() <= options.notExpiredAt.getTime()
        )
      ) return null;
      state.locks.set(lockId, clone(replacement));
      return clone(replacement);
    },
    insertEvent: async (event) => {
      state.lockEvents.set(event.eventId, clone(event));
    },
    enqueueRecalculation: async () => {},
  };
  const repository: OwnCukieRepository = {
    listWalletAssets: async (ownerNormalized, now) => [...state.assets.values()]
      .filter((asset) => asset.ownerNormalized === ownerNormalized)
      .map((asset) => ownAssetWithLocks(state, asset, now)),
    findAsset: async (assetId, now) => {
      const asset = state.assets.get(assetId);
      return asset ? ownAssetWithLocks(state, asset, now) : null;
    },
    findEpoch: async (epochId) => {
      const epoch = state.epochs.get(epochId);
      return epoch ? clone(epoch) : null;
    },
    insertEpoch: async (epoch) => {
      state.epochs.set(epoch.epochId, clone(epoch));
    },
    compareAndSetEpoch: async (current, replacement) => {
      const stored = state.epochs.get(current.epochId);
      if (
        !stored
        || stored.revision !== current.revision
        || stored.status !== current.status
        || stored.gamesRemaining !== current.gamesRemaining
        || stored.assignmentSessionId !== current.assignmentSessionId
        || stored.assignmentExpiresAt?.getTime() !== current.assignmentExpiresAt?.getTime()
      ) return null;
      state.epochs.set(replacement.epochId, clone(replacement));
      return clone(replacement);
    },
    findAssignmentById: async (assignmentId) => {
      const assignment = state.assignments.get(assignmentId);
      return assignment ? clone(assignment) : null;
    },
    findAssignmentBySessionId: async (sessionId) => {
      const assignment = [...state.assignments.values()].find((candidate) => candidate.sessionId === sessionId);
      return assignment ? clone(assignment) : null;
    },
    findAssignmentByIdempotencyKey: async (idempotencyKey) => {
      const assignment = [...state.assignments.values()].find((candidate) => candidate.idempotencyKey === idempotencyKey);
      return assignment ? clone(assignment) : null;
    },
    insertAssignment: async (assignment) => {
      state.assignments.set(assignment.assignmentId, clone(assignment));
    },
    compareAndSetAssignment: async (current, replacement) => {
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
    findEventByIdempotencyKey: async (idempotencyKey) => {
      const event = [...state.events.values()].find((candidate) => candidate.idempotencyKey === idempotencyKey);
      return event ? clone(event) : null;
    },
    insertEvent: async (event) => {
      state.events.set(event.eventId, clone(event));
    },
  };
  const lockService = createNftAssetLockService(async (work) => work(lockRepository));
  const service = createOwnCukieService(async (work) => work({
    repository,
    lockService,
    lockRepository,
  }));
  return { state, service };
}

function actualOwnCukiePort(harness: ReturnType<typeof createMemoryOwnCukieHarness>): GameCukieResourcePort {
  const finish = async (input: Parameters<NonNullable<GameCukieResourcePort['release']>>[0], consumeGame: boolean) => {
    const assignment = await harness.service.finish({
      sessionId: input.sessionId,
      assignmentId: input.reservationId ?? undefined,
      reservationIdempotencyKey: input.reservationIdempotencyKey,
      idempotencyKey: input.idempotencyKey,
      consumeGame,
      reason: `game_economy_${consumeGame ? 'consumed' : 'released'}`,
      now: input.now,
    });
    return {
      outcome: consumeGame ? 'consumed' as const : 'released' as const,
      reservation: buildGameOwnCukieAssignmentEvidence(assignment),
    };
  };
  return {
    reserve: async (input) => {
      const assignment = await harness.service.reserve({
        sessionId: input.sessionId,
        walletAddress: input.walletNormalized,
        selectionPolicy: 'owned_bsc_quota_then_pool_v1',
        idempotencyKey: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
        now: new Date(input.expiresAt.getTime() - GAME_SESSION_TTL_MS),
      });
      if (!assignment) throw new Error('No existe un Cukie propio elegible.');
      throw new Error('Respuesta de reserva Cukie propia perdida.');
    },
    consume: (input) => finish(input, true),
    release: (input) => finish(input, false),
  };
}

function recoveryPoolAsset(): NormalizedNftAsset {
  return {
    assetId: 'cukies:pool-recovery-1',
    tokenId: '2',
    network: 'bsc',
    ownerWallet: WALLET,
    ownerNormalized: WALLET.toLowerCase(),
    rarity: 'common',
    generation: 'original',
    canonicalState: 'available',
    blockers: [],
    activeLocks: [],
    sourceRefs: [],
  };
}

function actualPoolCukiePort(harness: ReturnType<typeof createMemoryCukiePoolHarness>): GameCukieResourcePort {
  const finish = async (input: Parameters<NonNullable<GameCukieResourcePort['release']>>[0], consumeGame: boolean) => {
    const assignment = await harness.service.releaseCukiePoolAssignment({
      sessionId: input.sessionId,
      expectedRevision: 0,
      consumeGame,
      reason: `game_economy_${consumeGame ? 'consumed' : 'released'}`,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
    });
    return {
      outcome: consumeGame ? 'consumed' as const : 'released' as const,
      reservation: buildGameCukieAssignmentEvidence(assignment),
    };
  };
  return {
    reserve: async (input) => {
      const assignment = await harness.service.assignCukiePoolSession({
        sessionId: input.sessionId,
        expiresAt: input.expiresAt,
        idempotencyKey: input.idempotencyKey,
        now: new Date(input.expiresAt.getTime() - GAME_SESSION_TTL_MS),
      });
      if (!assignment) throw new Error('No existe una asignacion de pool elegible.');
      throw new Error('Respuesta de reserva de pool perdida.');
    },
    consume: (input) => finish(input, true),
    release: (input) => finish(input, false),
  };
}

async function createRejectedSessionWithDurableCredit(
  cukiePort?: GameCukieResourcePort,
  createKey = 'treasure-durable-credit',
  creditOptions: { slotWallet?: string; poolCreditsPerSlot?: number } = {},
) {
  const creditRule = testCompetitionCreditRule({
    _id: `competition-credits:${CREDIT_RULE_VERSION}`,
    version: CREDIT_RULE_VERSION,
    costs: [{ costCode: CREDIT_COST_CODE, credits: 10, active: true }],
  });
  const creditSlot = recoveryCreditSlot(creditOptions.slotWallet ?? WALLET);
  const creditRepository = new MemoryCompetitionCreditRepository({
    rule: creditRule,
    slots: [creditSlot],
  });
  const creditService = createCompetitionCreditService(
    createMemoryCompetitionCreditRunner(creditRepository),
  );
  if (creditOptions.poolCreditsPerSlot !== undefined) {
    await creditService.configurePool({
      walletAddress: creditSlot.walletAddress,
      slotId: creditSlot._id,
      poolCreditsPerSlot: creditOptions.poolCreditsPerSlot,
      idempotencyKey: `${createKey}:pool-config`,
      now: new Date(CREDIT_CUTOFF.getTime() - 10 * 60_000),
    });
  }
  await openRecoveryCreditRun(creditService);
  const ports = createMemoryGameEconomyPorts();
  ports.credits = recoveryCreditPort(creditService);
  if (cukiePort) ports.cukies = cukiePort;
  else ports.cukies.reserve = async () => {
    throw new Error('Cukie reservation response lost');
  };
  const session = await createRejectedSessionWithPorts({
    createKey,
    gameRule: treasureRule({
      costCode: CREDIT_COST_CODE,
      creditRuleVersion: creditRule.version,
      creditRuleConfigHash: creditRule.configHash,
    }),
    ports,
  });
  return { session, creditRepository, creditService };
}

function durableCreditDocuments(
  session: GameEconomySession,
  creditRepository: MemoryCompetitionCreditRepository,
) {
  const reservation = creditRepository.state.reservations.find(
    (candidate) => candidate.sessionId === session.sessionId,
  );
  if (!reservation) throw new Error('No se creo la reserva durable de credito.');
  const evidence = buildGameCreditReservationEvidence(
    validateReservationIntegrity(reservation),
  );
  return {
    game_economy_resource_bindings: [resourceBinding(
      session,
      'credit',
      evidence.reservationId,
      evidence.evidenceHash,
    )],
    competition_credit_reservations: creditRepository.state.reservations,
    competition_credit_ledger: creditRepository.state.ledger,
    competition_credit_lots: creditRepository.state.ownLots,
    competition_credit_pool_lots: creditRepository.state.poolLots,
  } satisfies Record<string, Doc[]>;
}

function actualOwnDocuments(
  harness: ReturnType<typeof createMemoryOwnCukieHarness>,
) {
  return {
    game_owned_cukie_assignments: [...harness.state.assignments.values()],
    game_owned_cukie_epochs: [...harness.state.epochs.values()],
    game_owned_cukie_events: [...harness.state.events.values()],
    nft_asset_locks: [...harness.state.locks.values()],
    nft_asset_lock_events: [...harness.state.lockEvents.values()],
  } satisfies Record<string, Doc[]>;
}

function actualPoolDocuments(
  harness: ReturnType<typeof createMemoryCukiePoolHarness>,
) {
  return {
    cukie_pool_assignments: [...harness.state.assignments.values()],
    cukie_pool_positions: [...harness.state.positions.values()],
    cukie_pool_events: [...harness.state.events.values()],
    nft_asset_locks: [...harness.state.locks.values()],
    nft_asset_lock_events: [...harness.state.lockEvents.values()],
  } satisfies Record<string, Doc[]>;
}

async function createRejectedSessionWithActualOwnCukie() {
  const harness = createMemoryOwnCukieHarness();
  const result = await createRejectedSessionWithDurableCredit(
    actualOwnCukiePort(harness),
    'treasure-durable-own-cukie',
  );
  return { ...result, harness };
}

async function assertActualCukieRecovery(source: 'own' | 'pool') {
  if (source === 'own') {
    const { session, creditRepository, harness } = await createRejectedSessionWithActualOwnCukie();
    expect(session.cukie.reservationId).toBeTruthy();
    const decision = await inspectTreasureHuntEconomyRecovery(
      inspectInput(session, databaseFor(session, undefined, {
        ...durableCreditDocuments(session, creditRepository),
        game_economy_resource_bindings: [
          resourceBinding(session, 'credit', session.credit.reservationId!, session.credit.evidenceHash!),
          resourceBinding(session, 'cukie', session.cukie.reservationId!, session.cukie.evidenceHash!),
        ],
        ...actualOwnDocuments(harness),
      })),
    );
    expect(decision.kind).toBe('restart');
    expect([...harness.state.assignments.values()]).toEqual([
      expect.objectContaining({ status: 'released', terminalReason: 'game_economy_released' }),
    ]);
    expect([...harness.state.events.values()]).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'assign' }),
      expect.objectContaining({ operation: 'release' }),
    ]));
    return;
  }

  const { session, creditRepository, harness } = await createRejectedSessionWithActualPoolCukie();
  expect(session.cukie.reservationId).toBeTruthy();
  const decision = await inspectTreasureHuntEconomyRecovery(
    inspectInput(session, databaseFor(session, undefined, {
      ...durableCreditDocuments(session, creditRepository),
      game_economy_resource_bindings: [
        resourceBinding(session, 'credit', session.credit.reservationId!, session.credit.evidenceHash!),
        resourceBinding(session, 'cukie', session.cukie.reservationId!, session.cukie.evidenceHash!),
      ],
      ...actualPoolDocuments(harness),
    })),
  );
  expect(decision.kind).toBe('restart');
  expect([...harness.state.assignments.values()]).toEqual([
    expect.objectContaining({ status: 'released', releaseReason: 'game_economy_released' }),
  ]);
  expect([...harness.state.events.values()]).toEqual(expect.arrayContaining([
    expect.objectContaining({ operation: 'assign' }),
    expect.objectContaining({ operation: 'release' }),
  ]));
}

async function createRejectedSessionWithActualPoolCukie() {
  const harness = createMemoryCukiePoolHarness([recoveryPoolAsset()]);
  await harness.service.depositCukiePoolPosition({
    walletAddress: WALLET,
    assetId: 'cukies:pool-recovery-1',
    idempotencyKey: 'pool-deposit-recovery',
    now: NOW,
  });
  const result = await createRejectedSessionWithDurableCredit(
    actualPoolCukiePort(harness),
    'treasure-durable-pool-cukie',
  );
  return { ...result, harness };
}

const recordedGameEvents = new Map<string, GameEconomyEvent[]>();

function recordedEventsFor(session: GameEconomySession) {
  return (recordedGameEvents.get(session.sessionId) ?? []).map((event) => clone(event));
}

function databaseFor(
  session: GameEconomySession,
  gameEvents = recordedEventsFor(session),
  extras: Record<string, Doc[]> = {},
) {
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

  it.each([1, 2])('keeps recovery pending when %s orphan own epochs point at the session', async (epochCount) => {
    const session = await createRejectedSession();
    const first = ownReleaseDocuments(session).epoch;
    const epochs = [
      {
        ...first,
        assignmentSessionId: session.sessionId,
        assignmentExpiresAt: session.expiresAt,
      },
    ];
    if (epochCount === 2) {
      epochs.push({
        ...first,
        _id: `${first._id}-orphan-2`,
        epochId: `${first.epochId}-orphan-2`,
        assetId: 'asset-orphan-2',
        ownershipEventId: 'ownership-orphan-2',
        assignmentSessionId: session.sessionId,
        assignmentExpiresAt: session.expiresAt,
      });
    }
    const db = databaseFor(session, undefined, {
      game_owned_cukie_epochs: epochs,
    });
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, db));
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('authorizes first-resource compensation from a real credit reservation and ledger', async () => {
    const { session, creditRepository } = await createRejectedSessionWithDurableCredit();
    const reservation = creditRepository.state.reservations.find(
      (candidate) => candidate.sessionId === session.sessionId,
    );
    expect(reservation).toMatchObject({ status: 'released', sessionId: session.sessionId });
    const evidence = buildGameCreditReservationEvidence(
      validateReservationIntegrity(reservation!),
    );
    const db = databaseFor(session, undefined, {
      game_economy_resource_bindings: [resourceBinding(
        session,
        'credit',
        evidence.reservationId,
        evidence.evidenceHash,
      )],
      competition_credit_reservations: creditRepository.state.reservations,
      competition_credit_ledger: creditRepository.state.ledger,
      competition_credit_lots: creditRepository.state.ownLots,
      competition_credit_pool_lots: creditRepository.state.poolLots,
    });
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, db));
    expect(decision.kind).toBe('restart');
    expect(session.cukie.reservationId).toBeNull();
  });

  it('accepts a canonically compensated own Cukie reservation', async () => {
    await assertActualCukieRecovery('own');
  });

  it('accepts a canonically compensated pool Cukie reservation', async () => {
    await assertActualCukieRecovery('pool');
  });

  it('allows an active reservation from another player sharing the released pool lot', async () => {
    const { session, creditRepository, creditService } = await createRejectedSessionWithDurableCredit(
      undefined,
      'treasure-shared-pool-credit',
      { slotWallet: OTHER, poolCreditsPerSlot: 100 },
    );
    const creditRule = creditRepository.state.rules[0];
    const other = await creditService.reserve({
      walletAddress: OTHER,
      sessionId: 'other-player-active-session',
      costCode: CREDIT_COST_CODE,
      expectedRuleVersion: CREDIT_RULE_VERSION,
      expectedRuleConfigHash: creditRule.configHash,
      idempotencyKey: 'other-player-active-credit',
      expiresAtCap: new Date(NOW.getTime() + GAME_SESSION_TTL_MS),
      now: NOW,
    });
    expect(other.status).toBe('active');
    const target = creditRepository.state.reservations.find(
      (candidate) => candidate.sessionId === session.sessionId,
    )!;
    expect(target.bucket).toBe('pool');
    expect(other.allocations.map((allocation) => allocation.lotId)).toEqual(
      expect.arrayContaining(target.allocations.map((allocation) => allocation.lotId)),
    );
    const creditDocuments = durableCreditDocuments(session, creditRepository);
    const decision = await inspectTreasureHuntEconomyRecovery(
      inspectInput(session, databaseFor(session, undefined, {
        ...creditDocuments,
        competition_credit_reservations: [
          ...creditRepository.state.reservations,
          other,
        ],
      })),
    );
    expect(decision.kind).toBe('restart');
  });

  it('blocks recovery when the player still has an active reservation on the released lot', async () => {
    const { session, creditRepository } = await createRejectedSessionWithDurableCredit();
    const target = creditRepository.state.reservations.find(
      (candidate) => candidate.sessionId === session.sessionId,
    )!;
    const active = {
      ...target,
      status: 'active' as const,
      revision: 0,
      updatedAt: new Date(target.createdAt),
    };
    delete active.terminalAt;
    delete active.terminalCommittedAt;
    delete active.terminalIdempotencyKey;
    delete active.terminalPayloadHash;
    const creditDocuments = durableCreditDocuments(session, creditRepository);
    const decision = await inspectTreasureHuntEconomyRecovery(
      inspectInput(session, databaseFor(session, undefined, {
        ...creditDocuments,
        competition_credit_reservations: [
          ...creditRepository.state.reservations,
          active,
        ],
      })),
    );
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('keeps recovery pending when a durable terminal receipt is only partially present', async () => {
    const creditScenario = await createRejectedSessionWithDurableCredit();
    const creditDocuments = durableCreditDocuments(
      creditScenario.session,
      creditScenario.creditRepository,
    );
    const creditReservation = creditScenario.creditRepository.state.reservations.find(
      (candidate) => candidate.sessionId === creditScenario.session.sessionId,
    )!;
    const partialCreditDecision = await inspectTreasureHuntEconomyRecovery(
      inspectInput(creditScenario.session, databaseFor(creditScenario.session, undefined, {
        ...creditDocuments,
        competition_credit_ledger: creditScenario.creditRepository.state.ledger.filter(
          (entry) => !(entry.reservationId === creditReservation.reservationId && entry.operation === 'release'),
        ),
      })),
    );
    expect(partialCreditDecision).toEqual({
      kind: 'pending',
      reason: 'underlying_compensation_unproven',
    });

    const ownScenario = await createRejectedSessionWithActualOwnCukie();
    const ownDocuments = actualOwnDocuments(ownScenario.harness);
    ownDocuments.game_owned_cukie_events = ownDocuments.game_owned_cukie_events.filter(
      (event) => (event as OwnCukieEvent).operation !== 'release',
    );
    const partialOwnDecision = await inspectTreasureHuntEconomyRecovery(
      inspectInput(ownScenario.session, databaseFor(ownScenario.session, undefined, {
        ...durableCreditDocuments(ownScenario.session, ownScenario.creditRepository),
        game_economy_resource_bindings: [
          resourceBinding(
            ownScenario.session,
            'credit',
            ownScenario.session.credit.reservationId!,
            ownScenario.session.credit.evidenceHash!,
          ),
          resourceBinding(
            ownScenario.session,
            'cukie',
            ownScenario.session.cukie.reservationId!,
            ownScenario.session.cukie.evidenceHash!,
          ),
        ],
        ...ownDocuments,
      })),
    );
    expect(partialOwnDecision).toEqual({
      kind: 'pending',
      reason: 'underlying_compensation_unproven',
    });
  });

  it('rejects recovery for a different wallet authority', async () => {
    const session = await createRejectedSession();
    const decision = await inspectTreasureHuntEconomyRecovery({
      ...inspectInput(session),
      walletNormalized: OTHER.toLowerCase(),
    });
    expect(decision).toEqual({ kind: 'pending', reason: 'session_authority_mismatch' });
  });

  it('keeps recovery pending when the session policy is stale', async () => {
    const staleRule = treasureRule({}, { version: 'treasure-hunt-stale-policy' });
    const session = await createRejectedSessionWithPorts({
      createKey: 'treasure-stale-policy',
      gameRule: staleRule,
      expectedRuleVersion: staleRule.version,
      ports: (() => {
        const ports = createMemoryGameEconomyPorts();
        ports.resources.fail('credit', 'reserve');
        return ports;
      })(),
    });
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session));
    expect(decision).toEqual({ kind: 'pending', reason: 'session_not_pre_run_compensated' });
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
    const db = databaseFor(session, undefined, {
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
    const db = databaseFor(session, undefined, {
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
    const duplicateDb = databaseFor(session, undefined, {
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
    const events = recordedEventsFor(session).slice(1);
    const decision = await inspectTreasureHuntEconomyRecovery(inspectInput(session, databaseFor(session, events)));
    expect(decision).toEqual({ kind: 'pending', reason: 'underlying_compensation_unproven' });
  });

  it('does not authorize a restart while an economy run already exists', async () => {
    const session = await createRejectedSession();
    const db = databaseFor(session, undefined, {
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
    const db = databaseFor(session, undefined, {
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
    const events = recordedEventsFor(session);
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

  it('no reconcilia runs reservados antes de la frontera forward', async () => {
    const activationAt = new Date('2026-08-20T16:00:00.000Z');
    const db = fakeDb({
      treasure_hunt_economy_runs: [
        {
          _id: 'run-before',
          runId: 'run-before',
          status: 'active',
          reservedAt: new Date('2026-08-20T15:59:59.999Z'),
          updatedAt: new Date('2026-08-20T15:59:59.999Z'),
          gameEconomySessionId: 'session-before',
        },
        {
          _id: 'run-after',
          runId: 'run-after',
          status: 'active',
          reservedAt: new Date('2026-08-20T16:00:00.000Z'),
          updatedAt: new Date('2026-08-20T16:00:00.000Z'),
          gameEconomySessionId: 'session-after',
        },
      ],
      game_economy_sessions: [],
    });
    (getEconomyDb as jest.Mock).mockResolvedValue(db);
    await expect(reconcileTreasureHuntEconomyRuns({
      now: new Date('2026-08-20T16:05:00.000Z'),
      forwardActivationAt: activationAt,
      limit: 10,
    })).resolves.toMatchObject({
      scanned: 1,
      pending: 0,
      failures: [{ runId: 'run-after' }],
    });
  });
});
