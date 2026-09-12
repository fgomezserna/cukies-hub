jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { gameSession: { findUnique: jest.fn() } },
}));
jest.mock('@/lib/uki-economy/game-economy/coordinator', () => ({
  completeGameSession: jest.fn(),
  openGameSession: jest.fn(),
  rejectGameSession: jest.fn(),
}));
jest.mock('@/lib/uki-economy/game-economy/resource-ports', () => ({
  createMongoGameEconomyPorts: jest.fn(() => ({})),
}));
jest.mock('@/lib/uki-economy/game-economy/service', () => ({
  createMongoGameEconomyService: jest.fn(() => ({})),
}));
jest.mock('@/lib/uki-economy/rewards/accounting-repository', () => ({
  rewardAccountingService: { recordWeeklyGameSource: jest.fn() },
}));
jest.mock('@/lib/uki-economy/rewards/arena-ranking', () => ({
  resolveAppliedArenaRanking: jest.fn(),
}));

import { getEconomyDb, withEconomyTransaction } from '@/lib/indexer-db/mongodb';
import { prisma } from '@/lib/prisma';
import { completeGameSession } from '@/lib/uki-economy/game-economy/coordinator';
import { rewardAccountingService } from '@/lib/uki-economy/rewards/accounting-repository';
import { resolveAppliedArenaRanking } from '@/lib/uki-economy/rewards/arena-ranking';
import {
  DomainConflictError,
} from '@/lib/uki-economy/errors';
import type {
  TreasureHuntEconomyRun,
  TreasureHuntWeeklyBest,
} from '@/lib/uki-economy/game-economy/treasure-hunt-types';
import type { GameEconomySession } from '@/lib/uki-economy/game-economy/types';
import type { WeeklyGameSource } from '@/lib/uki-economy/rewards/accounting-types';
import {
  finishTreasureHuntEconomyRun,
} from '@/lib/uki-economy/game-economy/treasure-hunt';

const mockGetEconomyDb = getEconomyDb as jest.MockedFunction<typeof getEconomyDb>;
const mockWithEconomyTransaction = withEconomyTransaction as jest.MockedFunction<typeof withEconomyTransaction>;
const mockPrisma = prisma.gameSession.findUnique as jest.MockedFunction<typeof prisma.gameSession.findUnique>;
const mockComplete = completeGameSession as jest.MockedFunction<typeof completeGameSession>;
const mockRecordWeeklySource = rewardAccountingService.recordWeeklyGameSource as jest.MockedFunction<typeof rewardAccountingService.recordWeeklyGameSource>;
const mockArenaRanking = resolveAppliedArenaRanking as jest.MockedFunction<typeof resolveAppliedArenaRanking>;

const WALLET = `0x${'1'.repeat(40)}`;
const OTHER_WALLET = `0x${'2'.repeat(40)}`;
const NOW = new Date('2026-09-12T13:00:00.000Z');

type AnyDocument = Record<string, any>;

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as AnyDocument).map(([key, child]) => [key, clone(child)]),
    ) as T;
  }
  return value;
}

function equalValue(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matches(document: AnyDocument, filter: AnyDocument): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') {
      return Array.isArray(expected) && expected.some((candidate) => matches(document, candidate));
    }
    const actual = document[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      if ('$in' in expected) return expected.$in.includes(actual);
      if ('$exists' in expected) return Boolean(expected.$exists) === (actual !== undefined);
    }
    return equalValue(actual, expected);
  });
}

function applyUpdate(document: AnyDocument, update: AnyDocument) {
  for (const [key, value] of Object.entries(update.$set ?? {})) document[key] = clone(value);
  for (const [key, value] of Object.entries(update.$inc ?? {})) document[key] = (document[key] ?? 0) + value;
  for (const [key, value] of Object.entries(update.$push ?? {})) {
    document[key] = [...(document[key] ?? []), clone(value)];
  }
}

