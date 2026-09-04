jest.mock("@/lib/indexer-db/mongodb", () => ({
  withEconomyTransaction: jest.fn(),
}));

jest.mock("@/lib/uki-economy/credits/service", () => {
  const actual = jest.requireActual("@/lib/uki-economy/credits/service");
  return { ...actual, validateReservationIntegrity: jest.fn((value) => value) };
});

jest.mock("@/lib/uki-economy/game-economy/rules", () => {
  const actual = jest.requireActual("@/lib/uki-economy/game-economy/rules");
  return { ...actual, assertGameSessionIntegrity: jest.fn((value) => value) };
});

import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import { stableGameEconomyHash } from "@/lib/uki-economy/game-economy/rules";
import type { GameEconomySession } from "@/lib/uki-economy/game-economy/types";
import { getIsoWeekPeriod } from "@/lib/uki-economy/periods";
import type { EconomyCycleCalendar } from '@/lib/uki-economy/cycle-calendar';
import { stableRewardHash } from "@/lib/uki-economy/rewards/rules";
import type {
  WeeklyRankingRepository,
  WeeklyRankingTransactionRunner,
} from "@/lib/uki-economy/ranking/repository";
import { buildCurrentWeeklyRankingRule } from "@/lib/uki-economy/ranking/rules";
import {
  assertWeeklyRankingSourceIntegrity,
  WeeklyRankingService,
  weeklyRankingSourcePayload,
} from "@/lib/uki-economy/ranking/service";
import type {
  WeeklyRankingAuditEvent,
  WeeklyRankingManifest,
  WeeklyRankingPeriodState,
  WeeklyRankingRun,
  WeeklyRankingSnapshot,
  WeeklyRankingSource,
} from "@/lib/uki-economy/ranking/types";

jest.setTimeout(30_000);

const PERIOD = getIsoWeekPeriod(new Date("2026-07-10T12:00:00.000Z"));
const SEALED_AT = new Date("2026-07-13T14:00:01.000Z");
const WALLET = `0x${"1".repeat(40)}`;
const CREDIT_CONFIG_HASH = "c".repeat(64);
const GAME_CONFIG_HASH = "d".repeat(64);

function fixture(
  index: number,
  bucket: "own" | "pool" = "pool",
  settledAt = new Date("2026-07-10T12:00:00.000Z"),
) {
  const suffix = String(index).padStart(6, "0");
  const sessionId = `session-${suffix}`;
  const reservationId = `reservation-${suffix}`;
  const expiresAt = new Date("2026-07-10T13:00:00.000Z");
  const credit = {
    _id: reservationId,
    reservationId,
    sessionId,
    walletNormalized: WALLET,
    periodId: `credits-v1:${CREDIT_CONFIG_HASH}:2026-07-10`,
    costCode: "treasure-hunt:start",
    expectedRuleVersion: "credits-v1",
    expectedRuleConfigHash: CREDIT_CONFIG_HASH,
    ruleVersion: "credits-v1",
    ruleConfigHash: CREDIT_CONFIG_HASH,
    amountCredits: 10,
    bucket,
    allocations: [],
    status: "consumed",
    expiresAt,
    revision: 1,
    idempotencyKey: `reserve-${suffix}`,
    requestHash: "a".repeat(64),
    payloadHash: "b".repeat(64),
    createdAt: new Date("2026-07-10T11:00:00.000Z"),
    updatedAt: new Date("2026-07-10T12:00:00.000Z"),
  } as CreditReservation;
  const evidenceHash = stableGameEconomyHash({
    kind: "game-credit-reservation-evidence",
    reservationId,
    sessionId,
    walletNormalized: WALLET,
    costCode: credit.costCode,
    amountCredits: 10,
    bucket,
    expiresAt,
    payloadHash: credit.payloadHash,
  });
  const game = {
    _id: sessionId,
    sessionId,
    walletNormalized: WALLET,
    gameId: "treasure-hunt",
    status: "settled",
    settledAt,
    credit: { state: "consumed", reservationId, evidenceHash },
    validation: {
      scoreRaw: "2000",
      cappedScoreRaw: "2000",
      resultHash: "e".repeat(64),
    },
    rule: {
      version: "game-v1",
      configHash: GAME_CONFIG_HASH,
      credit: {
        costCode: "treasure-hunt:start",
        creditRuleVersion: "credits-v1",
        creditRuleConfigHash: CREDIT_CONFIG_HASH,
      },
      calculation: { scoreCapRaw: "3000" },
    },
  } as unknown as GameEconomySession;
  return { game, credit };
}

