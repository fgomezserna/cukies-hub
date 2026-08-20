import {
  calculateDailyRewardSettlement,
  calculatePoolTranche,
  calculateWeeklyPrize,
  excludeSeikuFromCukiePool,
  reserveForCredits,
  sealDailyRewardAccounting,
  selectWeeklyBestResults,
  splitIntoSevenTranches,
  splitUndistributed,
  weeklySettlementSchedule,
} from "@/lib/uki-economy/rewards/accounting";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";
import { RewardAccountingService } from "@/lib/uki-economy/rewards/accounting-repository";
import {
  assertRewardAccountingActionEnabled,
  loadRewardAccountingRuntimeConfig,
  requireWeeklyLotteryEntropy,
} from "@/lib/uki-economy/rewards/accounting-runtime";
import {
  DAILY_REWARD_EMISSION_RAW,
  type DailyRewardAccounting,
  type DailyRewardSourceLine,
  type PoolTrancheAccounting,
  type WeeklyGameResult,
  type WeeklyGameSource,
  type WeeklyPrizeAccounting,
} from "@/lib/uki-economy/rewards/accounting-types";
import type { RewardAccountingRepository } from "@/lib/uki-economy/rewards/accounting-repository";

const TOKEN = BigInt("1000000000000000000");
const raw = (uki: number) => (BigInt(uki) * TOKEN).toString();
const wallet = (ordinal: number) => `0x${ordinal.toString(16).padStart(40, "0")}`;
const DESTINATIONS = {
  treasury: wallet(9001),
  marketingDevelopment: wallet(9002),
  supplyReduction: wallet(9003),
};
const PAYOUT_AT = new Date("2026-08-24T17:00:00.000Z");
const ENTROPY = {
  chainId: 97 as const,
  selectionPolicy: "first_safe_block_at_or_after_cutoff" as const,
  blockNumber: 84_000_000,
  blockHash: `0x${"ab".repeat(32)}`,
  blockTimestamp: new Date("2026-08-24T17:00:03.000Z"),
  previousBlockNumber: 83_999_999,
  previousBlockHash: `0x${"cd".repeat(32)}`,
  previousBlockTimestamp: new Date("2026-08-24T16:59:59.000Z"),
  canonical: true as const,
  confirmedAt: new Date("2026-08-24T17:01:00.000Z"),
};
function settledResult(input: Pick<WeeklyGameResult, "wallet" | "gameId" | "scoreRaw" | "playedAt">): WeeklyGameResult {
  const suffix = input.gameId.replace(/[^A-Za-z0-9]/g, "-");
  return {
    ...input,
    sessionId: `session-${suffix}`,
    periodAnchorAt: input.playedAt,
    settledAt: input.playedAt,
    status: "settled",
    outcome: "completed",
    resultValid: true,
    resultHash: "1".repeat(64),
    creditSnapshot: {
      source: "pool",
      reservationId: `credit-${suffix}`,
      evidenceHash: "2".repeat(64),
    },
    cukieSnapshot: {
      source: "pool_original",
      assignmentId: `cukie-${suffix}`,
      generation: "original",
      evidenceHash: "3".repeat(64),
    },
    ambassadorSnapshot: {
      walletNormalized: wallet(8000),
      capturedAt: input.playedAt,
      evidenceHash: "4".repeat(64),
    },
    arenaRankingSnapshot: {
      rank: 5,
      rewardBps: 6_000,
      sourceRankingId: `arena-${suffix}`,
      evidenceHash: "5".repeat(64),
    },
  };
}

