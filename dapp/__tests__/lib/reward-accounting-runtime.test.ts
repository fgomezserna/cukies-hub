jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
}));

jest.mock("@/lib/uki-economy/rewards/coordinator", () => ({
  rewardCalculationCoordinator: { settleGame: jest.fn() },
}));

import { getEconomyDb } from "@/lib/indexer-db/mongodb";
import {
  buildPendingTreasureHuntRewardPipeline,
  settlePendingTreasureHuntRewards,
} from "@/lib/uki-economy/rewards/accounting-runtime";
import { rewardCalculationCoordinator } from "@/lib/uki-economy/rewards/coordinator";

function settledGame(ordinal: number) {
  return {
    sessionId: `settled-session-${ordinal}`,
    createdAt: new Date(`2026-08-24T14:0${ordinal}:00.000Z`),
    rule: {
      reward: { rewardRuleVersion: "rewards-staging-test-v4" },
    },
  };
}

describe("pending Treasure Hunt reward recovery", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("filters existing manifests before the batch limit so old rows cannot starve missing rewards", async () => {
    const candidates = [settledGame(1), settledGame(2)];
    const toArray = jest.fn().mockResolvedValue(candidates);
    const aggregate = jest.fn().mockReturnValue({ toArray });
    const collection = jest.fn((name: string) => {
      if (name !== "game_economy_sessions") throw new Error(`Unexpected collection ${name}`);
      return { aggregate };
    });
    (getEconomyDb as jest.Mock).mockResolvedValue({ collection });
    (rewardCalculationCoordinator.settleGame as jest.Mock)
      .mockResolvedValueOnce({ result: { status: "allocated", replayed: false } })
      .mockResolvedValueOnce({ result: { status: "allocated", replayed: true } });

    await expect(settlePendingTreasureHuntRewards({
      now: new Date("2026-08-24T15:00:00.000Z"),
      limit: 2,
      forwardActivationAt: new Date("2026-08-24T14:00:00.000Z"),
    })).resolves.toEqual({ scanned: 2, settled: 1, replayed: 1 });

    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline).toEqual(buildPendingTreasureHuntRewardPipeline(
      2,
      new Date("2026-08-24T14:00:00.000Z"),
    ));
    const lookupIndex = pipeline.findIndex((stage: object) => "$lookup" in stage);
    const missingIndex = pipeline.findIndex(
      (stage: { $match?: object }) => stage.$match
        && "__rewardManifest.0" in stage.$match,
    );
    const limitIndex = pipeline.findIndex((stage: object) => "$limit" in stage);
    expect(lookupIndex).toBeGreaterThan(-1);
    expect(missingIndex).toBeGreaterThan(lookupIndex);
    expect(limitIndex).toBeGreaterThan(missingIndex);
    expect(pipeline).toContainEqual({ $sort: { settledAt: 1, sessionId: 1 } });
    expect(rewardCalculationCoordinator.settleGame).toHaveBeenCalledTimes(2);
    expect(rewardCalculationCoordinator.settleGame).toHaveBeenNthCalledWith(1, {
      sessionId: "settled-session-1",
      periodId: "2026-W35",
      expectedRuleVersion: "rewards-staging-test-v4",
      now: new Date("2026-08-24T15:00:00.000Z"),
    });
  });

  it("uses the canonical session start boundary, not settledAt, for staging", () => {
    const activationAt = new Date("2026-08-24T14:00:00.000Z");
    type CandidateMatch = {
      status: string;
      gameId: string;
      "rule.version": string;
      createdAt: { $type: "date"; $gte: Date };
      settledAt: { $type: "date" };
    };
    const match = (buildPendingTreasureHuntRewardPipeline(2, activationAt)[0] as {
      $match: CandidateMatch;
    }).$match;
    expect(match).toEqual({
      status: "settled",
      gameId: "treasure-hunt",
      "rule.version": "staging-test-v4",
      createdAt: { $type: "date", $gte: activationAt },
      settledAt: { $type: "date" },
    });
    const historicalCompletedLate = {
      createdAt: new Date(activationAt.getTime() - 1),
      settledAt: new Date(activationAt.getTime() + 1),
    };
    const newSessionCompleted = {
      createdAt: activationAt,
      settledAt: new Date(activationAt.getTime() + 1),
    };
    expect(historicalCompletedLate.createdAt.getTime()).toBeLessThan(
      match.createdAt.$gte.getTime(),
    );
    expect(newSessionCompleted.createdAt.getTime()).toBeGreaterThanOrEqual(
      match.createdAt.$gte.getTime(),
    );
    expect(match.settledAt).toEqual({ $type: "date" });
  });

  it("keeps the production catch-up query free of the staging lower bound", () => {
    const match = (buildPendingTreasureHuntRewardPipeline(2)[0] as {
      $match: { createdAt: { $type: string }; settledAt: { $type: string } };
    }).$match;
    expect(match.createdAt).toEqual({ $type: "date" });
    expect(match.settledAt).toEqual({ $type: "date" });
  });

  it("rejects an unsafe batch bound before reading Mongo", async () => {
    await expect(settlePendingTreasureHuntRewards({
      limit: 1_001,
      forwardActivationAt: new Date("2026-08-24T14:00:00.000Z"),
    })).rejects.toThrow(
      /entre 1 y 1000/,
    );
    expect(getEconomyDb).not.toHaveBeenCalled();
  });
});
