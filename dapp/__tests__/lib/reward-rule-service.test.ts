import { RewardRuleService } from "@/lib/uki-economy/rewards/rule-service";
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
  });

  it("rechaza ventanas activas solapadas", async () => {
    const repository = new MemoryRewardRepository(null);
    const service = new RewardRuleService(createMemoryRewardTransactionRunner(repository));
    await service.persistRule(input(testRewardRule()));
    const overlapping = testRewardRule({
      _id: "reward-allocations:v2",
      version: "rewards-v2",
      activeFrom: new Date("2026-07-05T00:00:00.000Z"),
    });

    await expect(service.persistRule(input(overlapping))).rejects.toThrow(/solapa/);
    expect(repository.state.rules).toHaveLength(1);
  });
});
