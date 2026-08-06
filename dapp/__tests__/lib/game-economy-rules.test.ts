import {
  assertGameEconomyRuleSnapshot,
  assertProductiveGameRewardBinding,
  buildGameRuleConfigHash,
  calculateGameScore,
  distributeGameAmountExact,
  parseCanonicalRaw,
} from "@/lib/uki-economy/game-economy/rules";
import { testGameEconomyRule } from "@/lib/uki-economy/game-economy/testing";
import {
  GAME_ECONOMY_COLLECTIONS,
  GAME_ECONOMY_INDEX_DEFINITIONS,
} from "@/lib/uki-economy/game-economy/index-definitions";

describe("game economy exact rules", () => {
  const calculation = {
    scoreCapRaw: "1000",
    weightNumeratorRaw: "3",
    weightDenominatorRaw: "2",
  };

  it("caps the verified score at the exact boundary without floats", () => {
    expect(calculateGameScore(calculation, "999")).toEqual({
      scoreRaw: "999",
      cappedScoreRaw: "999",
      weightRaw: "1498",
    });
    expect(calculateGameScore(calculation, "1000")).toEqual({
      scoreRaw: "1000",
      cappedScoreRaw: "1000",
      weightRaw: "1500",
    });
    expect(calculateGameScore(calculation, "1001")).toEqual({
      scoreRaw: "1001",
      cappedScoreRaw: "1000",
      weightRaw: "1500",
    });
  });

  it("rejects non-canonical, negative and uint256-overflow scores", () => {
    expect(() => parseCanonicalRaw("01", "score")).toThrow(/canonico/);
    expect(() => parseCanonicalRaw("-1", "score")).toThrow(/canonico/);
    expect(() =>
      parseCanonicalRaw((BigInt(1) << BigInt(256)).toString(10), "score")
    ).toThrow(/uint256/);
  });

  it("distributes every raw unit by largest remainder deterministically", () => {
    const result = distributeGameAmountExact("10", [
      { participantId: "carol", weightRaw: "1" },
      { participantId: "alice", weightRaw: "1" },
      { participantId: "bob", weightRaw: "1" },
    ]);
    expect(result).toEqual([
      { participantId: "alice", amountRaw: "4" },
      { participantId: "bob", amountRaw: "3" },
      { participantId: "carol", amountRaw: "3" },
    ]);
    expect(
      result.reduce((sum, item) => sum + BigInt(item.amountRaw), BigInt(0))
    ).toBe(BigInt(10));
  });

  it("fails closed when a distribution has no authorized weight", () => {
    expect(() =>
      distributeGameAmountExact("10", [
        { participantId: "alice", weightRaw: "0" },
      ])
    ).toThrow(/peso total/);
  });

  it("liga la regla productiva a rewards y a un maximo exacto de 7.5 UKI raw", () => {
    const rule = testGameEconomyRule({
      calculation: {
        scoreCapRaw: "1000",
        weightNumeratorRaw: "7500000000000000",
        weightDenominatorRaw: "1",
      },
      reward: {
        rewardRuleVersion: "rewards-v1",
        rewardRuleConfigHash: "d".repeat(64),
        maxConvertibleRaw: "7500000000000000000",
      },
    });
    rule.configHash = buildGameRuleConfigHash(rule);
    expect(assertProductiveGameRewardBinding(rule)).toEqual(rule.reward);

    const wrongMaximum = {
      ...rule,
      reward: { ...rule.reward, maxConvertibleRaw: "7500000000000000001" },
    };
    wrongMaximum.configHash = buildGameRuleConfigHash(wrongMaximum);
    expect(() => assertProductiveGameRewardBinding(wrongMaximum)).toThrow(
      /exactamente 7.5 UKI raw|no alcanza exactamente/,
    );

    const wrongHash = {
      ...rule,
      reward: { ...rule.reward, rewardRuleConfigHash: "no-sha" },
    };
    wrongHash.configHash = buildGameRuleConfigHash(wrongHash);
    expect(() => assertGameEconomyRuleSnapshot(wrongHash)).toThrow(/rewards invalido/);
  });

  it("declares unique rule/session idempotency and bounded scan indexes", () => {
    expect(GAME_ECONOMY_COLLECTIONS).toEqual([
      "game_economy_rule_state",
      "game_economy_rules",
      "game_economy_sessions",
      "game_economy_events",
      "game_economy_resource_bindings",
      "game_owned_cukie_epochs",
      "game_owned_cukie_assignments",
      "game_owned_cukie_events",
      "game_result_evidence",
      "game_economy_runtime_state",
      "game_economy_runtime_runs",
    ]);
    const unique = GAME_ECONOMY_INDEX_DEFINITIONS.filter(
      (definition) =>
        "unique" in definition.options && definition.options.unique
    ).map(
      (definition) =>
        `${definition.collection}:${JSON.stringify(definition.keys)}`
    );
    expect(unique).toEqual(
      expect.arrayContaining([
        'game_economy_rules:{"gameId":1,"version":1}',
        'game_economy_sessions:{"sessionId":1}',
        'game_economy_sessions:{"createCommand.idempotencyKey":1}',
        'game_economy_sessions:{"validation.evidenceId":1}',
        'game_economy_resource_bindings:{"sessionId":1,"kind":1}',
        'game_owned_cukie_epochs:{"assetId":1,"ownerNormalized":1,"ownershipEventId":1}',
        'game_owned_cukie_assignments:{"sessionId":1}',
        'game_owned_cukie_events:{"idempotencyKey":1}',
        'game_result_evidence:{"evidenceReference":1}',
        'game_economy_events:{"sessionId":1,"toRevision":1}',
      ])
    );
    expect(GAME_ECONOMY_INDEX_DEFINITIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          collection: "game_economy_sessions",
          keys: { status: 1, expiresAt: 1, _id: 1 },
        }),
        expect.objectContaining({
          collection: "game_economy_sessions",
          keys: { status: 1, settledAt: 1, sessionId: 1 },
        }),
        expect.objectContaining({
          collection: "game_economy_sessions",
          keys: { "settlementIntent.decidedAt": 1, _id: 1 },
        }),
      ])
    );
  });
});