function makeHarness() {
  const run = {
    _id: 'treasure-run-1',
    runId: 'treasure-run-1',
    gameEconomySessionId: 'economy-session-1',
    authorityGameSessionId: 'parent-session-1',
    authorityUserId: 'user-1',
    walletNormalized: WALLET,
    status: 'active',
    policyVersion: 'treasure-hunt-staging-v1',
    gameRuleVersion: 'staging-test-v4',
    reservedAt: NOW,
    startedAt: new Date(NOW.getTime() - 10_000),
    dailyPeriodId: 'day-1',
    dailyPeriodStartsAt: new Date(NOW.getTime() - 60_000),
    dailyPeriodEndsAt: new Date(NOW.getTime() + 60_000),
    weeklyPeriodId: 'week-1',
    weeklyPeriodStartsAt: new Date(NOW.getTime() - 60_000),
    weeklyPeriodEndsAt: new Date(NOW.getTime() + 60_000),
    creditReservationId: 'credit-reservation-1',
    creditPeriodId: 'credit-period-1',
    creditSource: 'own',
    creditEvidenceHash: 'c'.repeat(64),
    cukieAssignmentId: 'cukie-assignment-1',
    cukieSource: 'own',
    cukieAssetId: 'cukie-asset-1',
    cukieTokenId: '1',
    cukieGeneration: 'original',
    cukieRarity: 'common',
    cukieAssignmentKind: 'own',
    cukieEvidenceHash: 'u'.repeat(64),
    ambassadorWalletNormalized: null,
    ambassadorCapturedAt: NOW,
    ambassadorEvidenceHash: 'a'.repeat(64),
    quotaReservationId: null,
    evidence: [],
    lastEvidenceHash: 'e'.repeat(64),
    revision: 0,
    createdAt: NOW,
    updatedAt: NOW,
  } satisfies TreasureHuntEconomyRun;
  const weekly: TreasureHuntWeeklyBest[] = [];
  const rewardRule = { _id: 'reward-rule-1' };
  const collections = new Map<string, AnyDocument[]>();
  collections.set('treasure_hunt_economy_runs', [run]);
  collections.set('treasure_hunt_weekly_bests', weekly);
  collections.set('economy_rule_versions', [rewardRule]);
  const handles = new Map<string, AnyDocument>();
  const collection = jest.fn((name: string) => {
    const rows = collections.get(name) ?? [];
    let handle = handles.get(name);
    if (handle) return handle;
    handle = {
      findOne: jest.fn(async (filter: AnyDocument) => {
        if (name === 'economy_rule_versions') return clone(rows[0] ?? null);
        return clone(rows.find((candidate) => matches(candidate, filter)) ?? null);
      }),
      findOneAndUpdate: jest.fn(async (filter: AnyDocument, update: AnyDocument, options?: AnyDocument) => {
        const index = rows.findIndex((candidate) => matches(candidate, filter));
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (index < 0 || !matches(rows[index], filter)) return null;
        applyUpdate(rows[index], update);
        return options?.returnDocument === 'after' ? clone(rows[index]) : clone(rows[index]);
      }),
      insertOne: jest.fn(async (document: AnyDocument) => {
        if (rows.some((candidate) => candidate._id === document._id)) {
          throw Object.assign(new Error('duplicate'), { code: 11000 });
        }
        rows.push(clone(document));
        return { acknowledged: true, insertedId: document._id };
      }),
      replaceOne: jest.fn(async (filter: AnyDocument, document: AnyDocument) => {
        const index = rows.findIndex((candidate) => matches(candidate, filter));
        if (index < 0) return { matchedCount: 0 };
        rows[index] = clone(document);
        return { matchedCount: 1 };
      }),
    };
    handles.set(name, handle);
    return handle;
  });
  const db = { collection };
  mockGetEconomyDb.mockResolvedValue(db as never);
  mockWithEconomyTransaction.mockImplementation(async (work) => work(db as never, {} as never));
  mockPrisma.mockResolvedValue({ competitionAttemptId: null } as never);
  mockArenaRanking.mockResolvedValue({ rank: null, rewardBps: 10_000 } as never);

  const settledSession = {
    sessionId: 'economy-session-1',
    gameId: 'treasure-hunt',
    status: 'settled',
    settledAt: NOW,
    rule: { reward: { rewardRuleVersion: 'reward-v1', rewardRuleConfigHash: 'r'.repeat(64) } },
    validation: { scoreRaw: '24', resultHash: 'v'.repeat(64) },
    credit: { state: 'consumed', reservationId: 'credit-reservation-1', evidenceHash: 'c'.repeat(64) },
    cukie: { state: 'consumed', reservationId: 'cukie-assignment-1', evidenceHash: 'u'.repeat(64) },
  } as unknown as GameEconomySession;
  let settlementExecutions = 0;
  let settledResult: GameEconomySession | null = null;
  let sourceWrites = 0;
  const recordedSourceIds = new Set<string>();
  mockComplete.mockImplementation(async () => {
    if (!settledResult) {
      settlementExecutions += 1;
      settledResult = settledSession;
    }
    return settledResult;
  });
  mockRecordWeeklySource.mockImplementation(async (input, recordedAt): Promise<WeeklyGameSource> => {
    if (!recordedSourceIds.has(input.sessionId)) {
      recordedSourceIds.add(input.sessionId);
      sourceWrites += 1;
    }
    return {
      ...input,
      _id: `weekly-source:${input.sessionId}`,
      payloadHash: 'p'.repeat(64),
      recordedAt,
    };
  });
  return {
    run,
    weekly,
    collection,
    settledSession,
    get settlementExecutions() { return settlementExecutions; },
    get sourceWrites() { return sourceWrites; },
  };
}

