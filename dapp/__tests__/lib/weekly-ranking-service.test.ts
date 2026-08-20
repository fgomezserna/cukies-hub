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
import type {
  WeeklyRankingRepository,
  WeeklyRankingTransactionRunner,
} from "@/lib/uki-economy/ranking/repository";
import { buildCurrentWeeklyRankingRule } from "@/lib/uki-economy/ranking/rules";
import { WeeklyRankingService } from "@/lib/uki-economy/ranking/service";
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
  async listSettledSessionsPage(input: { start: Date; endExclusive: Date; afterId: string | null; limit: number }) {
    this.sessionPageCalls += 1;
    return this.sessions
      .filter((row) => row.status === "settled"
        && row.settledAt! >= input.start
        && row.settledAt! < input.endExclusive
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