describe("reward accounting invariants", () => {
  it("reserva exactamente 7.5 + 2 + 0.4 + 0.1 por cada 10 creditos", () => {
    expect(reserveForCredits(10)).toEqual({
      credits: 10,
      performanceRaw: "7500000000000000000",
      weeklyPrizeRaw: "2000000000000000000",
      ambassadorOrdinaryRaw: "400000000000000000",
      ambassadorWeeklyRaw: "100000000000000000",
      totalRaw: raw(10),
    });
    expect(() => reserveForCredits(11)).toThrow(/multiplo/);
  });

  it("cierra siempre 500000 UKI y manda el resto a un unico 80/10/10", () => {
    const closed = sealDailyRewardAccounting({
      dayId: "2026-08-20",
      ruleVersion: "reward-v3",
      buckets: {
        playersRaw: raw(100_000),
        creditPoolRaw: raw(50_000),
        cukiePoolRaw: raw(25_000),
        ambassadorOrdinaryRaw: raw(20_000),
        weeklyPrizeRaw: raw(10_000),
        ambassadorWeeklyRaw: raw(5_000),
      },
      destinations: DESTINATIONS,
      sealedAt: new Date("2026-08-21T00:00:00.000Z"),
    });
    expect(closed.emissionRaw).toBe(DAILY_REWARD_EMISSION_RAW);
    expect(closed.conservationRaw).toBe(DAILY_REWARD_EMISSION_RAW);
    expect(closed.undistributed).toEqual({
      totalRaw: raw(290_000),
      treasuryRaw: raw(232_000),
      marketingDevelopmentRaw: raw(29_000),
      supplyReductionRaw: raw(29_000),
    });
    expect(closed.destinations.marketingDevelopment).toBe(DESTINATIONS.marketingDevelopment);
  });

  it("bloquea sobreasignacion diaria y conserva hasta el ultimo wei", () => {
    expect(splitUndistributed("11")).toEqual({
      totalRaw: "11",
      treasuryRaw: "8",
      marketingDevelopmentRaw: "1",
      supplyReductionRaw: "2",
    });
    expect(() => sealDailyRewardAccounting({
      dayId: "2026-08-20",
      ruleVersion: "reward-v3",
      buckets: {
        playersRaw: raw(500_001), creditPoolRaw: "0", cukiePoolRaw: "0",
        ambassadorOrdinaryRaw: "0", weeklyPrizeRaw: "0", ambassadorWeeklyRaw: "0",
      },
      destinations: DESTINATIONS,
      sealedAt: new Date(),
    })).toThrow(/excede/);
  });

  it("combina ordinario + tramo previo antes de garantizar 0.75 y calcula el 5% sobre el pago final", () => {
    const rule = testRewardRule({
      version: "reward-v3",
      runCredits: {
        unitScale: 10,
        totalUnits: 100,
        weeklyReserveUnits: 20,
        ambassadorReserveUnits: 5,
        ambassadorOrdinaryUnits: 4,
        ambassadorWeeklyUnits: 1,
        convertibleUnits: 75,
      },
      creditPoolDaily: {
        sourceShareBps: 10_000,
        floorEnabled: true,
        floorCreditsStep: 10,
        floorAmountRaw: "750000000000000000",
      },
      emissionBudget: {
        programStartsAt: new Date("2026-08-17T14:00:00.000Z"),
        dayBoundarySecondUtc: 14 * 60 * 60,
        lateReservationGraceSeconds: 86_400,
        dailyCapRaw: DAILY_REWARD_EMISSION_RAW,
        lifetimeCapRaw: raw(450_000_000),
        unusedDailyCapacity: "materialize_undistributed",
        overflowPolicy: "block",
      },
      undistributedBps: {
        treasury: 8_000,
        marketing: 0,
        development: 0,
        marketingDevelopment: 1_000,
        supplyReduction: 1_000,
      },
      destinations: {
        creditPool: wallet(9101),
        cukiePoolOriginal: wallet(9102),
        cukiePoolSecondPlus: wallet(9103),
        treasury: DESTINATIONS.treasury,
        marketing: DESTINATIONS.marketingDevelopment,
        development: DESTINATIONS.marketingDevelopment,
        marketingDevelopment: DESTINATIONS.marketingDevelopment,
        supplyReduction: DESTINATIONS.supplyReduction,
      },
    });
    const contributor = wallet(40);
    const ambassador = wallet(41);
    const result = calculateDailyRewardSettlement({
      dayId: "2026-08-18",
      rule,
      sourceLines: [{
        sourceId: "game-session:guarantee",
        sourceTotalRaw: raw(10),
        allocations: [{
          allocationId: "player-allocation",
          walletNormalized: wallet(1),
          category: "player",
          amountRaw: "7400000000000000000",
        }],
        accruals: [
          { accrualId: "credit", category: "credit_pool_weekly", amountRaw: "100000000000000000" },
          { accrualId: "weekly", category: "weekly_prize_pool", amountRaw: raw(2) },
          { accrualId: "amb-ordinary", category: "ambassador_ordinary_pending", amountRaw: "400000000000000000" },
          { accrualId: "amb-weekly", category: "ambassador_weekly_pending", amountRaw: "100000000000000000" },
        ],
      }],
      creditContributors: [{
        walletNormalized: contributor,
        units: 10,
        ambassadorWalletNormalized: ambassador,
      }],
      cukieOriginalParticipants: [],
      cukieSecondPlusParticipants: [],
      ambassadorByWallet: { [wallet(1)]: null },
      priorWeekly: {
        weeklyAccountingId: "reward-weekly:2026-W33",
        creditPoolRaw: "200000000000000000",
        creditPoolAmbassadorRaw: "10000000000000000",
        cukiePoolOriginalRaw: "0",
        cukiePoolOriginalAmbassadorRaw: "0",
        cukiePoolSecondPlusRaw: "0",
        cukiePoolSecondPlusAmbassadorRaw: "0",
      },
      destinations: DESTINATIONS,
      sealedAt: new Date("2026-08-19T16:00:00.000Z"),
    });
    const allocations = result.allocations.filter((item) =>
      item.walletNormalized === contributor || item.walletNormalized === ambassador);
    expect(allocations.filter((item) => item.walletNormalized === contributor)
      .reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))).toBe(
        BigInt("750000000000000000"),
      );
    expect(allocations.filter((item) => item.walletNormalized === ambassador)
      .reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))).toBe(
        BigInt("37500000000000000"),
      );
    expect(result.topupRaw).toBe("450000000000000000");
    expect(result.priorReservedInflowRaw).toBe("210000000000000000");
    expect(result.conservationRaw).toBe(DAILY_REWARD_EMISSION_RAW);
  });
});

