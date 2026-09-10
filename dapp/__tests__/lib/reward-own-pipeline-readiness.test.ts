jest.mock("@/lib/indexer-db/mongodb", () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));

import {
  assertRewardAllocationManifestBindings,
} from "@/lib/uki-economy/rewards/public";
import {
  RewardCalculationCoordinator,
  type SettleGameRewardsInput,
  type loadSettlementRewardSnapshot,
} from "@/lib/uki-economy/rewards/coordinator";
import {
  buildPendingTreasureHuntRewardPipeline,
} from "@/lib/uki-economy/rewards/accounting-runtime";
import {
  buildRewardPeriodAllocationHash,
  RewardPeriodSealService,
} from "@/lib/uki-economy/rewards/merkle";
import { RewardAllocationService } from "@/lib/uki-economy/rewards/service";
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from "@/lib/uki-economy/rewards/testing";
import type { CukieSourceKind } from "@/lib/uki-economy/rewards/types";

const PLAYER = "0x26789b9743d187174c3e3a87729730824a4d0c13";
const PERIOD_ID = "2026-W28";
const EFFECTIVE_AT = new Date("2026-07-10T12:00:00.000Z");
const SETTLE_AT = new Date("2026-07-10T12:05:00.000Z");

/** IDs copied from the Stage read on 2026-09-10; only the reward inputs are simulated. */
const LIVE_SESSIONS = [
  {
    sessionId:
      "game-session:412dfbfccef619e0452992c9f181907915257d3aeb7998f21524a3164e8db7f9",
    weightRaw: "107500000000000000",
    cukieSource: "seiku",
  },
  {
    sessionId:
      "game-session:5024d0013ce78a516fbdc2445e0aa7f7c38e8ccd4c6f57512cfd18f709840a52",
    weightRaw: "5000000000000000",
    cukieSource: "pool_original",
  },
  {
    sessionId:
      "game-session:e29ec49ed3fb1bac136731be3340e6c5ff3d6776ebc9344e61681b5efedbb6d4",
    weightRaw: "15000000000000000",
    cukieSource: "own",
  },
  {
    sessionId:
      "game-session:9864a7d4ebe69efc09b167354b00d9ece218507df3a4300eb4f375b00d3ea3df",
    weightRaw: "292500000000000000",
    cukieSource: "pool_original",
  },
  {
    sessionId:
      "game-session:ef7bf6f01a00306f067284ad2ab627682eef6e7511c4b63ee5e2c7371be87ca3",
    weightRaw: "15000000000000000",
    cukieSource: "own",
  },
] as const satisfies ReadonlyArray<{
  sessionId: string;
  weightRaw: string;
  cukieSource: CukieSourceKind;
}>;

type RewardSnapshot = Awaited<ReturnType<typeof loadSettlementRewardSnapshot>>;

function sourceIdForSession(sessionId: string) {
  // This is the current production boundary in coordinator.ts and the
  // accounting recovery pipeline. The test deliberately keeps the live
  // session prefix to distinguish a namespace from an accidental lookup.
  return `game-session:${sessionId}`;
}

function buildSnapshot(
  fixture: (typeof LIVE_SESSIONS)[number],
  index: number,
  rule: ReturnType<typeof testRewardRule>,
): RewardSnapshot {
  const sourceId = sourceIdForSession(fixture.sessionId);
  return {
    game: {
      sessionId: fixture.sessionId,
      walletNormalized: PLAYER,
      validation: {
        weightRaw: fixture.weightRaw,
        resultHash: `${String(index + 1).repeat(64)}`,
      },
      rule: {
        reward: { maxConvertibleRaw: "7500000000000000000" },
      },
    },
    rule,
    credit: {
      reservationId: `credit-reservation:${index + 1}`,
      payloadHash: `${String(index + 1).repeat(64)}`,
    },
    assignment: null,
    ownAssignment: null,
    arenaRanking: {
      sourceRankingId: null,
      evidenceHash: `${String(index + 2).repeat(64)}`,
      rank: null,
      rewardBps: 10_000,
    },
    periodId: PERIOD_ID,
    rewardEffectiveAt: EFFECTIVE_AT,
    sourceId,
    creditSource: "own",
    cukieSource: fixture.cukieSource,
  } as unknown as RewardSnapshot;
}

