import {
  calculateCreditPoolDistribution,
  calculateCukiePoolDistribution,
  calculateSettlementRewardAllocations,
  calculateUndistributedRewardAllocations,
} from "@/lib/uki-economy/rewards/calculation";
import { buildRewardRuleConfigHash } from "@/lib/uki-economy/rewards/rules";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";

const PLAYER = `0x${"a".repeat(40)}`;
const COMMON = `0x${"b".repeat(40)}`;
const GOAT = `0x${"c".repeat(40)}`;

function amountsByCategory(
  allocations: Array<{ category: string; amountRaw: string }>
) {
  return Object.fromEntries(allocations.map((item) => [item.category, item.amountRaw]));
}

describe("reward settlement calculations", () => {
  const rule = testRewardRule();
  const base = {
    periodId: "2026-W28",
    sourceId: "session:1",
    playerWallet: PLAYER,
    grossConvertedRaw: "7500",
    maxConvertibleRaw: "7500",
    creditCostUnits: 100,
    weeklyReserveUnits: 20,
  } as const;

  test.each([
    {
      label: "creditos pool + Cukie pool",
      creditSource: "pool" as const,
      cukieSource: "pool_original" as const,
      ranking: 1,
      expected: {
        credit_pool_weekly: "3750",
        cukie_pool_original_weekly: "1875",
        player: "1875",
      },
    },
    {
      label: "creditos pool + Cukie propio",
      creditSource: "pool" as const,
      cukieSource: "own" as const,
      ranking: 1,
      expected: { credit_pool_weekly: "3750", player: "3750" },
    },
    {
      label: "creditos propios + Cukie pool",
      creditSource: "own" as const,
      cukieSource: "pool_second_plus" as const,
      ranking: null,
      expected: { cukie_pool_second_plus_weekly: "3750", player: "3750" },
    },
    {
      label: "creditos propios + Cukie propio",
      creditSource: "own" as const,
      cukieSource: "own" as const,
      ranking: null,
      expected: { player: "7500" },
    },
    {
      label: "creditos propios + Seiku",
      creditSource: "own" as const,
      cukieSource: "seiku" as const,
      ranking: null,
      expected: { player: "3750", undistributed_pending: "3750" },
    },
    {
      label: "creditos pool + Seiku",
      creditSource: "pool" as const,
      cukieSource: "seiku" as const,
      ranking: 1,
      expected: {
        credit_pool_weekly: "3750",
        player: "1875",
        undistributed_pending: "1875",
      },
    },
  ])("reparte el caso $label", ({ expected, ...scenario }) => {
    const result = calculateSettlementRewardAllocations(rule, {
      ...base,
      ...scenario,
    });
    const claimableExpected = Object.fromEntries(
      Object.entries(expected).filter(([category]) => (
        !category.endsWith("_weekly") && category !== "undistributed_pending"
      )),
    );
    expect(amountsByCategory(result.allocations)).toEqual(claimableExpected);
    expect(Object.fromEntries(result.accruals.map((item) => [item.category, item.amountRaw])))
      .toEqual(expect.objectContaining({
        weekly_prize_pool: "2000",
        ambassador_program_pending: "500",
      }));
    for (const [category, amountRaw] of Object.entries(expected)) {
      if (category.endsWith("_weekly")) {
        expect(result.accruals).toContainEqual({ category, amountRaw });
      }
      if (category === "undistributed_pending") {
        expect(result.accruals).toContainEqual({ category, amountRaw });
      }
    }
    expect(
      result.allocations.reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))
      + result.accruals.reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))
    ).toBe(BigInt(10000));
  });

  it("aplica ranking solo al remanente del jugador con creditos del pool", () => {
    const result = calculateSettlementRewardAllocations(rule, {
      ...base,
      creditSource: "pool",
      cukieSource: "own",
      ranking: 5,
    });
    expect(amountsByCategory(result.allocations)).toEqual({
      player: "2250",
    });
    expect(result.accruals).toContainEqual({
      category: "undistributed_pending",
      amountRaw: "1500",
    });
    expect(result.totals.playerBaseRaw).toBe("3750");
    expect(result.totals.undistributedRaw).toBe("1500");
    expect(result.totals.weeklyPrizePoolRaw).toBe("2000");
    expect(result.totals.ambassadorProgramRaw).toBe("500");
    expect(result.totals.sourceTotalRaw).toBe("10000");
  });

  it("materializa 2 UKI semanales y 0.5 para embajadores incluso con score cero", () => {
    const result = calculateSettlementRewardAllocations(rule, {
      ...base,
      grossConvertedRaw: "0",
      creditSource: "own",
      cukieSource: "own",
      ranking: null,
    });
    expect(result.allocations).toEqual([]);
    expect(result.accruals).toEqual([
      { category: "weekly_prize_pool", amountRaw: "2000" },
      { category: "ambassador_program_pending", amountRaw: "500" },
      { category: "undistributed_pending", amountRaw: "7500" },
    ]);
    expect(result.totals).toMatchObject({
      grossConvertedRaw: "0",
      maxConvertibleRaw: "7500",
      unconvertedRaw: "7500",
      weeklyPrizePoolRaw: "2000",
      ambassadorProgramRaw: "500",
      undistributedRaw: "7500",
      sourceTotalRaw: "10000",
    });
  });

  it("V3 separa la reserva ambassador en 0.4 ordinario y 0.1 semanal", () => {
    const v3 = testRewardRule();
    v3.version = "rewards-v3";
    v3.runCredits = {
      ...v3.runCredits,
      ambassadorOrdinaryUnits: 4,
      ambassadorWeeklyUnits: 1,
    };
    v3.configHash = buildRewardRuleConfigHash(v3);

    const result = calculateSettlementRewardAllocations(v3, {
      ...base,
      creditSource: "own",
      cukieSource: "own",
      ranking: null,
    });

    expect(result.accruals).toEqual([
      { category: "weekly_prize_pool", amountRaw: "2000" },
      { category: "ambassador_ordinary_pending", amountRaw: "400" },
      { category: "ambassador_weekly_pending", amountRaw: "100" },
    ]);
    expect(result.totals).toMatchObject({
      ambassadorProgramRaw: "500",
      ambassadorOrdinaryRaw: "400",
      ambassadorWeeklyRaw: "100",
      sourceTotalRaw: "10000",
    });
  });

  it("conserva el presupuesto nominal con score parcial antes de repartirlo", () => {
    const result = calculateSettlementRewardAllocations(rule, {
      ...base,
      grossConvertedRaw: "3750",
      creditSource: "own",
      cukieSource: "own",
      ranking: null,
    });

    expect(result.allocations).toEqual([
      { walletNormalized: PLAYER, category: "player", amountRaw: "3750" },
    ]);
    expect(result.accruals).toEqual([
      { category: "weekly_prize_pool", amountRaw: "2000" },
      { category: "ambassador_program_pending", amountRaw: "500" },
      { category: "undistributed_pending", amountRaw: "3750" },
    ]);
    expect(result.totals).toMatchObject({
      grossConvertedRaw: "3750",
      maxConvertibleRaw: "7500",
      unconvertedRaw: "3750",
      playerRaw: "3750",
      undistributedRaw: "3750",
      sourceTotalRaw: "10000",
    });
    expect(
      result.allocations.reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))
      + result.accruals.reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))
    ).toBe(BigInt(10000));
  });

  it("rechaza ranking con creditos propios y una reserva semanal distinta de 2/10", () => {
    expect(() =>
      calculateSettlementRewardAllocations(rule, {
        ...base,
        creditSource: "own",
        cukieSource: "own",
        ranking: 5,
      })
    ).toThrow(/ranking no se aplica/);
    expect(() =>
      calculateSettlementRewardAllocations(rule, {
        ...base,
        weeklyReserveUnits: 19,
        creditSource: "pool",
        cukieSource: "own",
        ranking: 5,
      })
    ).toThrow(/reserva semanal/);
  });
});