function finishInput(overrides: Partial<Parameters<typeof finishTreasureHuntEconomyRun>[0]> = {}) {
  return {
    userId: 'user-1',
    walletAddress: WALLET,
    runId: 'treasure-run-1',
    resultId: 'result-1',
    scoreRaw: '24',
    gameTimeMs: 10_000,
    outcome: 'completed' as const,
    authoritySource: 'economy' as const,
    now: NOW,
    ...overrides,
  };
}

describe('Treasure Hunt normal settlement concurrency', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordWeeklySource.mockResolvedValue({} as never);
  });

  it('concurrent identical finishes settle once, record one weekly source and one weekly best', async () => {
    const harness = makeHarness();

    const [first, second] = await Promise.all([
      finishTreasureHuntEconomyRun(finishInput()),
      finishTreasureHuntEconomyRun(finishInput()),
    ]);

    expect(first).toMatchObject({ status: 'settled', scoreRaw: '24', rewardEligible: true });
    expect(second).toMatchObject({ status: 'settled', scoreRaw: '24', rewardEligible: true });
    expect(harness.run.status).toBe('settled');
    expect(harness.settlementExecutions).toBe(1);
    expect(mockRecordWeeklySource).toHaveBeenCalledTimes(2);
    expect(harness.sourceWrites).toBe(1);
    expect(mockRecordWeeklySource.mock.calls[0]?.[0]).toMatchObject({
      sessionId: 'economy-session-1',
      status: 'settled',
      resultValid: true,
      creditSnapshot: { source: 'own', reservationId: 'credit-reservation-1' },
      cukieSnapshot: { assignmentId: 'cukie-assignment-1' },
    });
    expect(mockArenaRanking).toHaveBeenCalled();
    expect(harness.weekly).toHaveLength(1);
    expect(harness.collection).toHaveBeenCalledWith('treasure_hunt_weekly_bests');
  });

  it('un payload distinto o una identidad distinta no puede acreditar dos veces', async () => {
    const harness = makeHarness();
    const results = await Promise.allSettled([
      finishTreasureHuntEconomyRun(finishInput()),
      finishTreasureHuntEconomyRun(finishInput({ resultId: 'result-2' })),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(harness.run.status).toBe('settled');
    expect(harness.weekly).toHaveLength(1);
    expect(mockRecordWeeklySource).toHaveBeenCalledTimes(1);
    await expect(finishTreasureHuntEconomyRun(finishInput({ walletAddress: OTHER_WALLET })))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(harness.weekly).toHaveLength(1);
  });

  it('reintenta una colision transitoria del source y no reintenta un error semantico', async () => {
    const harness = makeHarness();
    mockRecordWeeklySource
      .mockRejectedValueOnce(Object.assign(new Error('duplicate source'), { code: 11000 }))
      .mockResolvedValueOnce({} as never);

    await expect(finishTreasureHuntEconomyRun(finishInput())).resolves.toMatchObject({ status: 'settled' });
    expect(mockRecordWeeklySource).toHaveBeenCalledTimes(2);
    expect(harness.weekly).toHaveLength(1);

    const secondHarness = makeHarness();
    mockRecordWeeklySource.mockClear();
    const semantic = new DomainConflictError('resultado incompatible');
    mockRecordWeeklySource.mockRejectedValue(semantic);
    await expect(finishTreasureHuntEconomyRun(finishInput())).rejects.toBe(semantic);
    expect(mockRecordWeeklySource).toHaveBeenCalledTimes(1);
    expect(secondHarness.run.status).toBe('finishing');
  });
});
