import { calculateSettlementRewardAllocations } from "@/lib/uki-economy/rewards/calculation";
import {
  buildRewardPeriodAllocationHash,
  loadRewardDistributorIdentity,
  RewardClaimBatchService,
  RewardPeriodSealService,
  rewardHashPair,
} from "@/lib/uki-economy/rewards/merkle";
import { RewardAllocationService } from "@/lib/uki-economy/rewards/service";
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from "@/lib/uki-economy/rewards/testing";
import type { Hex } from "viem";

const { generateRewardsMerkle } = require("../../../packages/contracts/scripts/lib/rewards-merkle.cjs") as {
  generateRewardsMerkle: (input: Record<string, unknown>) => Record<string, unknown>;
};

const PLAYER = `0x${"a".repeat(40)}`;
const DISTRIBUTOR = `0x${"9".repeat(40)}`;
const NOW = new Date("2026-07-10T12:00:00.000Z");
const W28_CLOSED_AT = new Date("2026-07-13T00:00:00.000Z");
const W29_CLOSED_AT = new Date("2026-07-20T00:00:00.000Z");

async function fixture() {
  const rule = testRewardRule();
  const repository = new MemoryRewardRepository(rule);
  const runner = createMemoryRewardTransactionRunner(repository);
  const allocationService = new RewardAllocationService(runner);
  const claimService = new RewardClaimBatchService(runner, () => ({
    chainId: 56,
    distributorAddress: DISTRIBUTOR as `0x${string}`,
  }));
  const sealService = new RewardPeriodSealService(runner);
  const calculated = calculateSettlementRewardAllocations(rule, {
    periodId: "2026-W28",
    sourceId: "game-session:session:1",
    playerWallet: PLAYER,
    grossConvertedRaw: "7500",
    maxConvertibleRaw: "7500",
    creditSource: "pool",
    cukieSource: "own",
    ranking: 5,
    creditCostUnits: 100,
    weeklyReserveUnits: 25,
  });
  await allocationService.persistAllocationSet({
    periodId: "2026-W28",
    sourceId: "game-session:session:1",
    sourceTotalRaw: calculated.totals.sourceTotalRaw,
    expectedRuleVersion: rule.version,
    ruleEffectiveAt: NOW,
    allocations: calculated.allocations,
    accruals: calculated.accruals,
    calculation: {
      jobRunId: "reward-job:session:1",
      kind: "settlement",
      inputHash: "a".repeat(64),
      outputHash: "b".repeat(64),
    },
    now: NOW,
  });
  repository.state.settledGameSessions.push({ sessionId: "session:1", settledAt: NOW });
  const periodAllocationHash = buildRewardPeriodAllocationHash(
    "2026-W28",
    repository.state.allocations,
    repository.state.accruals,
    repository.state.sourceManifests,
  );
  await sealService.sealPeriod({
    periodId: "2026-W28",
    expectedSourceIds: ["game-session:session:1"],
    expectedPeriodAllocationHash: periodAllocationHash,
    expectedRuleVersion: rule.version,
    sealedBy: "reward-test-coordinator",
    now: W28_CLOSED_AT,
  });
  return {
    repository,
    claimService,
    sealService,
    allocationService,
    rule,
    periodAllocationHash,
  };
}