describe("rewards OWN pipeline readiness", () => {
  it("mantiene el namespace doble de sourceId desde sesiones live, con retry, lectura publica y sello Merkle", async () => {
    const rule = testRewardRule();
    const repository = new MemoryRewardRepository(rule);
    let failNextTransaction = true;
    const memoryRunner = createMemoryRewardTransactionRunner(repository);
    const rewardService = new RewardAllocationService(async (work) => {
      if (failNextTransaction) {
        failNextTransaction = false;
        throw new Error("transient reward worker failure");
      }
      return memoryRunner(work);
    });
    const snapshots = new Map<string, RewardSnapshot>();
    for (const [index, fixture] of LIVE_SESSIONS.entries()) {
      snapshots.set(fixture.sessionId, buildSnapshot(fixture, index, rule));
      repository.state.settledGameSessions.push({
        sessionId: fixture.sessionId,
        settledAt: new Date(SETTLE_AT),
      });
    }
    const loadSnapshot = async (input: SettleGameRewardsInput) => {
      const snapshot = snapshots.get(input.sessionId);
      if (!snapshot) throw new Error(`missing snapshot ${input.sessionId}`);
      return snapshot;
    };
    const coordinator = new RewardCalculationCoordinator(rewardService, loadSnapshot);

    const pipeline = buildPendingTreasureHuntRewardPipeline(100);
    const sourceStage = pipeline.find((stage) => "$set" in stage);
    expect(sourceStage).toEqual({
      $set: {
        __rewardSourceId: { $concat: ["game-session:", "$sessionId"] },
      },
    });
    const lookupStage = pipeline.find((stage) => "$lookup" in stage);
    expect(lookupStage).toEqual({
      $lookup: {
        from: "reward_source_manifests",
        localField: "__rewardSourceId",
        foreignField: "_id",
        as: "__rewardManifest",
      },
    });

    const first = LIVE_SESSIONS[0];
    const firstSourceId = sourceIdForSession(first.sessionId);
    expect(firstSourceId).toBe(
      "game-session:game-session:412dfbfccef619e0452992c9f181907915257d3aeb7998f21524a3164e8db7f9",
    );
    expect(`game-session:${first.sessionId}`).toBe(firstSourceId);
    expect(firstSourceId).not.toBe(first.sessionId);

    await expect(coordinator.settleGame({
      sessionId: first.sessionId,
      periodId: PERIOD_ID,
      expectedRuleVersion: rule.version,
      now: SETTLE_AT,
    })).rejects.toThrow("transient reward worker failure");
    expect(repository.state.sourceManifests).toHaveLength(0);

    const firstRetry = await coordinator.settleGame({
      sessionId: first.sessionId,
      periodId: PERIOD_ID,
      expectedRuleVersion: rule.version,
      now: SETTLE_AT,
    });
    expect(firstRetry.status).toBe("allocated");
    expect(firstRetry.result.replayed).toBe(false);

    for (const fixture of LIVE_SESSIONS.slice(1)) {
      const result = await coordinator.settleGame({
        sessionId: fixture.sessionId,
        periodId: PERIOD_ID,
        expectedRuleVersion: rule.version,
        now: SETTLE_AT,
      });
      expect(result.status).toBe("allocated");
      expect(result.result.replayed).toBe(false);
    }

    const replay = await coordinator.settleGame({
      sessionId: first.sessionId,
      periodId: PERIOD_ID,
      expectedRuleVersion: rule.version,
      now: new Date(SETTLE_AT.getTime() + 60_000),
    });
    expect(replay.status).toBe("allocated");
    expect(replay.result.replayed).toBe(true);
    expect(repository.state.sourceManifests).toHaveLength(LIVE_SESSIONS.length);
    expect(repository.state.emissionBudgetEvents).toHaveLength(LIVE_SESSIONS.length);
    expect(repository.state.incidents).toEqual([]);

    const expectedSourceIds = LIVE_SESSIONS.map(({ sessionId }) => sourceIdForSession(sessionId));
    expect(repository.state.sourceManifests.map((manifest) => manifest._id).sort()).toEqual(
      expectedSourceIds.slice().sort(),
    );
    expect(repository.state.sourceManifests.map((manifest) => manifest.sourceId).sort()).toEqual(
      expectedSourceIds.slice().sort(),
    );
    expect(repository.state.allocations.every((allocation) => (
      expectedSourceIds.includes(allocation.sourceId)
    ))).toBe(true);
    expect(repository.state.accruals.every((accrual) => (
      expectedSourceIds.includes(accrual.sourceId)
    ))).toBe(true);

    // This is the same exact binding check used by the public wallet reader.
    assertRewardAllocationManifestBindings(
      repository.state.allocations,
      repository.state.sourceManifests,
    );
    expect(() => assertRewardAllocationManifestBindings(
      repository.state.allocations,
      repository.state.sourceManifests.filter((manifest) => manifest.sourceId !== firstSourceId),
    )).toThrow("allocations sin manifest global exacto");

    for (const fixture of LIVE_SESSIONS) {
      const sourceId = sourceIdForSession(fixture.sessionId);
      const player = repository.state.allocations.find((allocation) => (
        allocation.sourceId === sourceId && allocation.category === "player"
      ));
      expect(player).toBeDefined();
      const expectedPlayerRaw = fixture.cukieSource === "own"
        ? fixture.weightRaw
        : (BigInt(fixture.weightRaw) / BigInt(2)).toString();
      expect(player?.amountRaw).toBe(expectedPlayerRaw);
      const sourceAccruals = repository.state.accruals.filter((accrual) => accrual.sourceId === sourceId);
      if (fixture.cukieSource === "own") {
        expect(sourceAccruals.some((accrual) => accrual.category.startsWith("cukie_pool_"))).toBe(false);
      } else if (fixture.cukieSource === "pool_original") {
        expect(sourceAccruals).toEqual(expect.arrayContaining([
          expect.objectContaining({ category: "cukie_pool_original_weekly" }),
        ]));
      } else {
        expect(sourceAccruals.some((accrual) => accrual.category.startsWith("cukie_pool_"))).toBe(false);
      }
    }

    const expectedPeriodAllocationHash = buildRewardPeriodAllocationHash(
      PERIOD_ID,
      repository.state.allocations,
      repository.state.accruals,
      repository.state.sourceManifests,
      repository.state.emissionBudgetEvents,
    );
    const periodSealService = new RewardPeriodSealService(memoryRunner);
    const sealed = await periodSealService.sealPeriod({
      periodId: PERIOD_ID,
      expectedSourceIds,
      expectedPeriodAllocationHash,
      expectedRuleVersion: rule.version,
      sealedBy: "readiness-test",
      now: new Date("2026-07-14T00:00:00.000Z"),
    });
    expect(sealed.replayed).toBe(false);
    expect(sealed.seal.expectedSourceIds).toEqual(expectedSourceIds.slice().sort());
    const sealedReplay = await periodSealService.sealPeriod({
      periodId: PERIOD_ID,
      expectedSourceIds,
      expectedPeriodAllocationHash,
      expectedRuleVersion: rule.version,
      sealedBy: "readiness-test",
      now: new Date("2026-07-14T00:01:00.000Z"),
    });
    expect(sealedReplay.replayed).toBe(true);
    expect(repository.state.periodSeals).toHaveLength(1);
  });
});
