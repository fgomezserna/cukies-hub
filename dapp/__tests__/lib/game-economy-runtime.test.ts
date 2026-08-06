jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));

import {
  loadGameEconomyRuntimeConfig,
  runGameEconomyRuntimeTick,
  type GameEconomyRuntimeCoordinator,
} from "@/lib/uki-economy/game-economy/runtime";
import { parseGameInternalCommand } from "@/lib/uki-economy/game-economy/internal-command";
import { parseGameRuleCommand } from "@/lib/uki-economy/game-economy/rule-command";

const NOW = new Date("2026-07-10T12:00:00.000Z");

describe("GameEconomy productive runtime and commands", () => {
  it("fails closed when disabled or misconfigured", () => {
    expect(loadGameEconomyRuntimeConfig({}).enabled).toBe(false);
    expect(() => loadGameEconomyRuntimeConfig({
      GAME_ECONOMY_RUNTIME_ENABLED: "yes",
    })).toThrow(/true o false/);
    expect(() => loadGameEconomyRuntimeConfig({
      GAME_ECONOMY_RUNTIME_ENABLED: "true",
      GAME_ECONOMY_TICK_TIMEOUT_MS: "300000",
      GAME_ECONOMY_TICK_LEASE_MS: "300000",
    })).toThrow(/360000/);
  });

  it("recovers stale sagas before expiring sessions under one lease", async () => {
    const calls: string[] = [];
    const coordinator: GameEconomyRuntimeCoordinator = {
      acquire: async () => {
        calls.push("acquire");
        return { leasedBy: "worker:1", fenceToken: 1, leaseExpiresAt: new Date(NOW.getTime() + 600_000) };
      },
      release: async () => { calls.push("release"); },
      startRun: async () => { calls.push("start"); return "run-1"; },
      finishRun: async (_runId, _lease, _now, result) => {
        calls.push(`finish:${result.recovered}:${result.expired}`);
      },
      failRun: async () => { calls.push("fail"); },
    };
    const service = {
      recoverBatch: async () => {
        calls.push("recover");
        return { sessions: [{ sessionId: "s1" }], failures: [] };
      },
      expireBatch: async () => {
        calls.push("expire");
        return { sessions: [{ sessionId: "s2" }], failures: [] };
      },
    };
    const result = await runGameEconomyRuntimeTick({
      workerId: "runtime-worker",
      config: { enabled: true, recoveryLimit: 100, expiryLimit: 100, leaseMs: 600_000 },
      clock: () => new Date(NOW),
      coordinator,
      service,
    });
    expect(result).toMatchObject({ recovered: 1, expired: 1 });
    expect(calls).toEqual([
      "acquire",
      "start",
      "recover",
      "expire",
      "finish:1:1",
      "release",
    ]);
  });

  it("accepts only the three scoped game-server commands", () => {
    expect(parseGameInternalCommand(Buffer.from(JSON.stringify({
      command: "open_session",
      payload: {
        walletAddress: `0x${"1".repeat(40)}`,
        gameId: "arena",
        expectedRuleVersion: "v1",
        idempotencyKey: "open-1",
      },
    })))).toMatchObject({ command: "open_session" });
    expect(() => parseGameInternalCommand(Buffer.from(JSON.stringify({
      command: "persist_rule",
      payload: {},
    })))).toThrow(/no esta permitido/);
    expect(() => parseGameInternalCommand(Buffer.from(JSON.stringify({
      command: "open_session",
      payload: {
        walletAddress: "x",
        gameId: "arena",
        idempotencyKey: "open-1",
        now: NOW.toISOString(),
      },
    })))).toThrow(/sobran/);
  });

  it("parses an admin rule with exact credit-rule binding and server-derived hash", () => {
    const parsed = parseGameRuleCommand(Buffer.from(JSON.stringify({
      gameId: "arena",
      version: "v1",
      sessionTtlMs: 600000,
      operationLeaseMs: 30000,
      credit: {
        required: true,
        consumeOnSettle: true,
        costCode: "arena:start",
        creditRuleVersion: "credits-v1",
        creditRuleConfigHash: "c".repeat(64),
      },
      reward: {
        rewardRuleVersion: "rewards-v1",
        rewardRuleConfigHash: "d".repeat(64),
        maxConvertibleRaw: "7500000000000000000",
      },
      cukie: {
        required: true,
        consumeOnSettle: true,
        minAssets: 0,
        maxAssets: 0,
        role: "pool",
        selectionPolicy: "pool_only_v1",
      },
      calculation: {
        scoreCapRaw: "1000",
        weightNumeratorRaw: "7500000000000000",
        weightDenominatorRaw: "1",
      },
      active: true,
      activeFrom: NOW.toISOString(),
      activeUntil: null,
    })));
    expect(parsed.credit).toMatchObject({
      creditRuleVersion: "credits-v1",
      creditRuleConfigHash: "c".repeat(64),
    });
    expect(parsed.reward).toEqual({
      rewardRuleVersion: "rewards-v1",
      rewardRuleConfigHash: "d".repeat(64),
      maxConvertibleRaw: "7500000000000000000",
    });
    expect(parsed).not.toHaveProperty("configHash");
  });
});
