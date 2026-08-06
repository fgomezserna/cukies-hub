jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import { materializeRewardMerkleDraft } from '@/lib/uki-economy/rewards/merkle';
import {
  assertRewardAllocationManifestBindings,
  listWalletRewardStatus,
  validatePublishedRewardClaimable,
} from '@/lib/uki-economy/rewards/public';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { calculateSettlementRewardAllocations } from '@/lib/uki-economy/rewards/calculation';
import { RewardAllocationService } from '@/lib/uki-economy/rewards/service';
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from '@/lib/uki-economy/rewards/testing';

const WALLET = `0x${'a'.repeat(40)}` as `0x${string}`;
const DISTRIBUTOR = `0x${'9'.repeat(40)}` as `0x${string}`;
const TX = `0x${'1'.repeat(64)}`;
const BLOCK = `0x${'2'.repeat(64)}`;
const STARTS_AT_RAW = '1783681200';
const EXPIRES_AT_RAW = '1783688400';
const STARTS_AT = new Date(Number(STARTS_AT_RAW) * 1_000);
const EXPIRES_AT = new Date(Number(EXPIRES_AT_RAW) * 1_000);

function fixture() {
  const draft = materializeRewardMerkleDraft({
    periodId: '2026-W28',
    chainId: 56,
    distributorAddress: DISTRIBUTOR,
    metadata: 'ipfs://rewards/2026-W28',
    sourceAllocationSetHash: 'a'.repeat(64),
    periodSealId: 'seal:2026-W28',
    ruleVersion: 'rewards-v1',
    ruleConfigHash: 'b'.repeat(64),
    sourceIds: ['game-session:canonical'],
    claims: [{ walletAddress: WALLET, amountRaw: '7500' }],
    createdAt: new Date('2026-07-10T10:00:00.000Z'),
  });
  const publicationEventId = 'BSC:REWARDS_DISTRIBUTOR:BatchPublished:1:0';
  const batch = {
    ...draft.batch,
    status: 'published' as const,
    previewOnly: false as const,
    publishAuthorized: true as const,
    transactionHash: TX,
    publicationEventId,
    publicationTransactionHash: TX,
    publicationBlockNumber: 100,
    publicationBlockHash: BLOCK,
    publicationLogIndex: 0,
    publishedAt: STARTS_AT,
    publishedBatchId: draft.batch.batchId,
    publishedMerkleRoot: draft.batch.merkleRoot,
    publishedInputHash: draft.batch.canonicalInputHash,
    publishedMetadataHash: draft.batch.metadataHash,
    publishedTotalAllocatedRaw: draft.batch.totalAllocatedRaw,
    publishedProofSetHash: draft.batch.proofSetHash,
    publishedPeriodSealId: draft.batch.periodSealId,
    startsAtRaw: STARTS_AT_RAW,
    expiresAtRaw: EXPIRES_AT_RAW,
    startsAt: STARTS_AT,
    expiresAt: EXPIRES_AT,
    totalClaimedRaw: '0',
    claimedCount: 0,
    closed: false,
  };
  const publicationEvent = {
    _id: publicationEventId,
    chain: 'BSC',
    contractAlias: 'REWARDS_DISTRIBUTOR',
    contractAddress: DISTRIBUTOR,
    eventName: 'BatchPublished',
    status: 'projected',
    txHash: TX,
    blockHash: BLOCK,
    blockNumber: 100,
    logIndex: 0,
    normalized: {
      batchId: batch.batchId,
      merkleRoot: batch.merkleRoot,
      inputHash: batch.canonicalInputHash,
      metadataHash: batch.metadataHash,
      totalAllocatedRaw: batch.totalAllocatedRaw,
      startsAtRaw: STARTS_AT_RAW,
      expiresAtRaw: EXPIRES_AT_RAW,
    },
  };
  return { batch, proof: draft.proofs[0], publicationEvent };
}

