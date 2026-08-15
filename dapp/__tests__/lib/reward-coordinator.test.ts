jest.mock("@/lib/indexer-db/mongodb", () => ({
  withEconomyTransaction: jest.fn(),
}));

import {
  assertSettlementResourceBindings,
  assertSettlementRewardPeriod,
  RewardCalculationCoordinator,
  type loadSettlementRewardSnapshot,
} from "@/lib/uki-economy/rewards/coordinator";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";
import type { RewardAllocationService } from "@/lib/uki-economy/rewards/service";
import { stableGameEconomyHash } from "@/lib/uki-economy/game-economy/rules";
import type { GameEconomySession } from "@/lib/uki-economy/game-economy/types";
import type { CreditReservation } from "@/lib/uki-economy/credits/types";
import type { CukiePoolAssignment } from "@/lib/uki-economy/cukie-pool/types";

const NOW = new Date("2026-07-10T12:00:00.000Z");
const PLAYER = `0x${"a".repeat(40)}`;

function resourceFixture() {
  const expiresAt = new Date("2026-07-10T12:10:00.000Z");
  const credit = {
    reservationId: "credit-reservation:canonical",
    sessionId: "session:canonical",
    walletNormalized: PLAYER,
    costCode: "arena:start",
    ruleVersion: "credits-v1",
    ruleConfigHash: "c".repeat(64),
    expectedRuleVersion: "credits-v1",
    expectedRuleConfigHash: "c".repeat(64),
    amountCredits: 10,
    bucket: "pool",
    expiresAt,
    payloadHash: "2".repeat(64),
    status: "consumed",
  } as CreditReservation;
  const creditEvidenceHash = stableGameEconomyHash({
    kind: "game-credit-reservation-evidence",
    reservationId: credit.reservationId,
    sessionId: credit.sessionId,
    walletNormalized: credit.walletNormalized,
    costCode: credit.costCode,
    amountCredits: credit.amountCredits,
    bucket: credit.bucket,
    expiresAt: credit.expiresAt,
    payloadHash: credit.payloadHash,
  });
  const assignment = {
    assignmentId: "pool-assignment:canonical",
    sessionId: "session:canonical",
    kind: "pool_asset",
    status: "completed",
    assetId: "cukies:1",
    tokenId: "1",
    ownerNormalized: `0x${"b".repeat(40)}`,
    generation: "original",
    rarity: "rare",
    ownerRewardEligible: true,
    assignedAt: NOW,
    expiresAt,
    requestHash: "3".repeat(64),
  } as CukiePoolAssignment;
  const cukieEvidenceHash = stableGameEconomyHash({
    kind: "game-cukie-pool-assignment-evidence",
    assignmentId: assignment.assignmentId,
    sessionId: assignment.sessionId,
    assignmentKind: assignment.kind,
    assetId: assignment.assetId,
    tokenId: assignment.tokenId,
    ownerNormalized: assignment.ownerNormalized,
    generation: assignment.generation,
    rarity: assignment.rarity,
    ownerRewardEligible: assignment.ownerRewardEligible,
    assignedAt: assignment.assignedAt,
    expiresAt: assignment.expiresAt,
    requestHash: assignment.requestHash,
  });
  const game = {
    sessionId: "session:canonical",
    walletNormalized: PLAYER,
    rule: {
      credit: {
        costCode: "arena:start",
        creditRuleVersion: "credits-v1",
        creditRuleConfigHash: "c".repeat(64),
      },
      cukie: { role: "pool" },
    },
    credit: {
      state: "consumed",
      reservationId: credit.reservationId,
      evidenceHash: creditEvidenceHash,
    },
    cukie: {
      state: "consumed",
      reservationId: assignment.assignmentId,
      evidenceHash: cukieEvidenceHash,
    },
    cukieAssetIds: [],
  } as unknown as GameEconomySession;
  return { game, credit, assignment };
}

