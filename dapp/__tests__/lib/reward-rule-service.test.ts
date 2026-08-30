import { RewardRuleService } from "@/lib/uki-economy/rewards/rule-service";
import { parseRewardInternalCommand } from "@/lib/uki-economy/rewards/internal-command";
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from "@/lib/uki-economy/rewards/testing";
import type { PersistRewardRuleInput, RewardRule } from "@/lib/uki-economy/rewards/types";

function input(rule: RewardRule): PersistRewardRuleInput {
  const { createdAt, updatedAt: _updatedAt, ...withoutTimestamps } = rule;
  return { ...withoutTimestamps, now: createdAt };
}

describe("RewardRuleService", () => {
  it("persiste una regla completa sin defaults y hace replay por version/config", async () => {
    const repository = new MemoryRewardRepository(null);
    const service = new RewardRuleService(createMemoryRewardTransactionRunner(repository));
    const rule = testRewardRule();

    const first = await service.persistRule(input(rule));
    const replay = await service.persistRule(input(rule));

    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(repository.state.rules).toHaveLength(1);
    expect(replay.rule.configHash).toBe(rule.configHash);
    expect(replay.rule).not.toHaveProperty("activeUntil");
  });

  it("programa un cap nuevo en un corte futuro sin mutar el configHash anterior", async () => {
    const repository = new MemoryRewardRepository(null);
    const service = new RewardRuleService(createMemoryRewardTransactionRunner(repository));
    const current = testRewardRule();
    await service.persistRule(input(current));
    const next = testRewardRule({
      _id: "reward-allocations:v2",
      version: "rewards-v2",
      activeFrom: new Date("2026-07-05T14:00:00.000Z"),
      emissionBudget: {
        ...current.emissionBudget,
        dailyCapRaw: "2000000000000000000000000000000",
      },
    });

    await expect(service.persistRule(input(next))).resolves.toMatchObject({
      replayed: false,
      rule: { version: "rewards-v2" },
    });
    expect(repository.state.rules).toHaveLength(2);
    expect(repository.state.rules[0]).toMatchObject({
      version: "rewards-v1",
      configHash: current.configHash,
      supersededAt: new Date("2026-07-05T14:00:00.000Z"),
      supersededByVersion: "rewards-v2",
    });
    await expect(repository.findRuleAt(
      new Date("2026-07-05T13:59:59.999Z"),
      "rewards-v1",
    )).resolves.toMatchObject({ version: "rewards-v1" });
    await expect(repository.findRuleAt(
      new Date("2026-07-05T14:00:00.000Z"),
      "rewards-v1",
    )).resolves.toBeNull();
    await expect(repository.findRuleAt(
      new Date("2026-07-05T14:00:00.000Z"),
      "rewards-v2",
    )).resolves.toMatchObject({ version: "rewards-v2" });
  });

  it("rechaza supersesiones retroactivas, fuera de corte o que reinicien el ledger", async () => {
    const cases = [
      {
        name: "retroactiva",
        next: (current: RewardRule) => testRewardRule({
          _id: "reward-allocations:retro",
          version: "rewards-retro",
          activeFrom: new Date("2026-07-01T00:00:00.000Z"),
          emissionBudget: current.emissionBudget,
        }),
        expected: /posterior|corte futuro/,
      },
      {
        name: "fuera de corte",
        next: (current: RewardRule) => testRewardRule({
          _id: "reward-allocations:off-boundary",
          version: "rewards-off-boundary",
          activeFrom: new Date("2026-07-05T14:00:01.000Z"),
          emissionBudget: current.emissionBudget,
        }),
        expected: /corte diario/,
      },
      {
        name: "reinicia lifetime cap",
        next: (current: RewardRule) => testRewardRule({
          _id: "reward-allocations:new-lifetime",
          version: "rewards-new-lifetime",
          activeFrom: new Date("2026-07-05T14:00:00.000Z"),
          emissionBudget: {
            ...current.emissionBudget,
            lifetimeCapRaw: "200000000000000000000000000000000",
          },
        }),
        expected: /lifetime cap/,
      },
    ];

    for (const scenario of cases) {
      const repository = new MemoryRewardRepository(null);
      const service = new RewardRuleService(createMemoryRewardTransactionRunner(repository));
      const current = testRewardRule();
      await service.persistRule(input(current));
      await expect(service.persistRule(input(scenario.next(current))))
        .rejects.toThrow(scenario.expected);
      expect(repository.state.rules).toHaveLength(1);
      expect(repository.state.rules[0].supersededAt).toBeUndefined();
    }
  });

  it("parsea la configuracion explicita de presupuesto sin defaults", () => {
    const { now: _now, ...payload } = input(testRewardRule());
    const command = parseRewardInternalCommand(Buffer.from(JSON.stringify({
      command: "persist_rule",
      payload,
    })));

    expect(command).toMatchObject({
      command: "persist_rule",
      payload: {
        emissionBudget: {
          programStartsAt: expect.any(Date),
          dayBoundarySecondUtc: 14 * 60 * 60,
          unusedDailyCapacity: "expires",
          overflowPolicy: "block",
        },
      },
    });
    expect(command.payload).not.toHaveProperty("activeUntil");
  });

  it("rechaza una regla interna sin presupuesto de emision", () => {
    const { now: _now, emissionBudget: _budget, ...payload } = input(testRewardRule());
    expect(() => parseRewardInternalCommand(Buffer.from(JSON.stringify({
      command: "persist_rule",
      payload,
    })))).toThrow(/emissionBudget debe ser un objeto/);
  });
});