describe("reward pool calculations", () => {
  it("reparte el UKI no distribuido 80/5/5/10 y conserva el total", () => {
    const result = calculateUndistributedRewardAllocations(testRewardRule(), "10000");
    expect(amountsByCategory(result.allocations)).toEqual({
      treasury: "8000",
      marketing: "500",
      development: "500",
      supply_reduction: "1000",
    });
    expect(result.accruals).toEqual([]);
    expect(result.allocations.reduce(
      (sum, allocation) => sum + BigInt(allocation.amountRaw),
      BigInt(0),
    )).toBe(BigInt(10000));
  });

  it("V3 reparte 80/10/10 con un unico destino marketing-desarrollo", () => {
    const v3 = testRewardRule();
    v3.version = "rewards-v3";
    v3.undistributedBps = {
      treasury: 8_000,
      marketing: 0,
      development: 0,
      marketingDevelopment: 1_000,
      supplyReduction: 1_000,
    };
    v3.destinations = {
      ...v3.destinations,
      marketingDevelopment: v3.destinations.marketing,
    };
    v3.configHash = buildRewardRuleConfigHash(v3);

    expect(amountsByCategory(
      calculateUndistributedRewardAllocations(v3, "10000").allocations,
    )).toEqual({
      treasury: "8000",
      marketing_development: "1000",
      supply_reduction: "1000",
    });
  });

  it("asigna el remainder raw de forma determinista sin perder unidades", () => {
    const first = calculateUndistributedRewardAllocations(testRewardRule(), "7");
    const replay = calculateUndistributedRewardAllocations(testRewardRule(), "7");

    expect(first).toEqual(replay);
    expect(amountsByCategory(first.allocations)).toEqual({
      treasury: "6",
      supply_reduction: "1",
    });
    expect(first.allocations.reduce(
      (sum, allocation) => sum + BigInt(allocation.amountRaw),
      BigInt(0),
    )).toBe(BigInt(7));
  });

  it("omite destinos al 0% sin invalidar un reparto que conserva el 100%", () => {
    const rule = testRewardRule({
      undistributedBps: {
        treasury: 10_000,
        marketing: 0,
        development: 0,
        supplyReduction: 0,
      },
    });
    rule.configHash = buildRewardRuleConfigHash(rule);

    expect(calculateUndistributedRewardAllocations(rule, "7")).toMatchObject({
      allocations: [{
        walletNormalized: rule.destinations.treasury,
        category: "treasury",
        amountRaw: "7",
      }],
      accruals: [],
      totalRaw: "7",
    });
  });

  it("activa el floor de 0.75 por cada 10 solo si la regla lo declara", () => {
    const floorRule = testRewardRule({
      creditPoolDaily: {
        sourceShareBps: 2_000,
        floorEnabled: true,
        floorCreditsStep: 10,
        floorAmountRaw: "75",
      },
    });
    floorRule.configHash = buildRewardRuleConfigHash(floorRule);
    const floor = calculateCreditPoolDistribution(floorRule, {
      sourcePoolRaw: "100",
      fundingAvailableRaw: "300",
      contributors: [
        { walletAddress: COMMON, credits: 10 },
        { walletAddress: GOAT, credits: 20 },
      ],
    });
    expect(floor.totals).toMatchObject({
      proportionalRaw: "20",
      floorRaw: "225",
      distributionRaw: "225",
      floorApplied: true,
    });
    expect(floor.allocations.map((item) => item.amountRaw)).toEqual(["75", "150"]);

    const noFloorRule = testRewardRule({
      creditPoolDaily: {
        sourceShareBps: 2_000,
        floorEnabled: false,
        floorCreditsStep: 10,
        floorAmountRaw: "0",
      },
    });
    noFloorRule.configHash = buildRewardRuleConfigHash(noFloorRule);
    const noFloor = calculateCreditPoolDistribution(noFloorRule, {
      sourcePoolRaw: "100",
      fundingAvailableRaw: "300",
      contributors: [
        { walletAddress: COMMON, credits: 10 },
        { walletAddress: GOAT, credits: 20 },
      ],
    });
    expect(noFloor.totals.distributionRaw).toBe("20");
  });

  it("reparte proporcionalmente con remainder determinista y conserva el total", () => {
    const rule = testRewardRule({
      creditPoolDaily: {
        sourceShareBps: 2_000,
        floorEnabled: true,
        floorCreditsStep: 10,
        floorAmountRaw: "75",
      },
    });
    rule.configHash = buildRewardRuleConfigHash(rule);
    const result = calculateCreditPoolDistribution(rule, {
      sourcePoolRaw: "2000",
      fundingAvailableRaw: "400",
      contributors: [
        { walletAddress: COMMON, credits: 10 },
        { walletAddress: GOAT, credits: 20 },
      ],
    });
    expect(result.allocations.map((item) => item.amountRaw)).toEqual(["133", "267"]);
    expect(result.totals.distributionRaw).toBe("400");
  });

  it("aplica seis tramos acumulativos y deja los tramos sin elegibles como pending", () => {
    const rule = testRewardRule();
    const result = calculateCukiePoolDistribution(rule, {
      generation: "original",
      sourcePoolRaw: "60",
      participants: [
        { walletAddress: COMMON, rarityLevel: 0, units: 1 },
        { walletAddress: GOAT, rarityLevel: 5, units: 1 },
      ],
    });
    const byWallet = Object.fromEntries(
      result.allocations.map((item) => [item.walletNormalized, item.amountRaw])
    );
    expect(byWallet[COMMON]).toBe("14");
    expect(byWallet[GOAT]).toBe("46");
    expect(result.totals.tierAmountsRaw).toEqual(["27", "12", "9", "7", "4", "1"]);

    const carry = calculateCukiePoolDistribution(rule, {
      generation: "second_plus",
      sourcePoolRaw: "60",
      participants: [{ walletAddress: COMMON, rarityLevel: 0, units: 1 }],
    });
    expect(carry.totals).toMatchObject({ distributedRaw: "27", carriedRaw: "33" });
    expect(carry.accruals).toEqual([
      { category: "undistributed_pending", amountRaw: "33" },
    ]);
  });
});
