import {
  assertCompetitionCreditRule,
  buildCompetitionCreditRuleConfigHash,
  buildCompetitionCreditPeriod,
  computePoolConfigEffectiveCutoff,
  stableCreditHash,
  validPoolCreditsPerSlot,
} from "@/lib/uki-economy/credits/rules";
import {
  buildCreditSourceHealthEvidenceHash,
  creditSourceCursorIsHealthy,
} from "@/lib/uki-economy/credits/source-health";
import { testCompetitionCreditRule } from "@/lib/uki-economy/credits/testing";

describe("competition credit rules", () => {
  it("requires an explicit versioned UTC cutoff and builds [cutoff,nextCutoff)", () => {
    const rule = testCompetitionCreditRule();
    const cutoff = new Date("2026-07-10T12:00:00.000Z");
    expect(buildCompetitionCreditPeriod(cutoff, rule)).toEqual({
      periodId: `credits-v1:${rule.configHash}:2026-07-10T12:00:00.000Z`,
      cutoff,
      settlementTarget: new Date("2026-07-10T16:00:00.000Z"),
      nextCutoff: new Date("2026-07-11T12:00:00.000Z"),
      ruleVersion: "credits-v1",
      ruleConfigHash: rule.configHash,
    });
    expect(() =>
      buildCompetitionCreditPeriod(new Date("2026-07-10T12:00:00.001Z"), rule)
    ).toThrow(/coincidir exactamente/);
  });

  it("computes config effectiveCutoff on the server; exact cutoff rolls to next day", () => {
    const rule = testCompetitionCreditRule();
    expect(
      computePoolConfigEffectiveCutoff(
        new Date("2026-07-10T11:59:59.999Z"),
        rule
      )
    ).toEqual(new Date("2026-07-10T12:00:00.000Z"));
    expect(
      computePoolConfigEffectiveCutoff(
        new Date("2026-07-10T12:00:00.000Z"),
        rule
      )
    ).toEqual(new Date("2026-07-11T12:00:00.000Z"));
  });

  it("only accepts 0..100 pool credits in multiples of ten", () => {
    for (const value of [0, 10, 50, 100])
      expect(validPoolCreditsPerSlot(value)).toBe(value);
    for (const value of [-10, 1, 95, 110, 10.5]) {
      expect(() => validPoolCreditsPerSlot(value)).toThrow();
    }
  });

  it("bounds snapshot capacity to the global 5,000 slots and requires server TTL", () => {
    expect(() =>
      assertCompetitionCreditRule(
        testCompetitionCreditRule({
          maxSnapshotSlots: 5_001,
        })
      )
    ).toThrow(/5000/);
    expect(() =>
      assertCompetitionCreditRule(
        testCompetitionCreditRule({
          reservationTtlMs: 0,
        })
      )
    ).toThrow(/reservationTtlMs/);
  });

  it("rejects canonical NFC key collisions instead of overwriting them", () => {
    expect(() => stableCreditHash({ "\u00e9": 1, "e\u0301": 2 })).toThrow(
      /Colision/
    );
  });

  it("binds configHash to every economic field and rejects non-canonical stored IDs", () => {
    const tampered = testCompetitionCreditRule();
    tampered.cutoffHourUtc = 13;
    expect(() => assertCompetitionCreditRule(tampered)).toThrow(/configHash/);

    const padded = testCompetitionCreditRule();
    padded.version = " credits-v1 ";
    padded.configHash = buildCompetitionCreditRuleConfigHash(padded);
    expect(() => assertCompetitionCreditRule(padded)).toThrow(/canonica/);

    const decomposed = testCompetitionCreditRule();
    decomposed.version = "cre\u0301dits-v1";
    decomposed.configHash = buildCompetitionCreditRuleConfigHash(decomposed);
    expect(() => assertCompetitionCreditRule(decomposed)).toThrow();
  });

  it("caps a server-side game cost at the 1,000 own-credit wallet maximum", () => {
    expect(
      assertCompetitionCreditRule(
        testCompetitionCreditRule({
          costs: [{ costCode: "max-cost", credits: 1_000, active: true }],
        })
      ).costs[0].credits
    ).toBe(1_000);
    expect(() =>
      assertCompetitionCreditRule(
        testCompetitionCreditRule({
          costs: [{ costCode: "too-large", credits: 1_001, active: true }],
        })
      )
    ).toThrow(/1000/);
  });

  it("hashes cursor, warning and round evidence independently of Mongo result order", () => {
    const base = {
      successAt: new Date("2026-07-10T12:00:00.000Z"),
      errorAt: null,
      checkpoint: { safeBlockNumber: 100, safeBlockHash: "0xabc" },
      cursors: [
        {
          _id: "b",
          contractAlias: "TOKEN",
          eventName: "Transfer",
          safeBlock: 100,
        },
        {
          _id: "a",
          contractAlias: "UKI_STAKING",
          eventName: "Staked",
          safeBlock: 100,
        },
      ],
      deadLetters: 0,
      pendingEvents: 0,
      incidents: 0,
      sourceRuleVersions: { uki: "uki-v2", nft: "nft-v3" },
      rounds: [
        { _id: "nft", route: "nft", ruleVersion: "nft-v3" },
        { _id: "uki", route: "uki", ruleVersion: "uki-v2" },
      ],
      stakingState: null,
      stakingPositionsCount: 0,
      vestingPositionsCount: 0,
      vestingLedgerCount: 0,
      cukieProjectionHash: "f".repeat(64),
      warnings: ["z", "a"],
    };
    expect(buildCreditSourceHealthEvidenceHash(base)).toBe(
      buildCreditSourceHealthEvidenceHash({
        ...base,
        cursors: [...base.cursors].reverse(),
        rounds: [...base.rounds].reverse(),
        warnings: [...base.warnings].reverse(),
      })
    );
  });

  it("accepts a cursor at or ahead of the completed UKI watermark, never behind it", () => {
    const rule = testCompetitionCreditRule();
    const cursor = {
      contractAlias: "UKI_STAKING",
      eventName: "Staked",
      contractAddress: rule.sourceContractAddresses.UKI_STAKING,
      updatedAt: new Date("2026-07-10T12:00:00.000Z"),
      safeBlock: 100,
      nextBlock: 101,
      bootstrapStatus: "verified",
      bootstrapStartBlock: 50,
      bootstrapVerifiedAt: new Date("2026-07-10T11:59:00.000Z"),
      verifiedChainId: 56,
      contractCodeHash:
        rule.verifiedSourceIdentities.UKI_STAKING.runtimeCodeHash,
      contractDeploymentBlock:
        rule.verifiedSourceIdentities.UKI_STAKING.deploymentBlock,
      contractConfigHash: rule.verifiedSourceIdentities.UKI_STAKING.configHash,
    };
    const input = {
      cursor,
      expectedAlias: "UKI_STAKING",
      expectedEventName: "Staked",
      expectedAddress: rule.sourceContractAddresses.UKI_STAKING,
      expectedSafeBlock: 100,
      freshnessCutoff: new Date("2026-07-10T11:45:00.000Z"),
      expectedChainId: rule.expectedBscChainId,
      expectedIdentity: rule.verifiedSourceIdentities.UKI_STAKING,
    };
    expect(creditSourceCursorIsHealthy(input)).toBe(true);
    expect(
      creditSourceCursorIsHealthy({
        ...input,
        cursor: { ...cursor, safeBlock: 101, nextBlock: 102 },
      })
    ).toBe(true);
    expect(
      creditSourceCursorIsHealthy({
        ...input,
        cursor: { ...cursor, safeBlock: 99 },
      })
    ).toBe(false);
    expect(
      creditSourceCursorIsHealthy({
        ...input,
        cursor: { ...cursor, contractAddress: `0x${"9".repeat(40)}` },
      })
    ).toBe(false);
    expect(
      creditSourceCursorIsHealthy({
        ...input,
        cursor: { ...cursor, contractCodeHash: `0x${"9".repeat(64)}` },
      })
    ).toBe(false);
    expect(
      creditSourceCursorIsHealthy({
        ...input,
        cursor: { ...cursor, verifiedChainId: 97 },
      })
    ).toBe(false);
  });
});