describe('public reward claimable', () => {
  it('falla cerrado si una allocation publica carece de manifest global exacto', async () => {
    const rule = testRewardRule();
    const repository = new MemoryRewardRepository(rule);
    const service = new RewardAllocationService(createMemoryRewardTransactionRunner(repository));
    const calculated = calculateSettlementRewardAllocations(rule, {
      periodId: '2026-W28',
      sourceId: 'game-session:public-manifest',
      playerWallet: WALLET,
      grossConvertedRaw: '7500',
      maxConvertibleRaw: '7500',
      creditSource: 'pool',
      cukieSource: 'own',
      ranking: 5,
      creditCostUnits: 100,
      weeklyReserveUnits: 25,
    });
    const persisted = await service.persistAllocationSet({
      periodId: '2026-W28',
      sourceId: 'game-session:public-manifest',
      sourceTotalRaw: calculated.totals.sourceTotalRaw,
      expectedRuleVersion: rule.version,
      ruleEffectiveAt: new Date('2026-07-10T12:00:00.000Z'),
      allocations: calculated.allocations,
      accruals: calculated.accruals,
      calculation: {
        jobRunId: 'reward-job:public-manifest',
        kind: 'settlement',
        inputHash: 'a'.repeat(64),
        outputHash: 'b'.repeat(64),
      },
      now: new Date('2026-07-10T12:00:00.000Z'),
    });
    expect(() => assertRewardAllocationManifestBindings(
      persisted.allocations,
      repository.state.sourceManifests,
    )).not.toThrow();
    expect(() => assertRewardAllocationManifestBindings(persisted.allocations, [])).toThrow(
      /sin manifest global exacto/,
    );
    repository.state.sourceManifests[0].sourceSetHash = '0'.repeat(64);
    expect(() => assertRewardAllocationManifestBindings(
      persisted.allocations,
      repository.state.sourceManifests,
    )).toThrow(/sin manifest global exacto/);
  });

  it('materializa claimableRaw y devuelve el batch/proof publicado desde Mongo', async () => {
    const subject = fixture();
    const cursor = (documents: unknown[]) => {
      const value = {
        sort: () => value,
        limit: () => value,
        toArray: async () => documents,
      };
      return value;
    };
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => ({
        find: () => cursor(
          name === 'reward_claim_proofs'
            ? [subject.proof]
            : name === 'reward_claim_batches'
              ? [subject.batch]
              : name === 'chain_events'
                ? [subject.publicationEvent]
                : [],
        ),
        countDocuments: async () => 0,
      }),
    });
    jest.useFakeTimers().setSystemTime(new Date(Number(STARTS_AT_RAW) * 1_000 + 1));
    try {
      const result = await listWalletRewardStatus({ walletAddress: WALLET });
      expect(result).toMatchObject({
        claimableRaw: '7500',
        claimPublished: true,
        claimables: [{
          batch: { batchId: subject.batch.batchId, amountRaw: '7500' },
          proof: { proofId: subject.proof.proofId },
          onChainStatus: 'claimable',
        }],
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('devuelve batch y proof solo tras validar su publicacion BSC', () => {
    const subject = fixture();
    const result = validatePublishedRewardClaimable({
      ...subject,
      expectedWallet: WALLET,
      now: new Date(Number(STARTS_AT_RAW) * 1_000 + 1),
    });
    expect(result).toMatchObject({
      batch: {
        batchId: subject.batch.batchId,
        periodId: '2026-W28',
        chainId: 56,
        amountRaw: '7500',
        publicationTransactionHash: TX,
      },
      proof: {
        proofId: subject.proof.proofId,
        leaf: subject.proof.leaf,
        siblings: subject.proof.proof,
      },
      onChainStatus: 'claimable',
    });
  });

  it('falla cerrado si el evento o el proof no coincide exactamente', () => {
    const wrongEvent = fixture();
    wrongEvent.publicationEvent.normalized.merkleRoot = `0x${'f'.repeat(64)}`;
    expect(() => validatePublishedRewardClaimable({
      ...wrongEvent,
      expectedWallet: WALLET,
      now: new Date(Number(STARTS_AT_RAW) * 1_000 + 1),
    })).toThrow(/no coincide con el batch/);

    const wrongProof = fixture();
    wrongProof.proof.amountRaw = '1';
    expect(() => validatePublishedRewardClaimable({
      ...wrongProof,
      expectedWallet: WALLET,
      now: new Date(Number(STARTS_AT_RAW) * 1_000 + 1),
    })).toThrow(/Proof/);
  });

  it('expone el estado temporal on-chain sin llamar claimable a un batch futuro o expirado', () => {
    const subject = fixture();
    expect(validatePublishedRewardClaimable({
      ...subject,
      expectedWallet: WALLET,
      now: new Date(Number(STARTS_AT_RAW) * 1_000 - 1),
    }).onChainStatus).toBe('scheduled');
    expect(validatePublishedRewardClaimable({
      ...subject,
      expectedWallet: WALLET,
      now: EXPIRES_AT,
    }).onChainStatus).toBe('expired');
  });
});
