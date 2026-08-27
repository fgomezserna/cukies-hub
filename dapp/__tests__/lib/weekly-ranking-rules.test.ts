import {
  buildCurrentWeeklyRankingRule,
  calculateNextWeeklyRank,
  calculatePerformanceBps,
  CURRENT_WEEKLY_RANKING_TIERS,
} from "@/lib/uki-economy/ranking/rules";

const MONDAY = new Date("2026-07-06T00:00:00.000Z");

function rule() {
  return buildCurrentWeeklyRankingRule({
    version: "ranking-v1",
    activeFrom: MONDAY,
    now: MONDAY,
  });
}

describe("weekly arena ranking rules", () => {
  it("materializa exactamente la tabla #1-#9 aprobada", () => {
    expect(rule()).toMatchObject({
      initialRank: 5,
      minPromotionGames: 20,
      minDemotionGames: 10,
      maxWeeklyMovement: 2,
      performanceBasis: "sum_capped_score_over_sum_score_cap",
      eligibleCreditBucket: "pool",
      tiers: CURRENT_WEEKLY_RANKING_TIERS,
    });
  });

  it("calcula conversion lineal agregada en bps enteros sin reserva fija", () => {
    expect(calculatePerformanceBps("1000", "3000")).toBe(3333);
    expect(calculatePerformanceBps("9000", "12000")).toBe(7500);
    expect(() => calculatePerformanceBps("3001", "3000")).toThrow(/supera/);
  });

  it("aplica umbrales estrictos y no asciende ni desciende en igualdad", () => {
    const current = rule();
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 20, performanceBps: 5000, rule: current })).toBe(5);
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 10, performanceBps: 3000, rule: current })).toBe(5);
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 20, performanceBps: 5001, rule: current })).toBe(4);
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 10, performanceBps: 2999, rule: current })).toBe(6);
  });

  it("mueve escalonadamente como maximo dos posiciones", () => {
    const current = rule();
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 20, performanceBps: 7001, rule: current })).toBe(3);
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 10, performanceBps: 999, rule: current })).toBe(7);
    expect(calculateNextWeeklyRank({ appliedRank: 3, gamesPlayed: 20, performanceBps: 10_000, rule: current })).toBe(1);
    expect(calculateNextWeeklyRank({ appliedRank: 7, gamesPlayed: 10, performanceBps: 0, rule: current })).toBe(9);
  });

  it("respeta minimos separados de 20 partidas para subir y 10 para bajar", () => {
    const current = rule();
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 19, performanceBps: 10_000, rule: current })).toBe(5);
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 9, performanceBps: 0, rule: current })).toBe(5);
    expect(calculateNextWeeklyRank({ appliedRank: 5, gamesPlayed: 10, performanceBps: 10_000, rule: current })).toBe(5);
  });
});