describe("weekly prize", () => {
  function weeklyResults(): WeeklyGameResult[] {
    return Array.from({ length: 35 }, (_, index) =>
      Array.from({ length: 10 }, (__, game) => settledResult({
        wallet: wallet(index + 1),
        gameId: `game-${index + 1}-${game}`,
        scoreRaw: String(1_000 - index - game),
        playedAt: new Date(Date.UTC(2026, 7, 18 + game, 10, index)),
      }))).flat();
  }

  it("usa una sola mejor puntuacion raw, desempata por timestamp antiguo y liga winningGameId", () => {
    const tied: WeeklyGameResult[] = [
      settledResult({ wallet: wallet(1), gameId: "late", scoreRaw: "999999999999999999999999", playedAt: new Date("2026-08-20T12:00:00Z") }),
      settledResult({ wallet: wallet(1), gameId: "early", scoreRaw: "999999999999999999999999", playedAt: new Date("2026-08-20T11:00:00Z") }),
      settledResult({ wallet: wallet(2), gameId: "uncapped", scoreRaw: "1000000000000000000000000", playedAt: new Date("2026-08-20T13:00:00Z") }),
    ];
    const ranked = selectWeeklyBestResults(tied);
    expect(ranked[0].best.gameId).toBe("uncapped");
    expect(ranked[1].best.gameId).toBe("early");
    expect(ranked[1].gamesPlayed).toBe(2);
  });

  it("reparte 60/30/10, 10 loterias auditables y conserva el bote", () => {
    const result = calculateWeeklyPrize({
      periodId: "2026-W34",
      ruleVersion: "reward-v3",
      potRaw: "10000",
      ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: ["reward-daily:2026-08-18"],
      results: weeklyResults(),
      destinations: DESTINATIONS,
      lotteryEntropy: ENTROPY,
      payoutAt: PAYOUT_AT,
      sealedAt: ENTROPY.confirmedAt,
    });
    expect(result.winners.filter((winner) => winner.kind === "top_10").map((winner) => winner.shareBps))
      .toEqual([900, 800, 700, 650, 600, 550, 500, 450, 450, 400]);
    expect(result.winners.filter((winner) => winner.kind === "positions_11_25")).toHaveLength(15);
    expect(result.winners.filter((winner) => winner.kind === "lottery")).toHaveLength(10);
    expect(result.winners.reduce((sum, winner) => sum + winner.shareBps, 0)).toBe(10_000);
    expect(BigInt(result.allocatedRaw) + BigInt(result.undistributed.totalRaw)).toBe(BigInt("10000"));
    expect(result.poolReservations.map((item) => item.pool)).toEqual([
      "credit", "cukie_original",
    ]);
    expect(BigInt(result.ambassadorAllocatedRaw)
      + BigInt(result.ambassadorDeferredRaw)
      + BigInt(result.ambassadorUndistributed.totalRaw)).toBe(BigInt("500"));
    expect(result.ambassadorPayouts).toHaveLength(35);
    expect(result.conservationRaw).toBe("10500");
    // El rank 5 aplica el 60 % sobre la parte del jugador; la diferencia
    // vuelve al 80/10/10 y no se reasigna a los pools.
    expect(result.undistributed.totalRaw).toBe("1004");
    expect(result.winners.every((winner) => winner.winningGameId.startsWith("session-game-"))).toBe(true);
    expect(result.winners.every((winner) => winner.sourceSnapshot.sessionId.startsWith("session-game-"))).toBe(true);
    expect(result.winners[0].sourceSnapshot).toMatchObject({
      creditSnapshot: { source: "pool" },
      cukieSnapshot: { source: "pool_original", generation: "original" },
      ambassadorSnapshot: { walletNormalized: wallet(8000) },
    });
    const replay = calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: "reward-v3", potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: ["reward-daily:2026-08-18"],
      results: weeklyResults().reverse(), lotteryEntropy: ENTROPY, destinations: DESTINATIONS,
      payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
    });
    expect(replay.winners).toEqual(result.winners);
  });

  it("falla cerrado sin bloque canonico posterior al lunes 17", () => {
    expect(() => calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: "reward-v3", potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: ["reward-daily:2026-08-18"],
      results: weeklyResults(), destinations: DESTINATIONS, payoutAt: PAYOUT_AT, sealedAt: PAYOUT_AT,
    })).toThrow(/pending_entropy/);
    expect(() => calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: "reward-v3", potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: ["reward-daily:2026-08-18"],
      results: weeklyResults(), destinations: DESTINATIONS, lotteryEntropy: { ...ENTROPY, blockTimestamp: new Date("2026-08-24T16:59:59Z") },
      payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
    })).toThrow(/pending_entropy/);
  });

  it("manda puestos y loterias ausentes a 80/10/10", () => {
    const result = calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: "reward-v3", potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: ["reward-daily:2026-08-18"],
      results: weeklyResults().slice(0, 50), lotteryEntropy: ENTROPY, destinations: DESTINATIONS,
      payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
    });
    expect(result.winners).toHaveLength(5);
    expect(result.allocatedRaw).toBe("3284");
    expect(result.undistributed).toEqual({
      totalRaw: "6716", treasuryRaw: "5372", marketingDevelopmentRaw: "671", supplyReductionRaw: "673",
    });
    expect(result.ambassadorAllocatedRaw).toBe("25");
    expect(result.ambassadorDeferredRaw).toBe("136");
    expect(result.ambassadorUndistributed.totalRaw).toBe("339");
  });

  it("manda la reserva ambassador sin referidor a 80/10/10 y no genera recursion", () => {
    const source = settledResult({
      wallet: wallet(1), gameId: "without-referrer", scoreRaw: "200", playedAt: new Date("2026-08-20T10:00:00Z"),
    });
    source.ambassadorSnapshot.walletNormalized = null;
    const result = calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: "reward-v3", potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: ["reward-daily:2026-08-18"], results: [source],
      lotteryEntropy: ENTROPY, destinations: DESTINATIONS, payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
    });
    expect(result.ambassadorPayouts).toEqual([]);
    expect(result.ambassadorDeferredRaw).toBe("33");
    expect(result.ambassadorUndistributed).toEqual({
      totalRaw: "467", treasuryRaw: "373", marketingDevelopmentRaw: "46", supplyReductionRaw: "48",
    });
  });

  it("no admite abandonos, fallos ni sesiones no settled y exige diez scores >100", () => {
    const base = Array.from({ length: 10 }, (_, index) => settledResult({
      wallet: wallet(1), gameId: `eligible-${index}`, scoreRaw: index === 9 ? "100" : "101",
      playedAt: new Date(Date.UTC(2026, 7, 20, 10, index)),
    }));
    const invalid = [
      { ...settledResult({ wallet: wallet(1), gameId: "abandoned", scoreRaw: "999", playedAt: PAYOUT_AT }), outcome: "abandoned" as const },
      { ...settledResult({ wallet: wallet(1), gameId: "pending", scoreRaw: "999", playedAt: PAYOUT_AT }), status: "validated" as const },
      { ...settledResult({ wallet: wallet(1), gameId: "invalid", scoreRaw: "999", playedAt: PAYOUT_AT }), resultValid: false },
    ];
    const selected = selectWeeklyBestResults([...base, ...invalid]);
    expect(selected[0].gamesPlayed).toBe(10);
    expect(selected[0].qualifyingLotteryGames).toBe(9);
    expect(selected[0].best.gameId).toBe("eligible-0");
  });
});

