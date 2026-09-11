jest.mock('@/lib/indexer-db/mongodb', () => ({ getEconomyDb: jest.fn() }));

import { materializeRewardMerkleDraft } from '@/lib/uki-economy/rewards/merkle';
import {
  assertRewardAllocationManifestBindings,
  listWalletRewardStatus,
  validatePublishedRewardClaimable,
} from '@/lib/uki-economy/rewards/public';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { calculateSettlementRewardAllocations } from '@/lib/uki-economy/rewards/calculation';
import { sealDailyRewardAccounting } from '@/lib/uki-economy/rewards/accounting';
import type {
  RewardAccountingAllocationDocument,
  RewardAccountingAmbassadorSnapshot,
} from '@/lib/uki-economy/rewards/accounting-types';
import { RewardAllocationService } from '@/lib/uki-economy/rewards/service';
import {
  createMemoryRewardTransactionRunner,
  MemoryRewardRepository,
  testRewardRule,
} from '@/lib/uki-economy/rewards/testing';
import { stableRewardHash } from '@/lib/uki-economy/rewards/rules';

const WALLET = `0x${'a'.repeat(40)}` as `0x${string}`;
const SECOND_WALLET = `0x${'b'.repeat(40)}` as `0x${string}`;
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

function accountingFixtureForAllocations(
  allocationCores: Array<{
    allocationId: string;
    walletNormalized: string;
    category: 'credit_pool';
    amountRaw: string;
    fundingMode: 'daily_emission';
    sourceIds: string[];
  }>,
  ambassadorSnapshots: RewardAccountingAmbassadorSnapshot[] = [],
) {
  const emissionRaw = allocationCores
    .reduce((sum, allocation) => sum + BigInt(allocation.amountRaw), BigInt(0))
    .toString();
  const sourceIds = [
    ...new Set(allocationCores.flatMap((allocation) => allocation.sourceIds)),
  ];
  const accounting = sealDailyRewardAccounting({
    dayId: '2026-09-07',
    ruleVersion: 'rewards-staging-test-v4',
    ruleConfigHash: 'b'.repeat(64),
    emissionRaw,
    buckets: {
      playersRaw: '0',
      creditPoolRaw: emissionRaw,
      cukiePoolRaw: '0',
      ambassadorOrdinaryRaw: '0',
      weeklyPrizeRaw: '0',
      ambassadorWeeklyRaw: '0',
    },
    sourceIds,
    allocations: allocationCores,
    ambassadorSnapshots,
    destinations: {
      treasury: `0x${'6'.repeat(40)}`,
      marketingDevelopment: `0x${'7'.repeat(40)}`,
      supplyReduction: `0x${'8'.repeat(40)}`,
    },
    sealedAt: new Date('2026-09-08T16:00:00.000Z'),
  });
  const allocations = allocationCores.map((allocationCore) => {
    const immutable = {
      accountingId: accounting._id,
      accountingKind: 'daily' as const,
      periodId: accounting.dayId,
      ...allocationCore,
      availableAt: accounting.sealedAt,
      status: 'allocated_offchain' as const,
      createdAt: accounting.sealedAt,
    };
    return {
      _id: immutable.allocationId,
      ...immutable,
      payloadHash: stableRewardHash({
        kind: 'reward-accounting-allocation-document',
        ...immutable,
      }),
    };
  });
  return {
    accounting,
    allocations,
  };
}

function accountingFixture() {
  const { accounting, allocations } = accountingFixtureForAllocations([
    {
      allocationId: 'c'.repeat(64),
      walletNormalized: WALLET,
      category: 'credit_pool',
      amountRaw: '750000000000000000',
      fundingMode: 'daily_emission',
      sourceIds: ['game-session:stage-public-reward'],
    },
  ]);
  return { accounting, allocation: allocations[0] };
}