describe("reward claim batch draft", () => {
  it("rechaza la identidad de rewards si falta la cadena en vez de asumir mainnet", () => {
    const previousChainId = process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
    const previousDistributor = process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS;
    try {
      delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
      process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS = DISTRIBUTOR;
      expect(() => loadRewardDistributorIdentity()).toThrow(
        "CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID no identifica BSC."
      );
    } finally {
      if (previousChainId === undefined) delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
      else process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = previousChainId;
      if (previousDistributor === undefined) {
        delete process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS;
      } else {
        process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS = previousDistributor;
      }
    }
  });

  it("rechaza fail-closed sellar una semana ISO que sigue en curso", async () => {
    const repository = new MemoryRewardRepository(testRewardRule());
    const seal = new RewardPeriodSealService(
      createMemoryRewardTransactionRunner(repository),
    );
    await expect(seal.sealPeriod({
      periodId: "2026-W28",
      expectedSourceIds: ["game-session:future"],
      expectedPeriodAllocationHash: "a".repeat(64),
      expectedRuleVersion: "rewards-v1",
      sealedBy: "reward-test-coordinator",
      now: NOW,
    })).rejects.toThrow(/sigue en curso/);
    expect(repository.state.periodStates).toEqual([]);
    expect(repository.state.periodSeals).toEqual([]);
  });

  it("materializa Merkle determinista y compatible con proof por wallet", async () => {
    const { claimService, repository, periodAllocationHash } = await fixture();
    const input = {
      periodId: "2026-W28",
      expectedPeriodAllocationHash: periodAllocationHash,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: "ipfs://preview-only/rewards-2026-w28",
      now: NOW,
    };
    const first = await claimService.createDraft(input);
    const replay = await claimService.createDraft({
      ...input,
      now: new Date("2026-07-10T13:00:00.000Z"),
    });
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.batch.merkleRoot).toBe(first.batch.merkleRoot);
    expect(replay.batch.batchId).toBe(first.batch.batchId);
    expect(first.batch.status).toBe("draft");
    expect(first.batch.previewOnly).toBe(true);
    expect(first.batch.publishAuthorized).toBe(false);
    expect(first.batch.signature).toBeNull();
    expect(first.batch.transactionHash).toBeNull();
    expect(BigInt(first.batch.totalAllocatedRaw)).toBe(
      repository.state.allocations.reduce(
        (sum, allocation) => sum + BigInt(allocation.amountRaw),
        BigInt(0),
      ),
    );
    expect(BigInt(first.batch.totalAllocatedRaw)).toBeLessThan(
      BigInt(repository.state.sourceManifests[0].sourceTotalRaw),
    );
    expect(repository.state.proofs.map((proof) => proof.walletNormalized)).not.toContain(
      testRewardRule().destinations.creditPool.toLowerCase(),
    );
    const contractManifest = generateRewardsMerkle({
      periodId: first.batch.periodId,
      batchId: first.batch.batchId,
      chainId: first.batch.chainId,
      distributorAddress: first.batch.distributorAddress,
      metadata: first.batch.metadata,
      allocations: repository.state.proofs.map(({ walletAddress, amountRaw }) => ({
        walletAddress,
        amountRaw,
      })),
    });
    expect(contractManifest.batchId).toBe(first.batch.batchId);
    expect(contractManifest.merkleRoot).toBe(first.batch.merkleRoot);
    expect(contractManifest.canonicalInputHash).toBe(first.batch.canonicalInputHash);
    expect(contractManifest.metadataHash).toBe(first.batch.metadataHash);
    for (const claim of repository.state.proofs) {
      const root = claim.proof.reduce(
        (node, sibling) => rewardHashPair(node, sibling),
        claim.leaf as Hex
      );
      expect(root).toBe(first.batch.merkleRoot);
    }
  });

  it("rechaza cualquier intento de autorizacion, firma o publicacion", async () => {
    const { claimService, repository, periodAllocationHash } = await fixture();
    await expect(
      claimService.createDraft({
        periodId: "2026-W28",
        expectedPeriodAllocationHash: periodAllocationHash,
        chainId: 56,
        distributorAddress: DISTRIBUTOR,
        metadata: "preview",
        now: NOW,
        publishAuthorized: true,
      } as never)
    ).rejects.toThrow(/no acepta el campo/);
    expect(repository.state.batches).toHaveLength(0);
  });

  it("falla cerrado ante allocation o draft persistido manipulados", async () => {
    const tamperedAllocation = await fixture();
    tamperedAllocation.repository.state.allocations[0].amountRaw = "1";
    await expect(
      tamperedAllocation.claimService.createDraft({
        periodId: "2026-W28",
        expectedPeriodAllocationHash: tamperedAllocation.periodAllocationHash,
        chainId: 56,
        distributorAddress: DISTRIBUTOR,
        metadata: "preview",
        now: NOW,
      })
    ).rejects.toThrow(/manifest global|manipulada o bloqueada/);

    const tamperedBatch = await fixture();
    const input = {
      periodId: "2026-W28",
      expectedPeriodAllocationHash: tamperedBatch.periodAllocationHash,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: "preview",
      now: NOW,
    };
    await tamperedBatch.claimService.createDraft(input);
    tamperedBatch.repository.state.batches[0].publishAuthorized = true as false;
    await expect(tamperedBatch.claimService.createDraft(input)).rejects.toThrow(
      /draft persistido fue manipulado/
    );

    const tamperedManifest = await fixture();
    tamperedManifest.repository.state.sourceManifests[0].sourceSetHash = "0".repeat(64);
    await expect(tamperedManifest.claimService.createDraft({
      periodId: "2026-W28",
      expectedPeriodAllocationHash: tamperedManifest.periodAllocationHash,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: "preview",
      now: NOW,
    })).rejects.toThrow(/manifest global/);
  });

  it("rechaza sources nuevos o incidentes despues de sellar el periodo", async () => {
    const subject = await fixture();
    const second = calculateSettlementRewardAllocations(subject.rule, {
      periodId: "2026-W28",
      sourceId: "session:2",
      playerWallet: `0x${"b".repeat(40)}`,
      grossConvertedRaw: "7500",
      maxConvertibleRaw: "7500",
      creditSource: "pool",
      cukieSource: "own",
      ranking: 6,
      creditCostUnits: 100,
      weeklyReserveUnits: 25,
    });
    await expect(subject.allocationService.persistAllocationSet({
      periodId: "2026-W28",
      sourceId: "session:2",
      sourceTotalRaw: second.totals.sourceTotalRaw,
      expectedRuleVersion: subject.rule.version,
      ruleEffectiveAt: NOW,
      allocations: second.allocations,
      accruals: second.accruals,
      calculation: {
        jobRunId: "reward-job:session:2",
        kind: "settlement",
        inputHash: "c".repeat(64),
        outputHash: "d".repeat(64),
      },
      now: NOW,
    })).rejects.toThrow(/ya esta sellado/);
    subject.repository.state.incidents.push({
      _id: "incident:open",
      incidentId: "incident:open",
      periodId: "2026-W28",
      sourceId: "session:1",
      reasonCodes: ["TEST"],
      evidenceHash: "e".repeat(64),
      status: "open",
      detectedAt: NOW,
    });
    await expect(subject.claimService.createDraft({
      periodId: "2026-W28",
      expectedPeriodAllocationHash: subject.periodAllocationHash,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: "preview",
      now: NOW,
    })).rejects.toThrow(/incidentes abiertos/);
  });

  it("rechaza sellar si falta cualquier game settled del censo canonico", async () => {
    const rule = testRewardRule();
    const repository = new MemoryRewardRepository(rule);
    const runner = createMemoryRewardTransactionRunner(repository);
    const allocations = new RewardAllocationService(runner);
    const seal = new RewardPeriodSealService(runner);
    const calculated = calculateSettlementRewardAllocations(rule, {
      periodId: "2026-W28",
      sourceId: "game-session:only-materialized",
      playerWallet: PLAYER,
      grossConvertedRaw: "7500",
      maxConvertibleRaw: "7500",
      creditSource: "own",
      cukieSource: "own",
      ranking: null,
      creditCostUnits: 100,
      weeklyReserveUnits: 25,
    });
    await allocations.persistAllocationSet({
      periodId: "2026-W28",
      sourceId: "game-session:only-materialized",
      sourceTotalRaw: calculated.totals.sourceTotalRaw,
      expectedRuleVersion: rule.version,
      ruleEffectiveAt: NOW,
      allocations: calculated.allocations,
      accruals: calculated.accruals,
      calculation: {
        jobRunId: "reward-job:only-materialized",
        kind: "settlement",
        inputHash: "a".repeat(64),
        outputHash: "b".repeat(64),
      },
      now: NOW,
    });
    repository.state.settledGameSessions.push(
      { sessionId: "only-materialized", settledAt: NOW },
      { sessionId: "missing-obligation", settledAt: NOW },
    );
    const hash = buildRewardPeriodAllocationHash(
      "2026-W28",
      repository.state.allocations,
      repository.state.accruals,
      repository.state.sourceManifests,
    );
    await expect(seal.sealPeriod({
      periodId: "2026-W28",
      expectedSourceIds: ["game-session:only-materialized"],
      expectedPeriodAllocationHash: hash,
      expectedRuleVersion: rule.version,
      sealedBy: "reward-test-coordinator",
      now: W28_CLOSED_AT,
    })).rejects.toThrow(/censo canonico/);
  });

  it("rechaza sellar mientras exista un settlement de juego en curso", async () => {
    const subject = await fixture();
    // Reabrimos solo el estado del fixture para ejercitar el gate previo al
    // sello; la obligacion y su manifest siguen siendo canonicos.
    subject.repository.state.periodSeals = [];
    subject.repository.state.periodStates = subject.repository.state.periodStates.map((state) => ({
      ...state,
      status: "open" as const,
      sealId: undefined,
    }));
    subject.repository.state.pendingGameSettlements.push({
      sessionId: "in-flight",
      decidedAt: NOW,
    });
    await expect(subject.sealService.sealPeriod({
      periodId: "2026-W28",
      expectedSourceIds: ["game-session:session:1"],
      expectedPeriodAllocationHash: subject.periodAllocationHash,
      expectedRuleVersion: subject.rule.version,
      sealedBy: "reward-test-coordinator",
      now: W28_CLOSED_AT,
    })).rejects.toThrow(/settlements de juego en curso/);
  });

  it("valida el draft completo en replay, incluidas claims y batchId", async () => {
    const subject = await fixture();
    const input = {
      periodId: "2026-W28",
      expectedPeriodAllocationHash: subject.periodAllocationHash,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: "preview",
      now: NOW,
    };
    await subject.claimService.createDraft(input);
    subject.repository.state.proofs[0].amountRaw = "1";
    await expect(subject.claimService.createDraft(input)).rejects.toThrow(/manipulados/);
  });

  it("materializa mas de 10.000 wallets sin embeber proofs en el header BSON", async () => {
    const rule = testRewardRule();
    const repository = new MemoryRewardRepository(rule);
    const runner = createMemoryRewardTransactionRunner(repository);
    const allocations = new RewardAllocationService(runner);
    const seal = new RewardPeriodSealService(runner);
    const claims = new RewardClaimBatchService(runner, () => ({
      chainId: 56,
      distributorAddress: DISTRIBUTOR as `0x${string}`,
    }));
    const wallets = Array.from({ length: 10_001 }, (_, index) => (
      `0x${(index + 1_000).toString(16).padStart(40, "0")}`
    ));
    const sources = [wallets.slice(0, 5_001), wallets.slice(5_001)];
    for (const [index, sourceWallets] of sources.entries()) {
      await allocations.persistAllocationSet({
        periodId: "2026-W29",
        sourceId: `bulk:${index + 1}`,
        sourceTotalRaw: String(sourceWallets.length),
        expectedRuleVersion: rule.version,
        ruleEffectiveAt: NOW,
        allocations: sourceWallets.map((walletNormalized) => ({
          walletNormalized,
          category: "player",
          amountRaw: "1",
        })),
        calculation: {
          jobRunId: `reward-job:bulk:${index + 1}`,
          kind: "system",
          inputHash: String(index + 1).repeat(64),
          outputHash: String(index + 3).repeat(64),
        },
        now: NOW,
      });
    }
    const periodAllocationHash = buildRewardPeriodAllocationHash(
      "2026-W29",
      repository.state.allocations,
      repository.state.accruals,
      repository.state.sourceManifests,
    );
    await seal.sealPeriod({
      periodId: "2026-W29",
      expectedSourceIds: ["bulk:1", "bulk:2"],
      expectedPeriodAllocationHash: periodAllocationHash,
      expectedRuleVersion: rule.version,
      sealedBy: "reward-test-coordinator",
      now: W29_CLOSED_AT,
    });

    const result = await claims.createDraft({
      periodId: "2026-W29",
      expectedPeriodAllocationHash: periodAllocationHash,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: "ipfs://preview-only/rewards-2026-w29",
      now: NOW,
    });

    expect(result.batch.allocationCount).toBe(10_001);
    expect(repository.state.proofs).toHaveLength(10_001);
    expect(result.batch).not.toHaveProperty("claims");
    expect(JSON.stringify(result.batch).length).toBeLessThan(100_000);
  }, 60_000);
});