describe("pool tranches and timing", () => {
  it("programa jugadores lunes17 y siete tramos martes16 a lunes16", () => {
    const schedule = weeklySettlementSchedule(new Date("2026-08-17T00:00:00.000Z"));
    expect(schedule.playerPayoutAt.toISOString()).toBe("2026-08-24T17:00:00.000Z");
    expect(schedule.trancheAt.map((date) => date.toISOString())).toEqual([
      "2026-08-25T16:00:00.000Z", "2026-08-26T16:00:00.000Z",
      "2026-08-27T16:00:00.000Z", "2026-08-28T16:00:00.000Z",
      "2026-08-29T16:00:00.000Z", "2026-08-30T16:00:00.000Z",
      "2026-08-31T16:00:00.000Z",
    ]);
    expect(splitIntoSevenTranches("10")).toEqual(["2", "2", "2", "1", "1", "1", "1"]);
  });

  it("aplica max(ordinario + previo/7, 0.75) y 5% tambien al topup", () => {
    const tranche = calculatePoolTranche({
      periodId: "2026-W34", tranche: 0, participantWallet: wallet(1), ambassadorWallet: wallet(2),
      credits: 10, ordinaryRaw: "100000000000000000", priorPeriodRaw: "1400000000000000000",
      ordinarySourceId: "daily:2026-08-18", priorPeriodSourceId: "weekly:2026-W33",
      scheduledAt: new Date("2026-08-18T16:00:00Z"), sealedAt: new Date("2026-08-18T16:00:01Z"),
    });
    expect(tranche.priorPeriodSeventhRaw).toBe("200000000000000000");
    expect(tranche.guaranteedRaw).toBe("750000000000000000");
    expect(tranche.paymentRaw).toBe("750000000000000000");
    expect(tranche.topupRaw).toBe("450000000000000000");
    expect(tranche.ambassadorCommissionRaw).toBe("37500000000000000");
    expect(tranche.fundingRaw).toBe("787500000000000000");
    expect(() => calculatePoolTranche({
      periodId: "2026-W34", tranche: 0, participantWallet: wallet(1), ambassadorWallet: wallet(1),
      credits: 10, ordinaryRaw: "0", priorPeriodRaw: "0",
      ordinarySourceId: "daily:2026-08-18", priorPeriodSourceId: "weekly:2026-W33",
      scheduledAt: PAYOUT_AT, sealedAt: PAYOUT_AT,
    })).toThrow(/autorreferencia/);
  });

  it("retiene toda participacion Seiku como no distribuida", () => {
    expect(excludeSeikuFromCukiePool([
      { wallet: wallet(1), amountRaw: "40", isSeiku: false },
      { wallet: wallet(2), amountRaw: "60", isSeiku: true },
    ])).toEqual({ eligible: [{ walletNormalized: wallet(1), amountRaw: "40" }], undistributedRaw: "60" });
  });
});

