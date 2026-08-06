import { calculateSettlementRewardAllocations } from "@/lib/uki-economy/rewards/calculation";
import { RewardAllocationService } from "@/lib/uki-economy/rewards/service";
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from "@/lib/uki-economy/rewards/testing";

const PLAYER = `0x${"a".repeat(40)}`;
const NOW = new Date("2026-07-10T12:00:00.000Z");

function fixture() {
  const rule = testRewardRule();
  const repository = new MemoryRewardRepository(rule);
  const service = new RewardAllocationService(
    createMemoryRewardTransactionRunner(repository)
  );
  const calculated = calculateSettlementRewardAllocations(rule, {
    periodId: "2026-W28",
    sourceId: "session:1",
    playerWallet: PLAYER,
    grossConvertedRaw: "7500",
    maxConvertibleRaw: "7500",
    creditSource: "pool",
    cukieSource: "own",
    ranking: 5,
    creditCostUnits: 100,
    weeklyReserveUnits: 25,
  });
  const input = {
    periodId: "2026-W28",
    sourceId: "session:1",
    sourceTotalRaw: calculated.totals.sourceTotalRaw,
    expectedRuleVersion: rule.version,
    ruleEffectiveAt: NOW,
    allocations: calculated.allocations,
    accruals: calculated.accruals,
    calculation: {
      jobRunId: "reward-job:session:1",
      kind: "settlement" as const,
      inputHash: "a".repeat(64),
      outputHash: "b".repeat(64),
    },
    now: NOW,
  };
  return { rule, repository, service, input };
}