function canonicalDbFixture(input: {
  accounting: ReturnType<typeof accountingFixtureForAllocations>['accounting'];
  allocations: ReturnType<typeof accountingFixtureForAllocations>['allocations'];
  claims?: unknown[];
  batches?: unknown[];
  proofs?: unknown[];
  events?: unknown[];
}) {
  return {
    collection: (name: string) => ({
      find: (query?: Record<string, unknown>) =>
        cursor(
          name === 'reward_accounting_allocations'
            ? input.allocations.filter(
                (allocation) => allocation.walletNormalized === WALLET,
              )
            : name === 'reward_daily_accounting'
            ? [input.accounting]
            : name === 'reward_claims'
            ? input.claims ?? []
            : name === 'reward_claim_batches'
            ? input.batches ?? []
            : name === 'reward_claim_proofs'
            ? '$or' in (query ?? {})
              ? input.proofs ?? []
              : []
            : name === 'chain_events'
            ? input.events ?? []
            : [],
        ),
      countDocuments: async () => 0,
    }),
  };
}

function validClaimHistoryFixture(count: number) {
  const claims: unknown[] = [];
  const batches: unknown[] = [];
  const proofs: unknown[] = [];
  const events: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const amountRaw = '7500';
    const draft = materializeRewardMerkleDraft({
      periodId: `claim-period-${index}`,
      chainId: 56,
      distributorAddress: DISTRIBUTOR,
      metadata: `ipfs://rewards/claim-period-${index}`,
      sourceAllocationSetHash: 'a'.repeat(64),
      periodSealId: `seal:claim-period-${index}`,
      ruleVersion: 'rewards-v1',
      ruleConfigHash: 'b'.repeat(64),
      sourceIds: [`game-session:claim-${index}`],
      claims: [{ walletAddress: WALLET, amountRaw }],
      createdAt: new Date(`2026-07-10T${String(index % 24).padStart(2, '0')}:00:00.000Z`),
    });
    const claimEventId = `BSC:REWARDS_DISTRIBUTOR:RewardClaimed:${index}:0`;
    const transactionHash = `0x${(index + 3).toString(16).padStart(64, '0')}`;
    const blockHash = `0x${(index + 1003).toString(16).padStart(64, '0')}`;
    const batch = {
      ...draft.batch,
      status: 'published' as const,
      previewOnly: false as const,
      publishAuthorized: true as const,
    };
    const claim = {
      _id: claimEventId,
      eventId: claimEventId,
      chain: 'BSC' as const,
      contractAddress: DISTRIBUTOR,
      batchId: batch.batchId,
      walletAddress: WALLET,
      walletNormalized: WALLET,
      amountRaw,
      transactionHash,
      blockNumber: index + 1,
      blockHash,
      logIndex: 0,
      indexedAt: new Date(`2026-07-11T00:${String(index % 60).padStart(2, '0')}:00.000Z`),
      createdAt: new Date(`2026-07-11T00:${String(index % 60).padStart(2, '0')}:00.000Z`),
    };
    claims.push(claim);
    batches.push(batch);
    proofs.push(draft.proofs[0]);
    events.push({
      _id: claimEventId,
      chain: 'BSC',
      contractAlias: 'REWARDS_DISTRIBUTOR',
      contractAddress: DISTRIBUTOR,
      eventName: 'RewardClaimed',
      status: 'projected',
      txHash: transactionHash,
      blockHash,
      blockNumber: index + 1,
      logIndex: 0,
      normalized: {
        batchId: batch.batchId,
        accountNormalized: WALLET,
        amountRaw,
      },
    });
  }
  return { claims, batches, proofs, events };
}

function cursor(documents: unknown[]) {
  const value = {
    sort: () => value,
    limit: () => value,
    toArray: async () => documents,
  };
  return value;
}