class MemoryAccountingRepository implements RewardAccountingRepository {
  daily = new Map<string, DailyRewardAccounting>();
  weekly = new Map<string, WeeklyPrizeAccounting>();
  tranches = new Map<string, PoolTrancheAccounting>();
  sources = new Map<string, WeeklyGameSource>();
  evidence = new Map<string, Awaited<ReturnType<RewardAccountingRepository["findSettledGameEvidence"]>>>();
  dailyLines: DailyRewardSourceLine[] = [];
  findRewardRule = async () => null;
  materializeDailyCapacity = async () => ({
    _id: "reward-daily-capacity:2026-08-20",
    dayId: "2026-08-20",
    budgetDayId: "2026-08-20T14:00:00.000Z",
    ruleVersion: "reward-v3",
    ruleConfigHash: "1".repeat(64),
    previousDailyRaw: "0",
    capacityMaterializedRaw: DAILY_REWARD_EMISSION_RAW,
    resultingDailyRaw: DAILY_REWARD_EMISSION_RAW,
    previousLifetimeRaw: "0",
    resultingLifetimeRaw: DAILY_REWARD_EMISSION_RAW,
    payloadHash: "2".repeat(64),
    status: "sealed" as const,
    sealedAt: new Date(),
  });
  findDaily = async (id: string) => this.daily.get(id) ?? null;
  insertDaily = async (value: DailyRewardAccounting) => { this.daily.set(value.dayId, value); };
  findWeekly = async (id: string) => this.weekly.get(id) ?? null;
  insertWeekly = async (value: WeeklyPrizeAccounting) => { this.weekly.set(value.periodId, value); };
  findPoolTranche = async (id: string) => this.tranches.get(id) ?? null;
  insertPoolTranche = async (value: PoolTrancheAccounting) => { this.tranches.set(value._id, value); };
  findSettledGameEvidence = async (id: string) => this.evidence.get(id) ?? null;
  findWeeklyGameSource = async (id: string) => this.sources.get(id) ?? null;
  insertWeeklyGameSource = async (value: WeeklyGameSource) => { this.sources.set(value.sessionId, value); };
  listEligibleWeeklyGameSources = async (startsAt: Date, endsAt: Date) => [...this.sources.values()]
    .filter((value) => value.status === "settled" && value.outcome === "completed" && value.resultValid
      && value.periodAnchorAt >= startsAt && value.periodAnchorAt < endsAt);
  listDailyRewardSourceLines = async () => this.dailyLines;
  findNextClosableRewardDay = async () => null;
  listDailyAccounting = async () => [...this.daily.values()].sort((left, right) =>
    left.dayId.localeCompare(right.dayId));
  findFirstSafeLotteryEntropy = async () => ENTROPY;
  dailyReadiness = async () => ({
    unfinishedRuns: 0,
    missingRewardSources: 0,
    missingWeeklySources: 0,
  });
  listCreditContributors = async () => [];
  listDailyAmbassadorSnapshots = async () => ({});
  listCukieParticipants = async () => [];
  findPriorWeeklyPoolTranche = async () => null;
}

