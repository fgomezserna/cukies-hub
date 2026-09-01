import {
  TREASURE_HUNT_ECONOMY_POLICY,
  assertTreasureHuntStagingRuntime,
  getTreasureHuntDailyPeriod,
  getTreasureHuntWeeklyPeriod,
  finishTreasureHuntPoolQuota,
  isTreasureHuntLowScore,
  reserveTreasureHuntPoolQuota,
  shouldReplaceTreasureHuntWeeklyBest,
  treasureHuntResultEligibility,
  treasureHuntScoreOrderKey,
  validateTreasureHuntEvidence,
} from "@/lib/uki-economy/game-economy/treasure-hunt-policy";

describe("Treasure Hunt economy policy", () => {
  it("is executable only in the explicit staging BSC Testnet runtime", () => {
    expect(assertTreasureHuntStagingRuntime({
      APP_ENV: "staging",
      STAGING_ONLY_GUARD: "true",
      NEXT_PUBLIC_UKI_CHAIN_ID: "97",
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: "97",
    })).toMatchObject({ environment: "staging", chainId: 97 });
    expect(() => assertTreasureHuntStagingRuntime({
      APP_ENV: "production",
      STAGING_ONLY_GUARD: "false",
      NEXT_PUBLIC_UKI_CHAIN_ID: "56",
      CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: "56",
    })).toThrow("TREASURE_HUNT_STAGING_RUNTIME_REQUIRED");
  });

  it("pins a run reserved at 13:59 to the previous period after it crosses 14:00", () => {
    const reserved = getTreasureHuntDailyPeriod(
      new Date("2026-08-17T13:59:59.999Z"),
    );
    const finished = getTreasureHuntDailyPeriod(
      new Date("2026-08-17T14:00:00.001Z"),
    );
    expect(reserved).toMatchObject({
      startsAt: new Date("2026-08-16T14:00:00.000Z"),
      endsAt: new Date("2026-08-17T14:00:00.000Z"),
    });
    expect(finished).toMatchObject({
      startsAt: new Date("2026-08-17T14:00:00.000Z"),
      endsAt: new Date("2026-08-18T14:00:00.000Z"),
    });
    expect(reserved.periodId).not.toBe(finished.periodId);
  });

  it("uses Monday 14:00 UTC as the weekly best boundary", () => {
    expect(
      getTreasureHuntWeeklyPeriod(
        new Date("2026-08-17T13:59:59.999Z"),
      ).startsAt,
    ).toEqual(new Date("2026-08-10T14:00:00.000Z"));
    expect(
      getTreasureHuntWeeklyPeriod(
        new Date("2026-08-17T14:00:00.000Z"),
      ).startsAt,
    ).toEqual(new Date("2026-08-17T14:00:00.000Z"));
  });

  it("counts only scores strictly below 100 as low performance", () => {
    expect(isTreasureHuntLowScore("99")).toBe(true);
    expect(isTreasureHuntLowScore("100")).toBe(false);
    expect(isTreasureHuntLowScore("101")).toBe(false);
    expect(TREASURE_HUNT_ECONOMY_POLICY.maxPoolGamesPerPeriod).toBe(30);
    expect(TREASURE_HUNT_ECONOMY_POLICY.maxPoolLowScoreGamesPerPeriod).toBe(10);
  });

  it("reserves both pool limits before play and handles all terminal outcomes", () => {
    const reserved = reserveTreasureHuntPoolQuota({
      reservedGames: 0,
      reservedLowScoreSlots: 0,
      countedGames: 29,
      lowScoreGames: 9,
    });
    expect(reserved).toEqual({
      reservedGames: 1,
      reservedLowScoreSlots: 1,
      countedGames: 29,
      lowScoreGames: 9,
    });
    expect(finishTreasureHuntPoolQuota({
      counters: reserved,
      outcome: "completed",
      scoreRaw: "100",
    })).toEqual({
      reservedGames: 0,
      reservedLowScoreSlots: 0,
      countedGames: 30,
      lowScoreGames: 9,
    });
    expect(finishTreasureHuntPoolQuota({
      counters: reserved,
      outcome: "voluntary_forfeit",
      scoreRaw: "999",
    })).toMatchObject({ countedGames: 30, lowScoreGames: 10 });
    expect(finishTreasureHuntPoolQuota({
      counters: reserved,
      outcome: "system_failure",
      scoreRaw: "0",
    })).toMatchObject({ countedGames: 29, lowScoreGames: 9 });
    expect(() => reserveTreasureHuntPoolQuota({
      reservedGames: 0,
      reservedLowScoreSlots: 0,
      countedGames: 30,
      lowScoreGames: 0,
    })).toThrow("POOL_DAILY_GAME_LIMIT_REACHED");
    expect(() => reserveTreasureHuntPoolQuota({
      reservedGames: 0,
      reservedLowScoreSlots: 0,
      countedGames: 10,
      lowScoreGames: 10,
    })).toThrow("POOL_DAILY_LOW_SCORE_LIMIT_REACHED");
  });

  it("keeps one raw weekly best; higher replaces and equal score keeps the earlier run", () => {
    const early = new Date("2026-08-17T15:00:00.000Z");
    const late = new Date("2026-08-17T16:00:00.000Z");
    expect(shouldReplaceTreasureHuntWeeklyBest({
      currentScoreRaw: "3000",
      currentAchievedAt: early,
      candidateScoreRaw: "999999999999999999999999",
      candidateAchievedAt: late,
    })).toBe(true);
    expect(shouldReplaceTreasureHuntWeeklyBest({
      currentScoreRaw: "3000",
      currentAchievedAt: early,
      candidateScoreRaw: "3000",
      candidateAchievedAt: late,
    })).toBe(false);
    expect(shouldReplaceTreasureHuntWeeklyBest({
      currentScoreRaw: "3000",
      currentAchievedAt: late,
      candidateScoreRaw: "3000",
      candidateAchievedAt: early,
    })).toBe(true);
    expect(treasureHuntScoreOrderKey("99")).toEqual({
      scoreDigits: 2,
      scoreRaw: "99",
    });
    expect(treasureHuntScoreOrderKey("100")).toEqual({
      scoreDigits: 3,
      scoreRaw: "100",
    });
  });

  it("only ranks settled games paid with pool credits", () => {
    expect(treasureHuntResultEligibility({
      status: "settled",
      creditSource: "pool",
    })).toEqual({
      leaderboardEligible: true,
      rewardEligible: true,
      jackpotEligible: true,
    });
    expect(treasureHuntResultEligibility({
      status: "settled",
      creditSource: "own",
    })).toEqual({
      leaderboardEligible: false,
      rewardEligible: true,
      jackpotEligible: false,
    });
    expect(treasureHuntResultEligibility({
      status: "forfeited",
      creditSource: "pool",
    })).toEqual({
      leaderboardEligible: false,
      rewardEligible: false,
      jackpotEligible: false,
    });
  });

  it("accepts monotonic server-timed evidence and fails closed on score or clock jumps", () => {
    const state = {
      startedAt: new Date("2026-08-17T13:59:00.000Z"),
      nextSequence: 1,
      lastScoreRaw: "40",
      lastGameTimeMs: 5_000,
    };
    expect(validateTreasureHuntEvidence(state, {
      scoreRaw: "100",
      gameTimeMs: 10_000,
      receivedAt: new Date("2026-08-17T13:59:10.000Z"),
    })).toMatchObject({ sequence: 1, scoreRaw: "100", gameTimeMs: 10_000 });
    expect(() => validateTreasureHuntEvidence(state, {
      scoreRaw: "39",
      gameTimeMs: 10_000,
      receivedAt: new Date("2026-08-17T13:59:10.000Z"),
    })).toThrow(/retroceder/);
    expect(() => validateTreasureHuntEvidence(state, {
      scoreRaw: "50000",
      gameTimeMs: 10_000,
      receivedAt: new Date("2026-08-17T13:59:10.000Z"),
    })).toThrow(/crecimiento/);
    expect(() => validateTreasureHuntEvidence(state, {
      scoreRaw: "100",
      gameTimeMs: 20_000,
      receivedAt: new Date("2026-08-17T13:59:10.000Z"),
    })).toThrow(/adelanta/);
  });
});
