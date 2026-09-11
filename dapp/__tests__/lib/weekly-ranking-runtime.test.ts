jest.mock("@/lib/indexer-db/mongodb", () => ({ getEconomyDb: jest.fn() }));

import {
  loadWeeklyRankingRuntimeConfig,
  runWeeklyRankingRuntimeTick,
  type WeeklyRankingRuntimeCoordinator,
} from "@/lib/uki-economy/ranking/runtime";

const NOW = new Date("2026-07-14T01:00:00.000Z");

describe("weekly ranking runtime", () => {
  it("is fail-closed and keeps lease longer than HTTP timeout", () => {
    expect(loadWeeklyRankingRuntimeConfig({}).enabled).toBe(false);
    expect(() => loadWeeklyRankingRuntimeConfig({ WEEKLY_RANKING_RUNTIME_ENABLED: "yes" })).toThrow(/true o false/);
    expect(() => loadWeeklyRankingRuntimeConfig({
      WEEKLY_RANKING_RUNTIME_ENABLED: "true",
      WEEKLY_RANKING_TICK_TIMEOUT_MS: "300000",
      WEEKLY_RANKING_TICK_LEASE_MS: "300000",
    })).toThrow(/360000/);
  });

  it("catches up chronologically up to the first replay under one fenced lease", async () => {
    const calls: string[] = [];
    const coordinator: WeeklyRankingRuntimeCoordinator = {
      acquire: async () => ({ leasedBy: "worker:1", fenceToken: 1, leaseExpiresAt: new Date(NOW.getTime() + 600_000) }),
      release: async () => { calls.push("release"); },
      startRun: async () => "runtime-run",
      finishRun: async (_run, _lease, _now, result) => { calls.push(`finish:${result.periodsProcessed}`); },
      failRun: async () => { calls.push("fail"); },
    };
    const results = [
      { periodId: "2026-W26", runId: "r26", manifestId: "m26", sourceCount: 1, participantCount: 1, replayed: false },
      { periodId: "2026-W27", runId: "r27", manifestId: "m27", sourceCount: 1, participantCount: 1, replayed: false },
      { periodId: "2026-W27", runId: "r27", manifestId: "m27", sourceCount: 1, participantCount: 1, replayed: true },
    ];
    const service = {
      closeCompletedPeriod: jest.fn(async () => results.shift()!),
    };
    const result = await runWeeklyRankingRuntimeTick({
      workerId: "ranking-worker",
      config: { enabled: true, pageSize: 500, catchUpLimit: 8, leaseMs: 600_000 },
      clock: () => new Date(NOW),
      coordinator,
      service,
    });
    expect(result).toMatchObject({ periodId: "2026-W27", periodsProcessed: 3, replayed: true });
    expect(result.closures.map((row) => row.periodId)).toEqual(["2026-W26", "2026-W27", "2026-W27"]);
    expect(service.closeCompletedPeriod).toHaveBeenCalledTimes(3);
    expect(calls).toEqual(["finish:3", "release"]);
  });

  it("confirma un tick waiting sin fallar ni inventar un cierre", async () => {
    const calls: string[] = [];
    const readyAt = new Date("2026-09-12T00:02:30.000Z");
    const coordinator: WeeklyRankingRuntimeCoordinator = {
      acquire: async () => ({ leasedBy: "worker:1", fenceToken: 1, leaseExpiresAt: new Date(NOW.getTime() + 600_000) }),
      release: async () => { calls.push("release"); },
      startRun: async () => "runtime-run",
      finishRun: async (_run, _lease, _now, result) => {
        calls.push(`finish:${result.status}:${result.periodsProcessed}`);
      },
      failRun: async () => { calls.push("fail"); },
    };
    const service = {
      closeCompletedPeriod: jest.fn(async () => ({
        status: "waiting" as const,
        reason: "FORWARD_PERIOD_NOT_READY" as const,
        periodId: null,
        runId: null,
        manifestId: null,
        readyAt,
      })),
    };

    const result = await runWeeklyRankingRuntimeTick({
      workerId: "ranking-worker",
      config: { enabled: true, pageSize: 500, catchUpLimit: 8, leaseMs: 600_000 },
      clock: () => new Date(NOW),
      coordinator,
      service,
    });

    expect(result).toMatchObject({
      status: "waiting",
      periodId: null,
      runId: null,
      manifestId: null,
      sourceCount: 0,
      participantCount: 0,
      replayed: false,
      periodsProcessed: 0,
      closures: [],
      reason: "FORWARD_PERIOD_NOT_READY",
      readyAt: readyAt.toISOString(),
    });
    expect(service.closeCompletedPeriod).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["finish:waiting:0", "release"]);
  });

  it("conserva cierres previos si una espera aparece durante el catch-up", async () => {
    const calls: string[] = [];
    const coordinator: WeeklyRankingRuntimeCoordinator = {
      acquire: async () => ({ leasedBy: "worker:1", fenceToken: 1, leaseExpiresAt: new Date(NOW.getTime() + 600_000) }),
      release: async () => { calls.push("release"); },
      startRun: async () => "runtime-run",
      finishRun: async (_run, _lease, _now, result) => {
        calls.push(`finish:${result.status}:${result.periodsProcessed}`);
      },
      failRun: async () => { calls.push("fail"); },
    };
    const service = {
      closeCompletedPeriod: jest.fn()
        .mockResolvedValueOnce({ periodId: "2026-W27", runId: "r27", manifestId: "m27", sourceCount: 0, participantCount: 0, replayed: false })
        .mockResolvedValueOnce({
          status: "waiting" as const,
          reason: "FORWARD_PERIOD_NOT_READY" as const,
          periodId: null,
          runId: null,
          manifestId: null,
          readyAt: new Date("2026-09-12T00:02:30.000Z"),
        }),
    };

    const result = await runWeeklyRankingRuntimeTick({
      workerId: "ranking-worker",
      config: { enabled: true, pageSize: 500, catchUpLimit: 8, leaseMs: 600_000 },
      clock: () => new Date(NOW),
      coordinator,
      service,
    });

    expect(result).toMatchObject({
      status: "success",
      periodId: "2026-W27",
      periodsProcessed: 1,
      closures: [expect.objectContaining({ periodId: "2026-W27" })],
    });
    expect(calls).toEqual(["finish:success:1", "release"]);
  });
});
