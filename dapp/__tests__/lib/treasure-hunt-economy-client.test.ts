import {
  TreasureHuntEconomyClientError,
  appendTreasureHuntEconomyCheckpoint,
  finishTreasureHuntEconomyRun,
  openTreasureHuntEconomyRun,
} from "@/lib/treasure-hunt-economy-client";

function response(body: unknown, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe("Treasure Hunt economy browser contract", () => {
  it("opens an authority-bound run without accepting caller-selected resource actions", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      status: "ok",
      result: {
        runId: "run-1",
        gameEconomySessionId: "economy-session-1",
        creditSource: "pool",
        cukieSource: "own",
        cukieAssetId: "cukie-1",
        dailyPeriodId: "th-day:2026-08-17T14:00:00.000Z",
        dailyPeriodEndsAt: "2026-08-18T14:00:00.000Z",
      },
    }));

    await expect(openTreasureHuntEconomyRun({
      gameSessionId: "game-session-1",
      requestId: "request-12345678",
    }, fetchImpl)).resolves.toMatchObject({ runId: "run-1", creditSource: "pool" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/games/treasure-hunt/economy/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          gameSessionId: "game-session-1",
          requestId: "request-12345678",
        }),
      }),
    );
    expect(fetchImpl.mock.calls[0][1].body).not.toContain("resourceActions");
  });

  it("uses stable checkpoint/result ids and exposes only semantic terminal outcomes", async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({
        status: "ok",
        result: { sequence: 1, evidenceHash: "e".repeat(64) },
      }))
      .mockResolvedValueOnce(response({
        status: "ok",
        result: {
          runId: "run-1",
          status: "forfeited",
          scoreRaw: "0",
          leaderboardEligible: false,
          rewardEligible: false,
          jackpotEligible: false,
        },
      }));

    await appendTreasureHuntEconomyCheckpoint({
      runId: "run-1",
      checkpointId: "checkpoint-1",
      score: 99,
      gameTimeMs: 5_000,
    }, fetchImpl);
    await expect(finishTreasureHuntEconomyRun({
      runId: "run-1",
      resultId: "result-12345678",
      score: 0,
      gameTimeMs: 5_000,
      outcome: "voluntary_forfeit",
      authoritySource: "economy",
    }, fetchImpl)).resolves.toMatchObject({
      status: "forfeited",
      leaderboardEligible: false,
      rewardEligible: false,
      jackpotEligible: false,
    });
    for (const call of fetchImpl.mock.calls) {
      expect(call[1].body).not.toContain("resourceActions");
    }
  });

  it("fails closed with the stable server error code", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      status: "error",
      code: "POOL_DAILY_LOW_SCORE_LIMIT_REACHED",
    }, false));
    await expect(openTreasureHuntEconomyRun({
      gameSessionId: "game-session-1",
      requestId: "request-12345678",
    }, fetchImpl)).rejects.toEqual(expect.objectContaining({
      name: "TreasureHuntEconomyClientError",
      code: "POOL_DAILY_LOW_SCORE_LIMIT_REACHED",
    } satisfies Partial<TreasureHuntEconomyClientError>));
  });

  it("rejects a forfeit response that exposes leaderboard eligibility", async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      status: "ok",
      result: {
        runId: "run-1",
        status: "forfeited",
        scoreRaw: "0",
        leaderboardEligible: true,
        rewardEligible: false,
        jackpotEligible: false,
      },
    }));
    await expect(finishTreasureHuntEconomyRun({
      runId: "run-1",
      resultId: "result-12345678",
      score: 0,
      gameTimeMs: 1_000,
      outcome: "voluntary_forfeit",
      authoritySource: "economy",
    }, fetchImpl)).rejects.toMatchObject({
      code: "TREASURE_ECONOMY_INVALID_RESPONSE",
    });
  });
});