describe('public reward claimable', () => {
  it('expone el cierre contable final como calculado y pendiente de publicación', async () => {
    const { accounting, allocation } = accountingFixture();
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => ({
        find: () =>
          cursor(
            name === 'reward_accounting_allocations'
              ? [allocation]
              : name === 'reward_daily_accounting'
              ? [accounting]
              : [],
          ),
        countDocuments: async () => 0,
      }),
    });

    const result = await listWalletRewardStatus({ walletAddress: WALLET });

    expect(result).toMatchObject({
      sourceStatus: 'canonical',
      calculatedRaw: allocation.amountRaw,
      pendingPublicationRaw: allocation.amountRaw,
      pendingRaw: allocation.amountRaw,
      claimableRaw: '0',
      unknownRaw: '0',
      publicationStates: [
        {
          allocationId: allocation.allocationId,
          periodId: allocation.periodId,
          status: 'calculated',
          nextAction: 'prepare_publication',
          planStatus: null,
        },
      ],
    });
  });

  it('acepta snapshots ambassador sellados y rechaza su mutacion', async () => {
    const ambassadorSnapshots: RewardAccountingAmbassadorSnapshot[] = [{
      participantWallet: WALLET,
      ambassadorWallet: SECOND_WALLET,
      commissionEligible: true,
      capturedAt: new Date('2026-09-07T23:59:00.000Z'),
      evidenceHash: 'e'.repeat(64),
    }];
    const { accounting, allocations } = accountingFixtureForAllocations([
      {
        allocationId: 'c'.repeat(64),
        walletNormalized: WALLET,
        category: 'credit_pool',
        amountRaw: '750000000000000000',
        fundingMode: 'daily_emission',
        sourceIds: ['game-session:stage-public-reward'],
      },
    ], ambassadorSnapshots);
    const allocation = allocations[0];
    (getEconomyDb as jest.Mock).mockResolvedValue(
      canonicalDbFixture({ accounting, allocations: [allocation] }),
    );

    await expect(listWalletRewardStatus({ walletAddress: WALLET })).resolves.toMatchObject({
      sourceStatus: 'canonical',
      calculatedRaw: allocation.amountRaw,
    });

    const tampered = {
      ...accounting,
      ambassadorSnapshots: accounting.ambassadorSnapshots!.map((snapshot) => ({
        ...snapshot,
        commissionEligible: false,
      })),
    };
    (getEconomyDb as jest.Mock).mockResolvedValue(
      canonicalDbFixture({ accounting: tampered, allocations: [allocation] }),
    );
    await expect(
      listWalletRewardStatus({ walletAddress: WALLET }),
    ).rejects.toThrow(/cierre diario .*canonico/);
  });

  it('acepta un cierre compartido cuando la wallet consulta solo sus allocations', async () => {
    const { accounting, allocations } = accountingFixtureForAllocations([
      {
        allocationId: 'c'.repeat(64),
        walletNormalized: WALLET,
        category: 'credit_pool',
        amountRaw: '750000000000000000',
        fundingMode: 'daily_emission',
        sourceIds: ['game-session:stage-public-reward-a'],
      },
      {
        allocationId: 'd'.repeat(64),
        walletNormalized: SECOND_WALLET,
        category: 'credit_pool',
        amountRaw: '250000000000000000',
        fundingMode: 'daily_emission',
        sourceIds: ['game-session:stage-public-reward-b'],
      },
    ]);
    (getEconomyDb as jest.Mock).mockResolvedValue(
      canonicalDbFixture({ accounting, allocations }),
    );

    const result = await listWalletRewardStatus({ walletAddress: WALLET });

    expect(result).toMatchObject({
      sourceStatus: 'canonical',
      totalAllocatedRaw: '750000000000000000',
      publicationStates: [
        {
          allocationId: allocations[0].allocationId,
          amountRaw: allocations[0].amountRaw,
          status: 'calculated',
        },
      ],
    });
  });

  it('falla cerrado si falta la allocation propia sellada aunque el cierre tenga otra wallet', async () => {
    const { accounting, allocations } = accountingFixtureForAllocations([
      {
        allocationId: 'c'.repeat(64),
        walletNormalized: WALLET,
        category: 'credit_pool',
        amountRaw: '500000000000000000',
        fundingMode: 'daily_emission',
        sourceIds: ['game-session:stage-public-reward-own-a'],
      },
      {
        allocationId: 'd'.repeat(64),
        walletNormalized: WALLET,
        category: 'credit_pool',
        amountRaw: '250000000000000000',
        fundingMode: 'daily_emission',
        sourceIds: ['game-session:stage-public-reward-own-b'],
      },
      {
        allocationId: 'e'.repeat(64),
        walletNormalized: SECOND_WALLET,
        category: 'credit_pool',
        amountRaw: '250000000000000000',
        fundingMode: 'daily_emission',
        sourceIds: ['game-session:stage-public-reward-other'],
      },
    ]);
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => ({
        find: () =>
          cursor(
            name === 'reward_accounting_allocations'
              ? [allocations[0]]
              : name === 'reward_daily_accounting'
              ? [accounting]
              : [],
          ),
        countDocuments: async () => 0,
      }),
    });

    await expect(
      listWalletRewardStatus({ walletAddress: WALLET }),
    ).rejects.toThrow(/todas las allocations publicables de la wallet/);
  });

  it('distingue un plan preparado de una publicación y no habilita el cobro', async () => {
    const { accounting, allocation } = accountingFixture();
    const plan = {
      accountingId: allocation.accountingId,
      status: 'prepared',
      batchId: null,
    };
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => ({
        find: () =>
          cursor(
            name === 'reward_accounting_allocations'
              ? [allocation]
              : name === 'reward_daily_accounting'
              ? [accounting]
              : name === 'reward_publication_plans'
              ? [plan]
              : [],
          ),
        countDocuments: async () => 0,
      }),
    });

    const result = await listWalletRewardStatus({ walletAddress: WALLET });

    expect(result).toMatchObject({
      claimPublished: false,
      claimableRaw: '0',
      pendingPublicationRaw: allocation.amountRaw,
      publicationStates: [
        {
          allocationId: allocation.allocationId,
          status: 'pending_publication',
          nextAction: 'publish',
          planStatus: 'prepared',
        },
      ],
    });
  });

  it('mantiene un origen bloqueado como desconocido, nunca como cero', async () => {
    const { accounting, allocation } = accountingFixture();
    const plan = {
      accountingId: allocation.accountingId,
      status: 'blocked',
      batchId: null,
    };
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => ({
        find: () =>
          cursor(
            name === 'reward_accounting_allocations'
              ? [allocation]
              : name === 'reward_daily_accounting'
              ? [accounting]
              : name === 'reward_publication_plans'
              ? [plan]
              : [],
          ),
        countDocuments: async () => 0,
      }),
    });

    const result = await listWalletRewardStatus({ walletAddress: WALLET });

    expect(result).toMatchObject({
      unknownRaw: allocation.amountRaw,
      pendingRaw: '0',
      healthy: false,
      publicationStates: [
        {
          allocationId: allocation.allocationId,
          status: 'unknown',
          nextAction: 'source_review',
        },
      ],
    });
  });

  it('falla cerrado si una allocation contable cambia de estado fuera del ledger', async () => {
    const { accounting, allocation } = accountingFixture();
    const corrupted = {
      ...allocation,
      status: 'blocked',
    } as unknown as RewardAccountingAllocationDocument;
    (getEconomyDb as jest.Mock).mockResolvedValue({
      collection: (name: string) => ({
        find: () =>
          cursor(
            name === 'reward_accounting_allocations'
              ? [corrupted]
              : name === 'reward_daily_accounting'
              ? [accounting]
              : [],
          ),
        countDocuments: async () => 0,
      }),
    });

    await expect(
      listWalletRewardStatus({ walletAddress: WALLET }),
    ).rejects.toThrow(/allocation contable/);
  });

  it('calcula totales globales con mas de cien claims aunque el historial devuelva solo la pagina reciente', async () => {
    const { accounting, allocation } = accountingFixture();
    const history = validClaimHistoryFixture(101);
    (getEconomyDb as jest.Mock).mockResolvedValue(
      canonicalDbFixture({
        accounting,
        allocations: [allocation],
        claims: history.claims,
        batches: history.batches,
        proofs: history.proofs,
        events: history.events,
      }),
    );

    const result = await listWalletRewardStatus({ walletAddress: WALLET });

    expect(result).toMatchObject({
      totalClaimedRaw: '757500',
      claimCount: 101,
      claims: expect.any(Array),
    });
    expect(result.claims).toHaveLength(100);
  });

  it('falla cerrado si una allocation publica carece de manifest global exacto', async () => {
    const rule = testRewardRule();
    const repository = new MemoryRewardRepository(rule);
    const service = new RewardAllocationService(
      createMemoryRewardTransactionRunner(repository),
    );
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
      weeklyReserveUnits: 20,
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
    expect(() =>
      assertRewardAllocationManifestBindings(
        persisted.allocations,
        repository.state.sourceManifests,
      ),
    ).not.toThrow();
    expect(() =>
      assertRewardAllocationManifestBindings(persisted.allocations, []),
    ).toThrow(/sin manifest global exacto/);
    repository.state.sourceManifests[0].sourceSetHash = '0'.repeat(64);
    expect(() =>
      assertRewardAllocationManifestBindings(
        persisted.allocations,
        repository.state.sourceManifests,
      ),
    ).toThrow(/sin manifest global exacto/);
  });

  it('materializa claimableRaw y devuelve el batch/proof publicado desde Mongo', async () => {
    const subject = fixture();
    const ambassadorAllocation = {
      _id: 'legacy-ambassador-1',
      allocationId: 'ambassador:daily:1',
      periodId: '2026-07-10',
      category: 'ambassador_ordinary',
      amountRaw: '375',
      status: 'allocated_offchain',
      availableAt: STARTS_AT,
      createdAt: STARTS_AT,
    };
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
        find: () =>
          cursor(
            name === 'reward_claim_proofs'
              ? [subject.proof]
              : name === 'reward_claim_batches'
              ? [subject.batch]
              : name === 'chain_events'
              ? [subject.publicationEvent]
              : name === 'reward_accounting_allocations'
              ? [ambassadorAllocation]
              : [],
          ),
        aggregate: () =>
          cursor(
            name === 'reward_allocations'
              ? [
                  {
                    allocatedCount: 2,
                    blockedCount: 1,
                    allocatedRaw: '10000',
                    blockedRaw: '500',
                    invalidCount: 0,
                  },
                ]
              : name === 'reward_claims'
              ? [{ claimCount: 1, claimedRaw: '2500', invalidCount: 0 }]
              : [],
          ),
        countDocuments: async () => 0,
      }),
    });
    jest
      .useFakeTimers()
      .setSystemTime(new Date(Number(STARTS_AT_RAW) * 1_000 + 1));
    try {
      const result = await listWalletRewardStatus({ walletAddress: WALLET });
      expect(result).toMatchObject({
        totalAllocatedRaw: '10000',
        totalClaimedRaw: '2500',
        pendingRaw: '0',
        allocationCount: 2,
        claimCount: 1,
        blockedAllocations: 1,
        claimableRaw: '7500',
        claimPublished: true,
        claimables: [
          {
            batch: { batchId: subject.batch.batchId, amountRaw: '7500' },
            proof: { proofId: subject.proof.proofId },
            onChainStatus: 'claimable',
          },
        ],
        ambassadorAllocations: [
          {
            allocationId: ambassadorAllocation.allocationId,
            category: 'ambassador_ordinary',
            amountRaw: '375',
          },
        ],
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
    expect(() =>
      validatePublishedRewardClaimable({
        ...wrongEvent,
        expectedWallet: WALLET,
        now: new Date(Number(STARTS_AT_RAW) * 1_000 + 1),
      }),
    ).toThrow(/no coincide con el batch/);

    const wrongProof = fixture();
    wrongProof.proof.amountRaw = '1';
    expect(() =>
      validatePublishedRewardClaimable({
        ...wrongProof,
        expectedWallet: WALLET,
        now: new Date(Number(STARTS_AT_RAW) * 1_000 + 1),
      }),
    ).toThrow(/Proof/);
  });

  it('expone el estado temporal on-chain sin llamar claimable a un batch futuro o expirado', () => {
    const subject = fixture();
    expect(
      validatePublishedRewardClaimable({
        ...subject,
        expectedWallet: WALLET,
        now: new Date(Number(STARTS_AT_RAW) * 1_000 - 1),
      }).onChainStatus,
    ).toBe('scheduled');
    expect(
      validatePublishedRewardClaimable({
        ...subject,
        expectedWallet: WALLET,
        now: EXPIRES_AT,
      }).onChainStatus,
    ).toBe('expired');
  });
});