class MemoryRankingRepository {
  readonly rule = buildCurrentWeeklyRankingRule({
    version: "ranking-v1",
    activeFrom: PERIOD.start,
    now: PERIOD.start,
  });
  sessions: GameEconomySession[] = [];
  credits: CreditReservation[] = [];
  sources: WeeklyRankingSource[] = [];
  snapshots: WeeklyRankingSnapshot[] = [];
  manifests: WeeklyRankingManifest[] = [];
  runs: WeeklyRankingRun[] = [];
  states: WeeklyRankingPeriodState[] = [];
  events: WeeklyRankingAuditEvent[] = [];
  sessionPageCalls = 0;

  async findFirstRuleBefore(end: Date) { return this.rule.activeFrom < end ? this.rule : null; }
  async findRuleCovering(start: Date, end: Date) {
    return this.rule.activeFrom <= start && (!this.rule.activeUntil || this.rule.activeUntil >= end)
      ? this.rule
      : null;
  }
  async countPendingCycleSessions(start: Date, end: Date) {
    return this.sessions.filter((row) => row.createdAt >= start && row.createdAt < end && !['settled', 'forfeited', 'expired', 'rejected'].includes(row.status)).length;
  }
  async listSettledSessionsPage(input: { start: Date; endExclusive: Date; afterId: string | null; limit: number; calendar?: EconomyCycleCalendar }) {
    this.sessionPageCalls += 1;
    return this.sessions
      .filter((row) => row.status === "settled"
        && (input.calendar ? row.createdAt : row.settledAt!) >= input.start
        && (input.calendar ? row.createdAt : row.settledAt!) < input.endExclusive
        && (!input.afterId || row._id > input.afterId))
      .sort((left, right) => left._id.localeCompare(right._id))
      .slice(0, input.limit);
  }
  async listReservations(ids: string[]) { return this.credits.filter((row) => ids.includes(row.reservationId)); }
  async findPreviousRankings(participants: Array<{ gameId: string; walletNormalized: string }>, before: Date) {
    return participants.flatMap((participant) => {
      const latest = this.snapshots
        .filter((row) => row.gameId === participant.gameId
          && row.walletNormalized === participant.walletNormalized
          && row.periodStart < before)
        .sort((left, right) => right.periodStart.getTime() - left.periodStart.getTime())[0];
      return latest ? [latest] : [];
    });
  }
  async findManifest(periodId: string) { return this.manifests.find((row) => row.periodId === periodId) ?? null; }
  async findRun(periodId: string) { return this.runs.find((row) => row.periodId === periodId) ?? null; }
  async findPeriodState(periodId: string) { return this.states.find((row) => row.periodId === periodId) ?? null; }
  async findAuditEvent(periodId: string) { return this.events.find((row) => row.periodId === periodId) ?? null; }
  async listStoredSourcesPage(periodId: string, afterId: string | null, limit: number) {
    return this.sources.filter((row) => row.periodId === periodId && (!afterId || row._id > afterId))
      .sort((left, right) => left._id.localeCompare(right._id)).slice(0, limit);
  }
  async listStoredSnapshotsPage(periodId: string, afterId: string | null, limit: number) {
    return this.snapshots.filter((row) => row.periodId === periodId && (!afterId || row._id > afterId))
      .sort((left, right) => left._id.localeCompare(right._id)).slice(0, limit);
  }
  async insertSources(rows: WeeklyRankingSource[]) { this.sources.push(...rows); }
  async insertSnapshots(rows: WeeklyRankingSnapshot[]) { this.snapshots.push(...rows); }
  async insertManifest(row: WeeklyRankingManifest) { this.manifests.push(row); }
  async insertRun(row: WeeklyRankingRun) { this.runs.push(row); }
  async insertPeriodState(row: WeeklyRankingPeriodState) { this.states.push(row); }
  async insertAuditEvent(row: WeeklyRankingAuditEvent) { this.events.push(row); }
}

