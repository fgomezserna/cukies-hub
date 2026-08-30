jest.mock("@/lib/uki-economy/ranking/service", () => ({
  assertWeeklyRankingManifestIntegrity: jest.fn((value) => value),
}));

jest.mock("@/lib/uki-economy/ranking/rules", () => ({
  assertWeeklyRankingSnapshotIntegrity: jest.fn((value) => value),
}));

import type { Db } from "mongodb";

import { resolveAppliedArenaRanking } from "@/lib/uki-economy/rewards/arena-ranking";
import { testRewardRule } from "@/lib/uki-economy/rewards/testing";

const PLAYER = "0x1111111111111111111111111111111111111111";

function rankingFixture() {
  return {
    _id: "ranking-week-33",
    rankingId: "ranking-week-33",
    periodId: "2026-W33",
    periodStart: new Date("2026-08-10T00:00:00.000Z"),
    nextRank: 3,
    manifestId: "manifest-week-33",
    sourceSetHash: "a".repeat(64),
    runId: "b".repeat(64),
    ruleVersion: "weekly-ranking-staging-test-v1",
    ruleConfigHash: "c".repeat(64),
  };
}

function manifestFixture() {
  return {
    manifestId: "manifest-week-33",
    periodId: "2026-W33",
    sourceSetHash: "a".repeat(64),
    runId: "b".repeat(64),
    ruleVersion: "weekly-ranking-staging-test-v1",
    ruleConfigHash: "c".repeat(64),
    payloadHash: "d".repeat(64),
  };
}

function database(previous: ReturnType<typeof rankingFixture> | null) {
  const rankingFindOne = jest.fn().mockResolvedValue(previous);
  const manifestFindOne = jest.fn().mockResolvedValue(previous ? manifestFixture() : null);
  const collection = jest.fn((name: string) => {
    if (name === "game_weekly_rankings") return { findOne: rankingFindOne };
    if (name === "weekly_ranking_manifests") return { findOne: manifestFindOne };
    throw new Error(`Unexpected collection ${name}`);
  });
  return {
    db: { collection } as unknown as Db,
    rankingFindOne,
    manifestFindOne,
  };
}

describe("applied Arena ranking", () => {
  it("conserva el ultimo rango sellado aunque el jugador pase una semana sin jugar", async () => {
    const previous = rankingFixture();
    const { db, rankingFindOne, manifestFindOne } = database(previous);
    const periodAnchorAt = new Date("2026-08-24T14:00:00.000Z");

    await expect(resolveAppliedArenaRanking({
      db,
      gameId: "treasure-hunt",
      walletAddress: PLAYER,
      creditSource: "pool",
      periodAnchorAt,
      rewardRule: testRewardRule(),
    })).resolves.toMatchObject({
      rank: 3,
      rewardBps: 8_000,
      sourceRankingId: previous.rankingId,
    });

    expect(rankingFindOne).toHaveBeenCalledWith({
      gameId: "treasure-hunt",
      walletNormalized: PLAYER,
      status: "sealed",
      periodStart: { $lt: new Date("2026-08-24T00:00:00.000Z") },
    }, {
      sort: { periodStart: -1, _id: -1 },
    });
    expect(manifestFindOne).toHaveBeenCalledWith({
      manifestId: previous.manifestId,
      periodId: previous.periodId,
    }, {});
  });

  it("aplica rango inicial cinco cuando nunca existio un ranking previo", async () => {
    const { db, manifestFindOne } = database(null);

    await expect(resolveAppliedArenaRanking({
      db,
      gameId: "treasure-hunt",
      walletAddress: PLAYER,
      creditSource: "pool",
      periodAnchorAt: new Date("2026-08-24T14:00:00.000Z"),
      rewardRule: testRewardRule(),
    })).resolves.toMatchObject({
      rank: 5,
      rewardBps: 6_000,
      sourceRankingId: `arena-initial:treasure-hunt:${PLAYER}:2026-W35`,
    });

    expect(manifestFindOne).not.toHaveBeenCalled();
  });
});