describe("RewardCalculationCoordinator", () => {
  it("deriva el periodo ISO semanal del settledAt y rechaza periodos elegidos por caller", () => {
    const settledAt = new Date("2026-01-01T00:30:00.000Z");
    expect(assertSettlementRewardPeriod("2026-W01", settledAt)).toBe("2026-W01");
    expect(() => assertSettlementRewardPeriod("2025-W52", settledAt)).toThrow(
      /pertenece a 2026-W01/,
    );
  });

  it("liga creditos y asignacion de pool con IDs y evidence hashes exactos", () => {
    const { game, credit, assignment } = resourceFixture();
    expect(assertSettlementResourceBindings(game, credit, assignment)).toBe("pool_original");
  });

  it("identifica Seiku sin atribuirlo al pool Original", () => {
    const { game, credit, assignment } = resourceFixture();
    const seiku = {
      ...assignment,
      kind: "seiku" as const,
      assetId: "seiku:fixture",
      tokenId: null,
      ownerNormalized: null,
      ownerRewardEligible: false,
    };
    game.cukie.reservationId = seiku.assignmentId;
    game.cukie.evidenceHash = stableGameEconomyHash({
      kind: "game-cukie-pool-assignment-evidence",
      assignmentId: seiku.assignmentId,
      sessionId: seiku.sessionId,
      assignmentKind: seiku.kind,
      assetId: seiku.assetId,
      tokenId: seiku.tokenId,
      ownerNormalized: seiku.ownerNormalized,
      generation: seiku.generation,
      rarity: seiku.rarity,
      ownerRewardEligible: seiku.ownerRewardEligible,
      assignedAt: seiku.assignedAt,
      expiresAt: seiku.expiresAt,
      requestHash: seiku.requestHash,
    });

    expect(assertSettlementResourceBindings(game, credit, seiku)).toBe("seiku");
  });

  it.each([
    ["sessionId", (credit: CreditReservation) => ({ ...credit, sessionId: "session:other" })],
    ["wallet", (credit: CreditReservation) => ({ ...credit, walletNormalized: `0x${"c".repeat(40)}` })],
    ["reservationId", (credit: CreditReservation) => ({ ...credit, reservationId: "credit:other" })],
    ["costCode", (credit: CreditReservation) => ({ ...credit, costCode: "arena:other" })],
    ["ruleVersion", (credit: CreditReservation) => ({ ...credit, ruleVersion: "credits-v2" })],
    ["ruleConfigHash", (credit: CreditReservation) => ({ ...credit, ruleConfigHash: "d".repeat(64) })],
    ["evidenceHash", (credit: CreditReservation) => ({ ...credit, payloadHash: "9".repeat(64) })],
  ])("falla cerrado si credit.%s no liga la session", (_field, mutate) => {
    const { game, credit, assignment } = resourceFixture();
    expect(() => assertSettlementResourceBindings(game, mutate(credit), assignment)).toThrow(
      /reserva de creditos no liga exactamente/,
    );
  });

  it.each([
    ["sessionId", (assignment: CukiePoolAssignment) => ({ ...assignment, sessionId: "session:other" })],
    ["assignmentId", (assignment: CukiePoolAssignment) => ({ ...assignment, assignmentId: "pool:other" })],
    ["evidenceHash", (assignment: CukiePoolAssignment) => ({ ...assignment, requestHash: "8".repeat(64) })],
  ])("falla cerrado si pool.%s no liga la session", (_field, mutate) => {
    const { game, credit, assignment } = resourceFixture();
    expect(() => assertSettlementResourceBindings(game, credit, mutate(assignment))).toThrow(
      /asignacion del pool no liga exactamente/,
    );
  });

  it("deriva allocations de settlement desde snapshot canonico, no desde categorias del caller", async () => {
    const persistAllocationSet = jest.fn().mockResolvedValue({
      status: "allocated",
      replayed: false,
      allocations: [],
      sourceSetHash: "f".repeat(64),
    });
    const rule = testRewardRule();
    const loadSnapshot = jest.fn().mockResolvedValue({
      game: {
        sessionId: "session:canonical",
        walletNormalized: PLAYER,
        rule: {
          reward: {
            rewardRuleVersion: rule.version,
            rewardRuleConfigHash: rule.configHash,
            maxConvertibleRaw: "7500",
          },
        },
        validation: { weightRaw: "7500", resultHash: "1".repeat(64) },
      },
      rule,
      credit: {
        reservationId: "credit-reservation:1",
        payloadHash: "2".repeat(64),
        bucket: "pool",
      },
      assignment: {
        assignmentId: "pool-assignment:1",
        requestHash: "3".repeat(64),
      },
      ranking: {
        rankingId: "ranking:1",
        payloadHash: "4".repeat(64),
        rank: 5,
      },
      periodId: "2026-W28",
      sourceId: "game-session:session:canonical",
      creditSource: "pool",
      cukieSource: "pool_original",
    }) as unknown as typeof loadSettlementRewardSnapshot;
    const coordinator = new RewardCalculationCoordinator(
      { persistAllocationSet } as unknown as RewardAllocationService,
      loadSnapshot,
    );

    const result = await coordinator.settleGame({
      sessionId: "session:canonical",
      periodId: "2026-W28",
      expectedRuleVersion: rule.version,
      now: NOW,
    });

    expect(result.status).toBe("allocated");
    expect(persistAllocationSet).toHaveBeenCalledTimes(1);
    const persisted = persistAllocationSet.mock.calls[0][0];
    expect(persisted).toMatchObject({
      periodId: "2026-W28",
      sourceId: "game-session:session:canonical",
      sourceTotalRaw: "10000",
      expectedRuleVersion: "rewards-v1",
      calculation: {
        jobRunId: "reward-settlement:session:canonical",
        kind: "settlement",
      },
    });
    expect(persisted.allocations).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "player", amountRaw: "1125" }),
    ]));
    expect(persisted.allocations.reduce(
      (sum: bigint, allocation: { amountRaw: string }) => sum + BigInt(allocation.amountRaw),
      BigInt(0),
    )).toBe(BigInt(1125));
    expect(persisted.accruals).toEqual(expect.arrayContaining([
      { category: "weekly_prize_pool", amountRaw: "2000" },
      { category: "ambassador_program_pending", amountRaw: "500" },
      { category: "credit_pool_weekly", amountRaw: "3750" },
      { category: "cukie_pool_original_weekly", amountRaw: "1875" },
      { category: "undistributed_pending", amountRaw: "750" },
    ]));
  });

  it("no omite un settlement con score cero y materializa la reserva fija", async () => {
    const persistAllocationSet = jest.fn().mockResolvedValue({
      status: "allocated",
      replayed: false,
      allocations: [],
      accruals: [],
      sourceSetHash: "f".repeat(64),
    });
    const rule = testRewardRule();
    const loadSnapshot = jest.fn().mockResolvedValue({
      game: {
        sessionId: "session:zero",
        walletNormalized: PLAYER,
        rule: {
          reward: {
            rewardRuleVersion: rule.version,
            rewardRuleConfigHash: rule.configHash,
            maxConvertibleRaw: "7500",
          },
        },
        validation: { weightRaw: "0", resultHash: "1".repeat(64) },
      },
      rule,
      credit: { reservationId: "credit:zero", payloadHash: "2".repeat(64), bucket: "own" },
      assignment: null,
      ownAssignment: { assignmentId: "own:zero", requestHash: "3".repeat(64) },
      ranking: null,
      periodId: "2026-W28",
      sourceId: "game-session:session:zero",
      creditSource: "own",
      cukieSource: "own",
    }) as unknown as typeof loadSettlementRewardSnapshot;
    const coordinator = new RewardCalculationCoordinator(
      { persistAllocationSet } as unknown as RewardAllocationService,
      loadSnapshot,
    );
    await coordinator.settleGame({
      sessionId: "session:zero",
      periodId: "2026-W28",
      expectedRuleVersion: rule.version,
      now: NOW,
    });
    expect(persistAllocationSet).toHaveBeenCalledWith(expect.objectContaining({
      sourceTotalRaw: "10000",
      allocations: [],
      accruals: [
        { category: "weekly_prize_pool", amountRaw: "2000" },
        { category: "ambassador_program_pending", amountRaw: "500" },
        { category: "undistributed_pending", amountRaw: "7500" },
      ],
    }));
  });
});