function service(repository: MemoryRankingRepository) {
  const runner: WeeklyRankingTransactionRunner = async (work) =>
    work(repository as unknown as WeeklyRankingRepository);
  return new WeeklyRankingService(runner);
}

describe("weekly ranking sealed producer", () => {
  it('cierra y reproduce una semana de siete ciclos sin perder una sesion liquidada tras el corte', async () => {
    const calendar: EconomyCycleCalendar = { version: 'cycle-v1', chainId: 97, cycleSeconds: 1800, anchorAt: '2026-09-04T12:00:00.000Z' };
    const fastStart = new Date(calendar.anchorAt);
    const period = getIsoWeekPeriod(fastStart, calendar);
    const now = new Date(period.endExclusive.getTime() + 150000);
    const repository = new MemoryRankingRepository();
    Object.assign(repository.rule, buildCurrentWeeklyRankingRule({ version: 'ranking-fast', activeFrom: fastStart, calendar, now: fastStart }));
    const row = fixture(123, 'pool', new Date(period.endExclusive.getTime() + 100000));
    row.game.createdAt = new Date(period.endExclusive.getTime() - 1000);
    row.game.rule.calendar = calendar;
    repository.sessions = [row.game];
    repository.credits = [row.credit];
    const ranking = service(repository);
    await expect(ranking.closePeriod({ period, now: new Date(now.getTime() - 1), pageSize: 5 })).rejects.toThrow(/no termina/);
    row.game.status = 'started';
    await expect(ranking.closePeriod({ period, now, pageSize: 5 })).rejects.toThrow(/pendientes/);
    row.game.status = 'settled';
    await expect(ranking.closeCompletedPeriod({ now, pageSize: 5 })).resolves.toMatchObject({ periodId: period.id, sourceCount: 1, replayed: false });
    await expect(ranking.closeCompletedPeriod({ now, pageSize: 5 })).resolves.toMatchObject({ periodId: period.id, sourceCount: 1, replayed: true });
    expect(repository.sources[0].periodAnchorAt).toEqual(row.game.createdAt);
    expect(repository.snapshots[0].periodEndExclusive).toEqual(period.endExclusive);
  });
  it("paginates more than 10k pool settlements and emits one immutable participant snapshot", async () => {
    const repository = new MemoryRankingRepository();
    const rows = Array.from({ length: 10_001 }, (_, index) => fixture(index));
    repository.sessions = rows.map((row) => row.game);
    repository.credits = rows.map((row) => row.credit);
    const result = await service(repository).closePeriod({ period: PERIOD, now: SEALED_AT, pageSize: 500 });
    expect(result).toMatchObject({ sourceCount: 10_001, participantCount: 1, replayed: false });
    expect(repository.sessionPageCalls).toBeGreaterThan(20);
    expect(repository.sources).toHaveLength(10_001);
    expect(repository.snapshots[0]).toMatchObject({
      rank: 5,
      nextRank: 3,
      movement: -2,
      gamesPlayed: 10_001,
      performanceBps: 6666,
      rewardBps: 6000,
      status: "sealed",
    });
    expect(repository.events).toHaveLength(1);
  });

  it("replays an identical close but fails closed when a late source appears", async () => {
    const repository = new MemoryRankingRepository();
    const initial = fixture(1);
    repository.sessions = [initial.game];
    repository.credits = [initial.credit];
    const ranking = service(repository);
    await expect(ranking.closePeriod({ period: PERIOD, now: SEALED_AT, pageSize: 2 }))
      .resolves.toMatchObject({ replayed: false, sourceCount: 1 });
    await expect(ranking.closePeriod({ period: PERIOD, now: new Date(SEALED_AT.getTime() + 1000), pageSize: 2 }))
      .resolves.toMatchObject({ replayed: true, sourceCount: 1 });

    const late = fixture(2);
    repository.sessions.push(late.game);
    repository.credits.push(late.credit);
    await expect(ranking.closePeriod({ period: PERIOD, now: new Date(SEALED_AT.getTime() + 2000), pageSize: 2 }))
      .rejects.toThrow(/diverge del source canonico/);
    expect(repository.manifests).toHaveLength(1);
    expect(repository.events).toHaveLength(1);
  });

  it("excludes own-credit settlements from sources", async () => {
    const repository = new MemoryRankingRepository();
    const pooled = fixture(1, "pool");
    const own = fixture(2, "own");
    repository.sessions = [pooled.game, own.game];
    repository.credits = [pooled.credit, own.credit];
    await expect(service(repository).closePeriod({ period: PERIOD, now: SEALED_AT, pageSize: 10 }))
      .resolves.toMatchObject({ sourceCount: 1, participantCount: 1 });
    expect(repository.sources[0].sessionId).toBe(pooled.game.sessionId);
    expect(repository.sources[0]).toMatchObject({
      creditBucket: "pool",
      creditCostCode: pooled.credit.costCode,
      creditAmountCredits: pooled.credit.amountCredits,
      creditExpiresAt: pooled.credit.expiresAt,
      creditEvidenceHash: pooled.game.credit.evidenceHash,
    });
  });

  it("fails closed if a sealed source is forged as an own-credit settlement", async () => {
    const repository = new MemoryRankingRepository();
    const pooled = fixture(1, "pool");
    repository.sessions = [pooled.game];
    repository.credits = [pooled.credit];
    await service(repository).closePeriod({ period: PERIOD, now: SEALED_AT, pageSize: 10 });

    const source = repository.sources[0]!;
    const forgedBase = {
      ...source,
      creditBucket: "own",
      creditEvidenceHash: stableGameEconomyHash({
        kind: "game-credit-reservation-evidence",
        reservationId: source.reservationId,
        sessionId: source.sessionId,
        walletNormalized: source.walletNormalized,
        costCode: source.creditCostCode,
        amountCredits: source.creditAmountCredits,
        bucket: "own",
        expiresAt: source.creditExpiresAt,
        payloadHash: source.creditPayloadHash,
      }),
    };
    const forged = {
      ...forgedBase,
      sourceHash: stableRewardHash(weeklyRankingSourcePayload(
        forgedBase as unknown as Omit<WeeklyRankingSource, "sourceHash" | "createdAt">,
      )),
    } as unknown as WeeklyRankingSource;

    expect(() => assertWeeklyRankingSourceIntegrity(forged)).toThrow(/no supera integridad/);
  });

  it("inherits nextRank into the following week and catches up in chronological order", async () => {
    const repository = new MemoryRankingRepository();
    const firstWeek = Array.from({ length: 20 }, (_, index) => fixture(index));
    repository.sessions = firstWeek.map((row) => row.game);
    repository.credits = firstWeek.map((row) => row.credit);
    const ranking = service(repository);
    const runtimeNow = new Date("2026-07-21T12:00:00.000Z");
    await expect(ranking.closeCompletedPeriod({ now: runtimeNow, pageSize: 7 }))
      .resolves.toMatchObject({ periodId: "2026-W28", replayed: false });
    expect(repository.snapshots.find((row) => row.periodId === "2026-W28")).toMatchObject({
      rank: 5,
      nextRank: 3,
    });

    const secondWeek = fixture(100, "pool", new Date("2026-07-15T12:00:00.000Z"));
    repository.sessions.push(secondWeek.game);
    repository.credits.push(secondWeek.credit);
    await expect(ranking.closeCompletedPeriod({ now: runtimeNow, pageSize: 7 }))
      .resolves.toMatchObject({ periodId: "2026-W29", replayed: false });
    expect(repository.snapshots.find((row) => row.periodId === "2026-W29")).toMatchObject({
      rank: 3,
      nextRank: 3,
      gamesPlayed: 1,
    });
    await expect(ranking.closeCompletedPeriod({ now: runtimeNow, pageSize: 7 }))
      .resolves.toMatchObject({ periodId: "2026-W29", replayed: true });
  });
});
