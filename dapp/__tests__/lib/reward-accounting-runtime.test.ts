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
    })).resolves.toEqual({ scanned: 2, settled: 1, replayed: 1 });

    const pipeline = aggregate.mock.calls[0][0];
    expect(pipeline).toEqual(buildPendingTreasureHuntRewardPipeline(2));
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

  it("rejects an unsafe batch bound before reading Mongo", async () => {
    await expect(settlePendingTreasureHuntRewards({ limit: 1_001 })).rejects.toThrow(
      /entre 1 y 1000/,
    );
    expect(getEconomyDb).not.toHaveBeenCalled();
  });
});