describe("RewardAllocationService", () => {
  it("persiste allocations inmutables e idempotentes por source", async () => {
    const { repository, service, input } = fixture();
    const first = await service.persistAllocationSet(input);
    const replay = await service.persistAllocationSet(input);
    expect(first.status).toBe("allocated");
    expect(first.replayed).toBe(false);
    expect(replay.status).toBe("allocated");
    expect(replay.replayed).toBe(true);
    expect(replay.allocations.map((item) => item.allocationId)).toEqual(
      first.allocations.map((item) => item.allocationId)
    );
    expect(new Set(first.allocations.map((item) => item.payloadHash)).size).toBe(
      first.allocations.length
    );
    expect(repository.state.sourceManifests).toHaveLength(1);
    expect(repository.state.emissionBudgetEvents).toHaveLength(1);
    expect(repository.state.emissionBudgetStates[0].reservedLifetimeRaw).toBe(
      input.sourceTotalRaw,
    );
    expect(repository.state.emissionBudgetDays[0].reservedRaw).toBe(input.sourceTotalRaw);
    expect(first.accruals).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "weekly_prize_pool", status: "accrued" }),
      expect.objectContaining({ category: "credit_pool_weekly", status: "accrued" }),
    ]));
    expect(repository.state.sourceManifests[0]).toMatchObject({
      _id: input.sourceId,
      sourceId: input.sourceId,
      periodId: input.periodId,
      sourceSetHash: first.sourceSetHash,
      status: "allocated",
    });
  });

  it("persiste un source solo-accrual para un settlement con score cero", async () => {
    const rule = testRewardRule();
    const repository = new MemoryRewardRepository(rule);
    const service = new RewardAllocationService(
      createMemoryRewardTransactionRunner(repository),
    );
    const result = await service.persistAllocationSet({
      periodId: "2026-W28",
      sourceId: "game-session:zero",
      sourceTotalRaw: "2500",
      expectedRuleVersion: rule.version,
      ruleEffectiveAt: NOW,
      allocations: [],
      accruals: [{ category: "weekly_prize_pool", amountRaw: "2500" }],
      calculation: {
        jobRunId: "reward-job:zero",
        kind: "settlement",
        inputHash: "c".repeat(64),
        outputHash: "d".repeat(64),
      },
      now: NOW,
    });
    expect(result).toMatchObject({
      status: "allocated",
      allocations: [],
      accruals: [expect.objectContaining({
        category: "weekly_prize_pool",
        amountRaw: "2500",
        status: "accrued",
      })],
    });
    expect(repository.state.sourceManifests[0]).toMatchObject({
      sourceTotalRaw: "2500",
      claimableTotalRaw: "0",
      accrualTotalRaw: "2500",
      allocationCount: 0,
      accrualCount: 1,
    });
  });

  it("impide globalmente pagar el mismo source en otro periodo", async () => {
    const { repository, service, input } = fixture();
    await service.persistAllocationSet(input);
    await expect(service.persistAllocationSet({
      ...input,
      periodId: "2026-W29",
      now: new Date("2026-07-17T12:00:00.000Z"),
    })).rejects.toThrow(/ya pertenece al periodo 2026-W28/);
    expect(repository.state.sourceManifests).toHaveLength(1);
    expect(new Set(repository.state.allocations.map((item) => item.periodId))).toEqual(
      new Set(["2026-W28"]),
    );
  });

  it("reintenta con la fecha economica del source aunque el worker llegue tras activeUntil", async () => {
    const rule = testRewardRule({ activeUntil: new Date("2026-07-11T00:00:00.000Z") });
    const repository = new MemoryRewardRepository(rule);
    const service = new RewardAllocationService(createMemoryRewardTransactionRunner(repository));
    const base = fixture().input;
    const input = {
      ...base,
      expectedRuleVersion: rule.version,
      ruleEffectiveAt: NOW,
      now: NOW,
    };
    await expect(service.persistAllocationSet(input)).resolves.toMatchObject({
      status: "allocated",
      replayed: false,
    });
    await expect(service.persistAllocationSet({
      ...input,
      now: new Date("2026-07-12T12:00:00.000Z"),
    })).resolves.toMatchObject({
      status: "allocated",
      replayed: true,
    });
  });

  it("falla cerrado ante allocations legacy sin manifest global", async () => {
    const { repository, service, input } = fixture();
    await service.persistAllocationSet(input);
    repository.state.sourceManifests = [];
    await expect(service.persistAllocationSet(input)).rejects.toThrow(
      /allocations sin manifest global/,
    );
  });

  it("revierte tambien el manifest si falla la insercion de allocations", async () => {
    const { repository, service, input } = fixture();
    repository.insertAllocations = jest.fn().mockRejectedValue(new Error("write failed"));
    await expect(service.persistAllocationSet(input)).rejects.toThrow("write failed");
    expect(repository.state.sourceManifests).toHaveLength(0);
    expect(repository.state.allocations).toHaveLength(0);
    expect(repository.state.periodStates).toHaveLength(0);
    expect(repository.state.emissionBudgetEvents).toHaveLength(0);
    expect(repository.state.emissionBudgetStates).toHaveLength(0);
    expect(repository.state.emissionBudgetDays).toHaveLength(0);
  });

  it("bloquea el source y abre incidente si detecta tamper", async () => {
    const { repository, service, input } = fixture();
    await service.persistAllocationSet(input);
    repository.state.allocations[0].amountRaw = "1";
    const result = await service.persistAllocationSet(input);
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error("expected blocked");
    expect(result.incident.reasonCodes).toEqual(
      expect.arrayContaining([
        "ALLOCATION_PAYLOAD_TAMPERED",
        "SOURCE_TOTAL_MISMATCH",
      ])
    );
    expect(repository.state.incidents).toHaveLength(1);
    expect(repository.state.allocations.every((item) => item.status === "blocked")).toBe(true);
  });

  it("bloquea un replay que intenta cambiar el reparto del mismo source", async () => {
    const { service, input } = fixture();
    await service.persistAllocationSet(input);
    const changed = input.allocations.map((allocation, index) => index === 0
      ? { ...allocation, amountRaw: (BigInt(allocation.amountRaw) + BigInt(1)).toString() }
      : allocation);
    const changedAccruals = input.accruals.map((accrual) =>
      accrual.category === "undistributed_pending"
        ? { ...accrual, amountRaw: (BigInt(accrual.amountRaw) - BigInt(1)).toString() }
        : accrual);
    const result = await service.persistAllocationSet({
      ...input,
      allocations: changed,
      accruals: changedAccruals,
    });
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.incident.reasonCodes).toContain("ALLOCATION_SET_MISMATCH");
    }
  });

  it("bloquea un replay que cambia la evidencia de calculo ya reservada", async () => {
    const { repository, service, input } = fixture();
    await service.persistAllocationSet(input);

    const result = await service.persistAllocationSet({
      ...input,
      calculation: {
        ...input.calculation,
        outputHash: "c".repeat(64),
      },
    });

    expect(result.status).toBe("blocked");
    if (result.status === "blocked") {
      expect(result.incident.reasonCodes).toEqual(expect.arrayContaining([
        "ALLOCATION_SOURCE_MISMATCH",
        "SOURCE_MANIFEST_MISMATCH",
      ]));
    }
    expect(repository.state.allocations.every((item) => item.status === "blocked")).toBe(true);
    expect(repository.state.emissionBudgetEvents).toHaveLength(1);
  });

  it("rechaza antes de persistir un total incompleto", async () => {
    const { repository, service, input } = fixture();
    await expect(
      service.persistAllocationSet({ ...input, sourceTotalRaw: "10001" })
    ).rejects.toThrow(/no reconcilia/);
    expect(repository.state.allocations).toHaveLength(0);
    expect(repository.state.incidents).toHaveLength(0);
  });
});