describe("accounting persistence and runtime gates", () => {
  it("hace replay idempotente y bloquea payload distinto", async () => {
    const repository = new MemoryAccountingRepository();
    const service = new RewardAccountingService(async (work) => work(repository));
    const first = sealDailyRewardAccounting({
      dayId: "2026-08-20", ruleVersion: "reward-v3",
      buckets: { playersRaw: "1", creditPoolRaw: "0", cukiePoolRaw: "0", ambassadorOrdinaryRaw: "0", weeklyPrizeRaw: "0", ambassadorWeeklyRaw: "0" },
      destinations: DESTINATIONS, sealedAt: new Date("2026-08-21T00:00:00Z"),
    });
    await expect(service.sealDaily(first)).resolves.toEqual(first);
    await expect(service.sealDaily(first)).resolves.toEqual(first);
    await expect(service.sealDaily({ ...first, payloadHash: "f".repeat(64) })).rejects.toThrow(/payload distinto/);
    expect(repository.daily.size).toBe(1);
  });

  it("mantiene cada scheduler desactivado salvo opt-in explicito", () => {
    const config = loadRewardAccountingRuntimeConfig({
      REWARD_ACCOUNTING_SCHEDULER_ID: "reward-accounting-staging",
      REWARD_ACCOUNTING_RULE_VERSION: "reward-v3",
      REWARD_DAILY_ACCOUNTING_ENABLED: "true",
      REWARD_WEEKLY_PAYOUT_ENABLED: "false",
      REWARD_POOL_TRANCHES_ENABLED: "TRUE",
    });
    expect(config).toMatchObject({ dailyCloseEnabled: true, weeklyPayoutEnabled: false, poolTranchesEnabled: false });
    expect(() => assertRewardAccountingActionEnabled(config, "daily")).not.toThrow();
    expect(() => assertRewardAccountingActionEnabled(config, "weekly")).toThrow(/deshabilitada/);
  });

  it("mantiene pending el weekly hasta que el indexer entrega entropia posterior", async () => {
    await expect(requireWeeklyLotteryEntropy(
      { resolveFirstSafeBlockAtOrAfter: async () => null },
      PAYOUT_AT,
    )).rejects.toThrow(/pending_entropy/);
    await expect(requireWeeklyLotteryEntropy(
      { resolveFirstSafeBlockAtOrAfter: async () => ENTROPY },
      PAYOUT_AT,
    )).resolves.toEqual(ENTROPY);
  });

  it("solo registra una fuente que liga la sesion settled y sus recursos consumidos", async () => {
    const repository = new MemoryAccountingRepository();
    const service = new RewardAccountingService(async (work) => work(repository));
    const source = settledResult({
      wallet: wallet(1), gameId: "canonical-game", scoreRaw: "1234",
      playedAt: new Date("2026-08-20T12:00:00Z"),
    });
    repository.evidence.set(source.sessionId, {
      sessionId: source.sessionId,
      walletNormalized: source.wallet,
      gameId: source.gameId,
      status: "settled",
      settledAt: source.settledAt,
      validation: { scoreRaw: source.scoreRaw, resultHash: source.resultHash },
      credit: {
        state: "consumed", reservationId: source.creditSnapshot.reservationId,
        evidenceHash: source.creditSnapshot.evidenceHash,
      },
      cukie: {
        state: "consumed", reservationId: source.cukieSnapshot.assignmentId,
        evidenceHash: source.cukieSnapshot.evidenceHash,
      },
    });
    await expect(service.recordWeeklyGameSource(source, new Date("2026-08-20T12:01:00Z")))
      .resolves.toMatchObject({ sessionId: source.sessionId, payloadHash: expect.any(String) });
    await expect(service.recordWeeklyGameSource(
      { ...source, status: "forfeited", outcome: "abandoned" },
      new Date("2026-08-20T12:01:00Z"),
    )).rejects.toThrow(/settled/);
    expect(repository.sources.size).toBe(1);
  });

  it("cierra el dia desde sources reservados reconciliados sin remint de los pagos weekly", async () => {
    const repository = new MemoryAccountingRepository();
    repository.dailyLines = [{
      sourceId: "game-session:1",
      sourceTotalRaw: raw(10),
      allocations: [{
        allocationId: "allocation:1",
        walletNormalized: wallet(1),
        category: "player",
        amountRaw: "7500000000000000000",
      }],
      accruals: [
        { accrualId: "accrual:weekly", category: "weekly_prize_pool", amountRaw: raw(2) },
        { accrualId: "accrual:ambassador", category: "ambassador_program_pending", amountRaw: "500000000000000000" },
      ],
    }];
    const service = new RewardAccountingService(async (work) => work(repository));
    const result = await service.closeDailyFromReservedSources({
      dayId: "2026-08-20", ruleVersion: "reward-v3", destinations: DESTINATIONS,
      sealedAt: new Date("2026-08-21T00:00:00Z"),
    });
    expect(result.sourceReservedRaw).toBe(raw(10));
    expect(result.sourceIds).toEqual(["game-session:1"]);
    expect(result.buckets).toMatchObject({
      playersRaw: "7500000000000000000",
      weeklyPrizeRaw: raw(2),
      ambassadorOrdinaryRaw: "0",
      ambassadorWeeklyRaw: "100000000000000000",
    });
    expect(result.conservationRaw).toBe(DAILY_REWARD_EMISSION_RAW);
  });
});
