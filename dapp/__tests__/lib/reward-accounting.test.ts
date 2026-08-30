import {
  assertWeeklyPrizeAccountingIntegrity,
  calculateDailyRewardSettlement,
  calculatePoolTranche,
  calculateWeeklyPrize,
  excludeSeikuFromCukiePool,
  reserveForCredits,
  sealDailyRewardAccounting,
  selectStoredWeeklyPoolTranche,
  selectWeeklyBestResults,
  splitIntoSevenTranches,
  splitUndistributed,
  weeklySettlementSchedule,
} from "@/lib/uki-economy/rewards/accounting";
import { calculateSettlementRewardAllocations } from "@/lib/uki-economy/rewards/calculation";
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
const RULE_CONFIG_HASH = "a".repeat(64);
const CURRENT_REWARD_RULE = testRewardRule({
  version: "reward-v3",
  activeFrom: new Date("2026-08-17T14:00:00.000Z"),
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
const PAYOUT_AT = new Date("2026-08-24T17:00:00.000Z");
const DAILY_ACCOUNTING_IDS = Array.from({ length: 7 }, (_, index) =>
  `reward-daily:2026-08-${String(17 + index).padStart(2, "0")}`);
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
function settledResult(
  input: Pick<WeeklyGameResult, "wallet" | "gameId" | "scoreRaw" | "playedAt">
    & Partial<Pick<WeeklyGameResult, "sessionId">>,
): WeeklyGameResult {
  const suffix = input.gameId.replace(/[^A-Za-z0-9]/g, "-");
  return {
    ...input,
    sessionId: input.sessionId ?? `session-${suffix}`,
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
      ruleConfigHash: RULE_CONFIG_HASH,
      emissionRaw: DAILY_REWARD_EMISSION_RAW,
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
      ruleConfigHash: RULE_CONFIG_HASH,
      emissionRaw: DAILY_REWARD_EMISSION_RAW,
      buckets: {
        playersRaw: raw(500_001), creditPoolRaw: "0", cukiePoolRaw: "0",
        ambassadorOrdinaryRaw: "0", weeklyPrizeRaw: "0", ambassadorWeeklyRaw: "0",
      },
      destinations: DESTINATIONS,
      sealedAt: new Date(),
    })).toThrow(/excede/);
  });

  it("aplica 600000 UKI solo cuando la regla diaria versionada los define", () => {
    const base = CURRENT_REWARD_RULE;
    const rule = testRewardRule({
      _id: "reward-allocations:v600k",
      version: "reward-v600k",
      emissionBudget: {
        ...base.emissionBudget,
        dailyCapRaw: raw(600_000),
        lifetimeCapRaw: raw(450_000_000),
        unusedDailyCapacity: "materialize_undistributed",
      },
      undistributedBps: CURRENT_REWARD_RULE.undistributedBps,
      destinations: CURRENT_REWARD_RULE.destinations,
    });
    const result = calculateDailyRewardSettlement({
      dayId: "2026-08-20",
      rule,
      sourceLines: [],
      creditContributors: [],
      cukieOriginalParticipants: [],
      cukieSecondPlusParticipants: [],
      sealedAt: new Date("2026-08-21T16:00:00.000Z"),
    });

    expect(result.emissionRaw).toBe(raw(600_000));
    expect(result.conservationRaw).toBe(raw(600_000));
    expect(result.undistributed).toEqual({
      totalRaw: raw(600_000),
      treasuryRaw: raw(480_000),
      marketingDevelopmentRaw: raw(60_000),
      supplyReductionRaw: raw(60_000),
    });
  });

  it("combina ordinario + tramo previo antes de garantizar 0.75 y calcula el 5% sobre el pago final", () => {
    const rule = CURRENT_REWARD_RULE;
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
    expect(result.ruleConfigHash).toBe(rule.configHash);
    const systemRaw = (category: "treasury" | "marketing_development" | "supply_reduction", fundingMode: "daily_emission" | "reserved_no_mint") =>
      result.allocations
        .filter((allocation) => allocation.category === category && allocation.fundingMode === fundingMode)
        .reduce((sum, allocation) => sum + BigInt(allocation.amountRaw), BigInt(0));
    expect(systemRaw("treasury", "daily_emission")).toBe(BigInt(result.undistributed.treasuryRaw));
    expect(systemRaw("marketing_development", "daily_emission")).toBe(
      BigInt(result.undistributed.marketingDevelopmentRaw),
    );
    expect(systemRaw("supply_reduction", "daily_emission")).toBe(
      BigInt(result.undistributed.supplyReductionRaw),
    );
    expect(systemRaw("treasury", "reserved_no_mint")).toBe(
      BigInt(result.priorReservedUndistributed.treasuryRaw),
    );
  });

  it("rechaza la regla historica 80/5/5/10 antes de calcular un cierre", () => {
    expect(() => calculateDailyRewardSettlement({
      dayId: "2026-08-18",
      rule: testRewardRule(),
      sourceLines: [],
      creditContributors: [],
      cukieOriginalParticipants: [],
      cukieSecondPlusParticipants: [],
      sealedAt: new Date("2026-08-19T16:00:00.000Z"),
    })).toThrow(/80\/10\/10/);
  });

  it("recoge todos los restos sin beneficiario y separa emision diaria de reservas previas", () => {
    const result = calculateDailyRewardSettlement({
      dayId: "2026-08-18",
      rule: CURRENT_REWARD_RULE,
      sourceLines: [{
        sourceId: "game-session:all-residues",
        sourceTotalRaw: raw(10),
        allocations: [],
        accruals: [
          { accrualId: "credit", category: "credit_pool_weekly", amountRaw: raw(2) },
          { accrualId: "cukie-original", category: "cukie_pool_original_weekly", amountRaw: raw(3) },
          { accrualId: "cukie-second", category: "cukie_pool_second_plus_weekly", amountRaw: raw(2) },
          { accrualId: "amb-ordinary", category: "ambassador_ordinary_pending", amountRaw: raw(1) },
          { accrualId: "weekly", category: "weekly_prize_pool", amountRaw: raw(1) },
          { accrualId: "amb-weekly", category: "ambassador_weekly_pending", amountRaw: raw(1) },
        ],
      }],
      creditContributors: [],
      cukieOriginalParticipants: [],
      cukieSecondPlusParticipants: [],
      priorWeekly: {
        weeklyAccountingId: "reward-weekly:2026-W33",
        creditPoolRaw: raw(7),
        creditPoolAmbassadorRaw: raw(1),
        cukiePoolOriginalRaw: raw(5),
        cukiePoolOriginalAmbassadorRaw: raw(1),
        cukiePoolSecondPlusRaw: raw(3),
        cukiePoolSecondPlusAmbassadorRaw: raw(1),
      },
      sealedAt: new Date("2026-08-19T16:00:00.000Z"),
    });
    expect(result.sourceReservedRaw).toBe(raw(10));
    expect(result.buckets).toMatchObject({
      creditPoolRaw: "0",
      cukiePoolRaw: "0",
      ambassadorOrdinaryRaw: "0",
      weeklyPrizeRaw: raw(1),
      ambassadorWeeklyRaw: raw(1),
    });
    expect(result.undistributed.totalRaw).toBe(raw(499_998));
    expect(result.priorReservedUndistributed.totalRaw).toBe(raw(18));
    expect(result.allocations.every((allocation) => [
      "treasury", "marketing_development", "supply_reduction",
    ].includes(allocation.category))).toBe(true);
    expect(result.allocations.filter((allocation) => allocation.fundingMode === "daily_emission"))
      .toHaveLength(3);
    expect(result.allocations.filter((allocation) => allocation.fundingMode === "reserved_no_mint"))
      .toHaveLength(3);
  });

  it("cierra el reparto diario V4 completo sin perder ni duplicar UKI", () => {
    const rule = testRewardRule({
      _id: "reward_allocations:rewards-staging-test-v4",
      version: "rewards-staging-test-v4",
      activeFrom: new Date("2026-08-10T00:00:00.000Z"),
      runCredits: {
        unitScale: 10,
        totalUnits: 100,
        weeklyReserveUnits: 20,
        ambassadorReserveUnits: 5,
        ambassadorOrdinaryUnits: 4,
        ambassadorWeeklyUnits: 1,
        convertibleUnits: 75,
      },
      settlementBps: {
        poolCredits: 5_000,
        poolCukieWithOwnCredits: 5_000,
        poolCukieWithPoolCredits: 2_500,
      },
      rankingPlayerBps: {
        "1": 10_000,
        "2": 9_000,
        "3": 8_000,
        "4": 7_000,
        "5": 6_000,
        "6": 5_000,
        "7": 4_000,
        "8": 3_000,
        "9": 2_000,
      },
      creditPoolDaily: {
        sourceShareBps: 10_000,
        floorEnabled: true,
        floorCreditsStep: 10,
        floorAmountRaw: "750000000000000000",
      },
      emissionBudget: {
        programStartsAt: new Date("2026-08-10T14:00:00.000Z"),
        dayBoundarySecondUtc: 14 * 60 * 60,
        lateReservationGraceSeconds: 86_400,
        dailyCapRaw: DAILY_REWARD_EMISSION_RAW,
        lifetimeCapRaw: raw(450_000_000),
        unusedDailyCapacity: "materialize_undistributed",
        overflowPolicy: "block",
      },
      cukiePool: {
        cumulativeTierCount: 6,
        cumulativeTierBps: [4_500, 2_000, 1_500, 1_200, 700, 100],
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
    const scenarios = [
      { sourceId: "session:own-own", playerWallet: wallet(1), creditSource: "own", cukieSource: "own", ranking: null },
      { sourceId: "session:pool-own", playerWallet: wallet(2), creditSource: "pool", cukieSource: "own", ranking: 1 },
      { sourceId: "session:own-original", playerWallet: wallet(3), creditSource: "own", cukieSource: "pool_original", ranking: null },
      { sourceId: "session:pool-gen2", playerWallet: wallet(4), creditSource: "pool", cukieSource: "pool_second_plus", ranking: 1 },
      { sourceId: "session:own-seiku", playerWallet: wallet(5), creditSource: "own", cukieSource: "seiku", ranking: null },
    ] as const;
    const sourceLines: DailyRewardSourceLine[] = scenarios.map((scenario) => {
      const settlement = calculateSettlementRewardAllocations(rule, {
        periodId: "2026-W34",
        sourceId: scenario.sourceId,
        playerWallet: scenario.playerWallet,
        grossConvertedRaw: "7500000000000000000",
        maxConvertibleRaw: "7500000000000000000",
        creditCostUnits: 100,
        weeklyReserveUnits: 20,
        creditSource: scenario.creditSource,
        cukieSource: scenario.cukieSource,
        ranking: scenario.ranking,
      });
      return {
        sourceId: scenario.sourceId,
        sourceTotalRaw: settlement.totals.sourceTotalRaw,
        allocations: settlement.allocations.map((allocation, index) => ({
          allocationId: `${scenario.sourceId}:allocation:${index}`,
          ...allocation,
        })),
        accruals: settlement.accruals.map((accrual, index) => ({
          accrualId: `${scenario.sourceId}:accrual:${index}`,
          ...accrual,
        })),
      };
    });
    const creditContributors = [
      { walletNormalized: wallet(101), units: 10, ambassadorWalletNormalized: null },
      { walletNormalized: wallet(102), units: 30, ambassadorWalletNormalized: null },
    ];
    const cukieOriginalParticipants = [
      { walletNormalized: wallet(201), units: 1, rarityLevel: 5, ambassadorWalletNormalized: null },
    ];
    const cukieSecondPlusParticipants = [
      { walletNormalized: wallet(202), units: 1, rarityLevel: 5, ambassadorWalletNormalized: null },
    ];
    const input = {
      dayId: "2026-08-20",
      rule,
      sourceLines,
      creditContributors,
      cukieOriginalParticipants,
      cukieSecondPlusParticipants,
      sealedAt: new Date("2026-08-21T16:00:00.000Z"),
    };
    const result = calculateDailyRewardSettlement(input);
    const sumCategory = (category: string) => result.allocations
      .filter((allocation) => allocation.category === category)
      .reduce((sum, allocation) => sum + BigInt(allocation.amountRaw), BigInt(0));

    expect(sourceLines.map((line) => line.sourceTotalRaw)).toEqual(Array(5).fill(raw(10)));
    expect(result.buckets).toEqual({
      playersRaw: "20625000000000000000",
      creditPoolRaw: "7500000000000000000",
      cukiePoolRaw: "5625000000000000000",
      ambassadorOrdinaryRaw: "0",
      weeklyPrizeRaw: raw(10),
      ambassadorWeeklyRaw: "500000000000000000",
    });
    expect(sumCategory("player")).toBe(BigInt("20625000000000000000"));
    expect(sumCategory("credit_pool")).toBe(BigInt("7500000000000000000"));
    expect(sumCategory("cukie_pool_original")).toBe(BigInt("3750000000000000000"));
    expect(sumCategory("cukie_pool_second_plus")).toBe(BigInt("1875000000000000000"));
    expect(result.sourceReservedRaw).toBe(raw(50));
    expect(result.capacityMaterializedRaw).toBe(raw(499_950));
    expect(result.topupRaw).toBe("0");
    expect(result.undistributed).toEqual({
      totalRaw: "499955750000000000000000",
      treasuryRaw: "399964600000000000000000",
      marketingDevelopmentRaw: "49995575000000000000000",
      supplyReductionRaw: "49995575000000000000000",
    });
    expect(result.conservationRaw).toBe(DAILY_REWARD_EMISSION_RAW);

    const replay = calculateDailyRewardSettlement({
      ...input,
      sourceLines: [...sourceLines].reverse(),
      creditContributors: [...creditContributors].reverse(),
      cukieOriginalParticipants: [...cukieOriginalParticipants].reverse(),
      cukieSecondPlusParticipants: [...cukieSecondPlusParticipants].reverse(),
    });
    expect(replay).toEqual(result);
  });

  it("consume el mínimo versionado y permite desactivarlo sin conservar el 0.75 hardcodeado", () => {
    const close = (
      rule: ReturnType<typeof testRewardRule>,
      contributors: Array<{ walletNormalized: string; units: number; ambassadorWalletNormalized: null }>,
    ) => calculateDailyRewardSettlement({
      dayId: "2026-08-18",
      rule,
      sourceLines: [{
        sourceId: "game-session:configured-floor",
        sourceTotalRaw: "100000000000000000",
        allocations: [],
        accruals: [{
          accrualId: "configured-credit",
          category: "credit_pool_weekly",
          amountRaw: "100000000000000000",
        }],
      }],
      creditContributors: contributors,
      cukieOriginalParticipants: [],
      cukieSecondPlusParticipants: [],
      sealedAt: new Date("2026-08-19T16:00:00.000Z"),
    });
    const configured = testRewardRule({
      version: "reward-floor-20-v1",
      undistributedBps: CURRENT_REWARD_RULE.undistributedBps,
      destinations: CURRENT_REWARD_RULE.destinations,
      creditPoolDaily: {
        sourceShareBps: 10_000,
        floorEnabled: true,
        floorCreditsStep: 20,
        floorAmountRaw: "1250000000000000000",
      },
    });
    const configuredResult = close(configured, [{
      walletNormalized: wallet(50),
      units: 20,
      ambassadorWalletNormalized: null,
    }]);
    expect(configuredResult.buckets.creditPoolRaw).toBe("1250000000000000000");
    expect(configuredResult.topupRaw).toBe("1150000000000000000");
    expect(configuredResult.allocations.find((item) => item.category === "credit_pool"))
      .toMatchObject({
        walletNormalized: wallet(50),
        amountRaw: "1250000000000000000",
      });

    const disabled = testRewardRule({
      version: "reward-floor-disabled-v1",
      undistributedBps: CURRENT_REWARD_RULE.undistributedBps,
      destinations: CURRENT_REWARD_RULE.destinations,
      creditPoolDaily: {
        sourceShareBps: 10_000,
        floorEnabled: false,
        floorCreditsStep: 10,
        floorAmountRaw: "0",
      },
    });
    const disabledResult = close(disabled, [{
      walletNormalized: wallet(51),
      units: 10,
      ambassadorWalletNormalized: null,
    }]);
    expect(disabledResult.buckets.creditPoolRaw).toBe("100000000000000000");
    expect(disabledResult.topupRaw).toBe("0");

    expect(() => close(configured, [
      { walletNormalized: wallet(52), units: 10, ambassadorWalletNormalized: null },
      { walletNormalized: wallet(53), units: 10, ambassadorWalletNormalized: null },
    ])).toThrow(/Cada aportacion.*multiplo de 20/);
  });
});

describe("weekly prize", () => {
  function weeklyResults(): WeeklyGameResult[] {
    return Array.from({ length: 35 }, (_, index) =>
      Array.from({ length: 10 }, (__, game) => settledResult({
        wallet: wallet(index + 1),
        gameId: `game-${index + 1}-${game}`,
        scoreRaw: String(1_000 - index - game),
        playedAt: new Date(Date.UTC(2026, 7, 18 + Math.floor(game / 2), 10 + game % 2, index)),
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

  it("desempata de forma estable aunque score, fecha y gameId sean identicos", () => {
    const common = {
      wallet: wallet(1), gameId: "same-game", scoreRaw: "777",
      playedAt: new Date("2026-08-20T11:00:00.000Z"),
    };
    const lateSession = settledResult({ ...common, sessionId: "session-z" });
    const earlySession = settledResult({ ...common, sessionId: "session-a" });
    expect(selectWeeklyBestResults([lateSession, earlySession])[0].best.sessionId)
      .toBe("session-a");
    expect(selectWeeklyBestResults([earlySession, lateSession])[0].best.sessionId)
      .toBe("session-a");
  });

  it("reparte 60/30/10, 10 loterias auditables y conserva el bote", () => {
    const result = calculateWeeklyPrize({
      periodId: "2026-W34",
      ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash,
      potRaw: "10000",
      ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS,
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
    expect(result.sourceDailyAccountingIds).toEqual(DAILY_ACCOUNTING_IDS);
    expect(result.winners.reduce((sum, winner) => sum + winner.shareBps, 0)).toBe(10_000);
    expect(BigInt(result.allocatedRaw) + BigInt(result.undistributed.totalRaw)).toBe(BigInt("10000"));
    expect(result.poolReservations.map((item) => item.pool)).toEqual([
      "credit", "cukie_original",
    ]);
    for (const reservation of result.poolReservations) {
      expect(reservation.tranches).toHaveLength(7);
      expect(reservation.tranches.map((tranche) => tranche.scheduledAt))
        .toEqual(result.poolTrancheSchedule);
      expect(reservation.tranches.reduce((sum, tranche) => sum + BigInt(tranche.amountRaw), BigInt(0)))
        .toBe(BigInt(reservation.amountRaw));
      expect(reservation.tranches.reduce(
        (sum, tranche) => sum + BigInt(tranche.ambassadorReserveRaw),
        BigInt(0),
      )).toBe(BigInt(reservation.ambassadorReserveRaw));
    }
    expect(BigInt(result.ambassadorAllocatedRaw)
      + BigInt(result.ambassadorDeferredRaw)
      + BigInt(result.ambassadorUndistributed.totalRaw)).toBe(BigInt("500"));
    expect(result.ambassadorPayouts).toHaveLength(35);
    expect(result.conservationRaw).toBe("10500");
    expect(result.ruleConfigHash).toBe(CURRENT_REWARD_RULE.configHash);
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
      periodId: "2026-W34", ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash, potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: [...DAILY_ACCOUNTING_IDS].reverse(),
      results: weeklyResults().reverse(), lotteryEntropy: ENTROPY, destinations: DESTINATIONS,
      payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
    });
    expect(replay.winners).toEqual(result.winners);
    expect(replay.payloadHash).toBe(result.payloadHash);

    const firstStored = selectStoredWeeklyPoolTranche(result, result.poolTrancheSchedule[0]);
    expect(firstStored).toMatchObject({
      weeklyAccountingId: "reward-weekly:2026-W34",
      creditPoolRaw: result.poolReservations[0].tranches[0].amountRaw,
      cukiePoolOriginalRaw: result.poolReservations[1].tranches[0].amountRaw,
    });
    const tampered: WeeklyPrizeAccounting = {
      ...result,
      poolReservations: result.poolReservations.map((reservation, index) => index === 0
        ? {
          ...reservation,
          tranches: reservation.tranches.map((tranche, trancheIndex) => trancheIndex === 0
            ? { ...tranche, amountRaw: "999" }
            : tranche),
        }
        : reservation),
    };
    expect(() => assertWeeklyPrizeAccountingIntegrity(tampered)).toThrow(/canonico|conservan|payload sellado/);
  });

  it("falla cerrado con fuentes, periodo u horarios no canonicos", () => {
    const base = {
      periodId: "2026-W34",
      ruleVersion: "reward-v3",
      ruleConfigHash: RULE_CONFIG_HASH,
      potRaw: "10000",
      ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS,
      results: weeklyResults(),
      destinations: DESTINATIONS,
      lotteryEntropy: ENTROPY,
      payoutAt: PAYOUT_AT,
      sealedAt: ENTROPY.confirmedAt,
    };
    expect(() => calculateWeeklyPrize({
      ...base,
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS.slice(0, 6),
    })).toThrow(/siete cierres diarios canonicos/);
    expect(() => calculateWeeklyPrize({
      ...base,
      sourceDailyAccountingIds: [...DAILY_ACCOUNTING_IDS.slice(0, 6), "reward-daily:2026-08-24"],
    })).toThrow(/siete cierres diarios canonicos/);
    expect(() => calculateWeeklyPrize({ ...base, periodId: "2026-W35" }))
      .toThrow(/periodId/);
    expect(() => calculateWeeklyPrize({
      ...base,
      payoutAt: new Date("2026-08-24T17:00:01.000Z"),
    })).toThrow(/17:00:00.000/);
    expect(() => calculateWeeklyPrize({
      ...base,
      sealedAt: new Date("2026-08-24T17:00:30.000Z"),
    })).toThrow(/confirmar la entropia/);
    expect(() => calculateWeeklyPrize({
      ...base,
      results: [settledResult({
        wallet: wallet(1), gameId: "late-source", scoreRaw: "100",
        playedAt: new Date("2026-08-24T14:00:00.000Z"),
      })],
    })).toThrow(/no pertenece al periodo/);
  });

  it("falla cerrado sin bloque canonico posterior al lunes 17", () => {
    expect(() => calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash, potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS,
      results: weeklyResults(), destinations: DESTINATIONS, payoutAt: PAYOUT_AT, sealedAt: PAYOUT_AT,
    })).toThrow(/pending_entropy/);
    expect(() => calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash, potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS,
      results: weeklyResults(), destinations: DESTINATIONS,
      lotteryEntropy: { ...ENTROPY, blockTimestamp: new Date("2026-08-24T16:59:59Z") },
      payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
    })).toThrow(/pending_entropy/);
  });

  it("manda puestos y loterias ausentes a 80/10/10", () => {
    const result = calculateWeeklyPrize({
      periodId: "2026-W34", ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash, potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS,
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
      periodId: "2026-W34", ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash, potRaw: "10000", ambassadorReserveRaw: "500",
      sourceDailyAccountingIds: DAILY_ACCOUNTING_IDS, results: [source],
      lotteryEntropy: ENTROPY, destinations: DESTINATIONS,
      payoutAt: PAYOUT_AT, sealedAt: ENTROPY.confirmedAt,
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
    const rule = testRewardRule();
    const tranche = calculatePoolTranche({
      rule,
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
    expect(tranche.ruleVersion).toBe(rule.version);
    expect(tranche.ruleConfigHash).toBe(rule.configHash);
    expect(() => calculatePoolTranche({
      rule,
      periodId: "2026-W34", tranche: 0, participantWallet: wallet(1), ambassadorWallet: wallet(1),
      credits: 10, ordinaryRaw: "0", priorPeriodRaw: "0",
      ordinarySourceId: "daily:2026-08-18", priorPeriodSourceId: "weekly:2026-W33",
      scheduledAt: PAYOUT_AT, sealedAt: PAYOUT_AT,
    })).toThrow(/autorreferencia/);
  });

  it("usa el mínimo versionado también al sellar un tramo del pool", () => {
    const configured = testRewardRule({
      version: "reward-tranche-floor-20-v1",
      creditPoolDaily: {
        sourceShareBps: 10_000,
        floorEnabled: true,
        floorCreditsStep: 20,
        floorAmountRaw: "1250000000000000000",
      },
    });
    const tranche = calculatePoolTranche({
      rule: configured,
      periodId: "2026-W34",
      tranche: 0,
      participantWallet: wallet(3),
      credits: 20,
      ordinaryRaw: "100000000000000000",
      priorPeriodRaw: "0",
      ordinarySourceId: "daily:2026-08-18",
      priorPeriodSourceId: "weekly:2026-W33",
      scheduledAt: new Date("2026-08-18T16:00:00Z"),
      sealedAt: new Date("2026-08-18T16:00:01Z"),
    });
    expect(tranche.guaranteedRaw).toBe("1250000000000000000");
    expect(tranche.paymentRaw).toBe("1250000000000000000");
    expect(tranche.topupRaw).toBe("1150000000000000000");
    expect(tranche).toMatchObject({
      ruleVersion: configured.version,
      ruleConfigHash: configured.configHash,
    });

    const disabled = testRewardRule({
      version: "reward-tranche-floor-disabled-v1",
      creditPoolDaily: {
        sourceShareBps: 10_000,
        floorEnabled: false,
        floorCreditsStep: 20,
        floorAmountRaw: "0",
      },
    });
    expect(calculatePoolTranche({
      rule: disabled,
      periodId: "2026-W34",
      tranche: 0,
      participantWallet: wallet(4),
      credits: 20,
      ordinaryRaw: "100000000000000000",
      priorPeriodRaw: "0",
      ordinarySourceId: "daily:2026-08-18",
      priorPeriodSourceId: "weekly:2026-W33",
      scheduledAt: new Date("2026-08-18T16:00:00Z"),
      sealedAt: new Date("2026-08-18T16:00:01Z"),
    })).toMatchObject({
      guaranteedRaw: "0",
      paymentRaw: "100000000000000000",
      topupRaw: "0",
    });
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
  rewardRule: ReturnType<typeof testRewardRule> = CURRENT_REWARD_RULE;
  findRewardRule = async () => this.rewardRule;
  materializeDailyCapacity: RewardAccountingRepository["materializeDailyCapacity"] = async () => ({
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
  findNextClosableRewardDay: RewardAccountingRepository["findNextClosableRewardDay"] = async () => null;
  listDailyAccounting = async (startsOn: string, endsBefore: string) => [...this.daily.values()]
    .filter((value) => value.dayId >= startsOn && value.dayId < endsBefore)
    .sort((left, right) => left.dayId.localeCompare(right.dayId));
  findFirstSafeLotteryEntropy = async () => ENTROPY;
  dailyReadiness = async () => ({
    unfinishedRuns: 0,
    missingRewardSources: 0,
    missingWeeklySources: 0,
  });
  listCreditContributors: RewardAccountingRepository["listCreditContributors"] = async () => [];
  listDailyAmbassadorSnapshots = async () => ({});
  listCukieParticipants: RewardAccountingRepository["listCukieParticipants"] = async () => [];
  findPriorWeeklyPoolTranche = async () => null;
}

describe("accounting persistence and runtime gates", () => {
  it("hace replay idempotente y bloquea payload distinto", async () => {
    const repository = new MemoryAccountingRepository();
    const service = new RewardAccountingService(async (work) => work(repository));
    const first = sealDailyRewardAccounting({
      dayId: "2026-08-20", ruleVersion: "reward-v3",
      ruleConfigHash: RULE_CONFIG_HASH,
      emissionRaw: DAILY_REWARD_EMISSION_RAW,
      buckets: { playersRaw: "1", creditPoolRaw: "0", cukiePoolRaw: "0", ambassadorOrdinaryRaw: "0", weeklyPrizeRaw: "0", ambassadorWeeklyRaw: "0" },
      destinations: DESTINATIONS, sealedAt: new Date("2026-08-21T00:00:00Z"),
    });
    await expect(service.sealDaily(first)).resolves.toEqual(first);
    await expect(service.sealDaily(first)).resolves.toEqual(first);
    await expect(service.sealDaily({ ...first, payloadHash: "f".repeat(64) })).rejects.toThrow(/payload distinto/);
    expect(repository.daily.size).toBe(1);
  });

  it("cierra el ciclo diario productivo con jugador, pools y capacidad no distribuida", async () => {
    const repository = new MemoryAccountingRepository();
    const dayId = "2026-08-20";
    const startsAt = new Date("2026-08-20T14:00:00.000Z");
    const settlement = calculateSettlementRewardAllocations(CURRENT_REWARD_RULE, {
      periodId: "2026-W34",
      sourceId: "game-session:daily-close",
      playerWallet: wallet(1),
      grossConvertedRaw: "7500000000000000000",
      maxConvertibleRaw: "7500000000000000000",
      creditCostUnits: 100,
      weeklyReserveUnits: 20,
      creditSource: "pool",
      cukieSource: "pool_original",
      ranking: 1,
    });
    repository.dailyLines = [{
      sourceId: "game-session:daily-close",
      sourceTotalRaw: settlement.totals.sourceTotalRaw,
      allocations: settlement.allocations.map((allocation, index) => ({
        allocationId: `daily-close:allocation:${index}`,
        ...allocation,
      })),
      accruals: settlement.accruals.map((accrual, index) => ({
        accrualId: `daily-close:accrual:${index}`,
        ...accrual,
      })),
    }];
    repository.findNextClosableRewardDay = async () => ({ dayId, startsAt });
    repository.materializeDailyCapacity = async () => ({
      _id: `reward-daily-capacity:${dayId}`,
      dayId,
      budgetDayId: startsAt.toISOString(),
      ruleVersion: CURRENT_REWARD_RULE.version,
      ruleConfigHash: CURRENT_REWARD_RULE.configHash,
      previousDailyRaw: raw(10),
      capacityMaterializedRaw: raw(499_990),
      resultingDailyRaw: DAILY_REWARD_EMISSION_RAW,
      previousLifetimeRaw: raw(10),
      resultingLifetimeRaw: DAILY_REWARD_EMISSION_RAW,
      payloadHash: "2".repeat(64),
      status: "sealed" as const,
      sealedAt: new Date("2026-08-21T16:00:00.000Z"),
    });
    repository.listCreditContributors = async () => [{
      walletNormalized: wallet(101),
      units: 10,
      ambassadorWalletNormalized: null,
    }];
    repository.listCukieParticipants = async (generation) => generation === "original"
      ? [{
          walletNormalized: wallet(201),
          units: 1,
          rarityLevel: 5,
          ambassadorWalletNormalized: null,
        }]
      : [];
    const service = new RewardAccountingService(async (work) => work(repository));

    const result = await service.closeNextDaily({
      ruleVersion: CURRENT_REWARD_RULE.version,
      now: new Date("2026-08-21T16:00:00.000Z"),
      includePriorWeekly: false,
    });

    expect(result).not.toBeNull();
    expect(result?.sourceReservedRaw).toBe(raw(10));
    expect(result?.capacityMaterializedRaw).toBe(raw(499_990));
    expect(result?.conservationRaw).toBe(DAILY_REWARD_EMISSION_RAW);
    expect(result?.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ walletNormalized: wallet(1), category: "player" }),
      expect.objectContaining({ walletNormalized: wallet(101), category: "credit_pool" }),
      expect.objectContaining({ walletNormalized: wallet(201), category: "cukie_pool_original" }),
      expect.objectContaining({ walletNormalized: DESTINATIONS.treasury, category: "treasury" }),
      expect.objectContaining({
        walletNormalized: DESTINATIONS.marketingDevelopment,
        category: "marketing_development",
      }),
      expect.objectContaining({
        walletNormalized: DESTINATIONS.supplyReduction,
        category: "supply_reduction",
      }),
    ]));
    expect(repository.daily.get(dayId)).toEqual(result);
  });

  it("cierra una semana solo con siete dias de la misma regla y detecta fuentes tardias", async () => {
    const repository = new MemoryAccountingRepository();
    repository.rewardRule = CURRENT_REWARD_RULE;
    for (let index = 0; index < 7; index += 1) {
      const dayId = `2026-08-${String(17 + index).padStart(2, "0")}`;
      const daily = sealDailyRewardAccounting({
        dayId,
        ruleVersion: "reward-v3",
        ruleConfigHash: repository.rewardRule.configHash,
        emissionRaw: repository.rewardRule.emissionBudget.dailyCapRaw,
        buckets: {
          playersRaw: "0",
          creditPoolRaw: "0",
          cukiePoolRaw: "0",
          ambassadorOrdinaryRaw: "0",
          weeklyPrizeRaw: "100",
          ambassadorWeeklyRaw: "5",
        },
        destinations: DESTINATIONS,
        sealedAt: new Date(`${dayId}T23:00:00.000Z`),
      });
      repository.daily.set(dayId, daily);
    }
    const service = new RewardAccountingService(async (work) => work(repository));
    const closeInput = {
      periodId: "2026-W34",
      startsAt: new Date("2026-08-17T14:00:00.000Z"),
      ruleVersion: "reward-v3",
      now: ENTROPY.confirmedAt,
    };
    const first = await service.closeWeeklyPeriod(closeInput);
    expect(first.sourceDailyAccountingIds).toEqual(DAILY_ACCOUNTING_IDS);
    expect(first.ruleConfigHash).toBe(repository.rewardRule.configHash);
    await expect(service.closeWeeklyPeriod(closeInput)).resolves.toEqual(first);

    const lateSource = {
      ...settledResult({
        wallet: wallet(1), gameId: "late-but-period-valid", scoreRaw: "500",
        playedAt: new Date("2026-08-20T10:00:00.000Z"),
      }),
      _id: "reward-weekly-game-source:session-late-but-period-valid",
      recordedAt: new Date("2026-08-24T17:02:00.000Z"),
      payloadHash: "6".repeat(64),
    };
    repository.sources.set(lateSource.sessionId, lateSource);
    await expect(service.closeWeeklyPeriod(closeInput)).rejects.toThrow(/payload distinto/);
    expect(repository.weekly.size).toBe(1);
  });

  it("rechaza un conjunto diario incompleto o con una version mezclada", async () => {
    const repository = new MemoryAccountingRepository();
    repository.rewardRule = CURRENT_REWARD_RULE;
    for (let index = 0; index < 7; index += 1) {
      const dayId = `2026-08-${String(17 + index).padStart(2, "0")}`;
      repository.daily.set(dayId, sealDailyRewardAccounting({
        dayId,
        ruleVersion: index === 6 ? "reward-v2" : "reward-v3",
        ruleConfigHash: repository.rewardRule.configHash,
        emissionRaw: repository.rewardRule.emissionBudget.dailyCapRaw,
        buckets: {
          playersRaw: "0", creditPoolRaw: "0", cukiePoolRaw: "0",
          ambassadorOrdinaryRaw: "0", weeklyPrizeRaw: "100", ambassadorWeeklyRaw: "5",
        },
        destinations: DESTINATIONS,
        sealedAt: new Date(`${dayId}T23:00:00.000Z`),
      }));
    }
    const service = new RewardAccountingService(async (work) => work(repository));
    await expect(service.closeWeeklyPeriod({
      periodId: "2026-W34",
      startsAt: new Date("2026-08-17T14:00:00.000Z"),
      ruleVersion: "reward-v3",
      now: ENTROPY.confirmedAt,
    })).rejects.toThrow(/siete cierres diarios canonicos de la misma regla/);
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
      dayId: "2026-08-20", ruleVersion: "reward-v3",
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
