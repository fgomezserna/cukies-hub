import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  authorizeRewardClaimBatch,
  buildRewardPublicationArtifacts,
  stableRewardPublicationHash,
} from './reward-batch-publication.mjs';
import { buildRewardPublisherCanaryFixture } from './reward-batch-publisher-canary-fixture.mjs';

const require = createRequire(import.meta.url);
const { generateRewardsMerkle } = require(
  '../../../packages/contracts/scripts/lib/rewards-merkle.cjs',
);

const PLAYER = '0x1111111111111111111111111111111111111111';
const PLAYER_TWO = '0x2222222222222222222222222222222222222222';
const TREASURY = '0x3333333333333333333333333333333333333333';
const MARKETING = '0x4444444444444444444444444444444444444444';
const REDUCTION = '0x5555555555555555555555555555555555555555';
const DISTRIBUTOR = '0x6666666666666666666666666666666666666666';
const TOKEN = '0x7777777777777777777777777777777777777777';
const CREATED_AT = new Date('2026-08-20T16:05:00.000Z');

function allocation(index, category, walletNormalized, amountRaw) {
  const allocationId = `allocation-${index}`;
  const immutable = {
    accountingId: 'reward-daily:2026-08-19',
    accountingKind: 'daily',
    periodId: '2026-08-19',
    allocationId,
    walletNormalized: walletNormalized.toLowerCase(),
    category,
    amountRaw,
    fundingMode: 'daily_emission',
    sourceIds: ['source-a'],
    availableAt: new Date('2026-08-20T16:00:00.000Z'),
    status: 'allocated_offchain',
    createdAt: CREATED_AT,
  };
  return {
    _id: allocationId,
    ...immutable,
    payloadHash: stableRewardPublicationHash({
      kind: 'reward-accounting-allocation-document',
      ...immutable,
    }),
  };
}

function input() {
  const allocations = [
    allocation(1, 'player', PLAYER, '20'),
    allocation(2, 'ambassador_ordinary', PLAYER, '5'),
    allocation(3, 'credit_pool', PLAYER_TWO, '10'),
    allocation(4, 'treasury', TREASURY, '52'),
    allocation(5, 'marketing_development', MARKETING, '6'),
    allocation(6, 'supply_reduction', REDUCTION, '7'),
  ];
  const sealedAllocations = allocations.map((entry) => ({
    allocationId: entry.allocationId,
    walletNormalized: entry.walletNormalized,
    category: entry.category,
    amountRaw: entry.amountRaw,
    fundingMode: entry.fundingMode,
    sourceIds: entry.sourceIds,
  }));
  const accountingPayload = {
    dayId: '2026-08-19',
    ruleVersion: 'rewards-staging-test-v3',
    ruleConfigHash: 'b'.repeat(64),
    sourceIds: ['source-a'],
    sourceSetHash: 'c'.repeat(64),
    sourceReservedRaw: '35',
    capacityMaterializedRaw: '65',
    priorReservedInflowRaw: '0',
    topupRaw: '0',
    buckets: {
      playersRaw: '20',
      creditPoolRaw: '10',
      cukiePoolRaw: '0',
      ambassadorOrdinaryRaw: '5',
      weeklyPrizeRaw: '0',
      ambassadorWeeklyRaw: '0',
    },
    undistributed: {
      totalRaw: '65',
      treasuryRaw: '52',
      marketingDevelopmentRaw: '6',
      supplyReductionRaw: '7',
    },
    priorReservedUndistributed: {
      totalRaw: '0',
      treasuryRaw: '0',
      marketingDevelopmentRaw: '0',
      supplyReductionRaw: '0',
    },
    destinations: {
      treasury: TREASURY,
      marketingDevelopment: MARKETING,
      supplyReduction: REDUCTION,
    },
    allocations: sealedAllocations,
  };
  return {
    accountingId: 'reward-daily:2026-08-19',
    accounting: {
      _id: 'reward-daily:2026-08-19',
      ...accountingPayload,
      payloadHash: stableRewardPublicationHash(accountingPayload),
      status: 'sealed',
    },
    rule: {
      version: 'rewards-staging-test-v3',
      configHash: 'b'.repeat(64),
      undistributedBps: {
        treasury: 8_000,
        marketing: 0,
        development: 0,
        marketingDevelopment: 1_000,
        supplyReduction: 1_000,
      },
      destinations: {
        treasury: TREASURY,
        marketingDevelopment: MARKETING,
        supplyReduction: REDUCTION,
      },
    },
    allocations,
    chainId: 97,
    tokenAddress: TOKEN,
    distributorAddress: DISTRIBUTOR,
    createdAt: CREATED_AT,
  };
}

test('materializa solo beneficiarios como claims y separa transferencias/quema', () => {
  const artifacts = buildRewardPublicationArtifacts(input());
  assert.equal(artifacts.plan.claimableTotalRaw, '35');
  assert.equal(artifacts.plan.treasuryRaw, '52');
  assert.equal(artifacts.plan.marketingDevelopmentRaw, '6');
  assert.equal(artifacts.plan.supplyReductionRaw, '7');
  assert.equal(artifacts.plan.totalRaw, '100');
  assert.equal(artifacts.proofs.length, 2);
  assert.equal(artifacts.proofs.some(({ walletAddress }) => [TREASURY, MARKETING, REDUCTION]
    .includes(walletAddress.toLowerCase())), false);
  assert.deepEqual(
    artifacts.plan.operations.map(({ kind, amountRaw, status }) => ({ kind, amountRaw, status })),
    [
      { kind: 'fund_distributor', amountRaw: '35', status: 'pending' },
      { kind: 'publish_batch', amountRaw: '35', status: 'pending' },
      { kind: 'transfer_treasury', amountRaw: '52', status: 'pending' },
      { kind: 'transfer_marketing_development', amountRaw: '6', status: 'pending' },
      { kind: 'burn_supply_reduction', amountRaw: '7', status: 'pending' },
    ],
  );
});

test('produce el mismo root/input hash que la herramienta de contratos', () => {
  const artifacts = buildRewardPublicationArtifacts(input());
  const manifest = generateRewardsMerkle({
    periodId: artifacts.batch.periodId,
    chainId: 97,
    distributorAddress: DISTRIBUTOR,
    metadata: artifacts.batch.metadata,
    allocations: artifacts.proofs.map(({ walletAddress, amountRaw }) => ({
      walletAddress,
      amountRaw,
    })),
  });
  assert.equal(artifacts.batch.batchId.toLowerCase(), manifest.batchId.toLowerCase());
  assert.equal(artifacts.batch.merkleRoot.toLowerCase(), manifest.merkleRoot.toLowerCase());
  assert.equal(artifacts.batch.canonicalInputHash, manifest.canonicalInputHash);
  assert.equal(artifacts.batch.totalAllocatedRaw, manifest.totalAllocatedRaw);
});

test('autoriza una ventana inmutable y mantiene el draft sin tx inventada', () => {
  const artifacts = buildRewardPublicationArtifacts(input());
  const authorized = authorizeRewardClaimBatch(artifacts.batch, CREATED_AT, 90 * 86_400);
  assert.equal(authorized.previewOnly, false);
  assert.equal(authorized.publishAuthorized, true);
  assert.equal(authorized.publishedProofSetHash, artifacts.batch.proofSetHash);
  assert.equal(authorized.publishedPeriodSealId, artifacts.batch.periodSealId);
  assert.equal(authorized.transactionHash, null);
  assert.equal(authorized.startsAtRaw, '1787241900');
  assert.equal(authorized.expiresAtRaw, '1795017900');
});

test('el fixture canary queda ligado exactamente a sus allocations selladas', () => {
  const fixture = buildRewardPublisherCanaryFixture({
    now: CREATED_AT,
    distributorAddress: DISTRIBUTOR,
    accountAddress: PLAYER,
  });
  assert.equal(fixture.rule.active, false);
  assert.equal(fixture.accounting.dayId, `canary:${DISTRIBUTOR.toLowerCase()}`);
  const artifacts = buildRewardPublicationArtifacts({
    accountingId: fixture.accountingId,
    accounting: fixture.accounting,
    rule: fixture.rule,
    allocations: [fixture.allocation],
    chainId: 97,
    tokenAddress: TOKEN,
    distributorAddress: DISTRIBUTOR,
    createdAt: CREATED_AT,
  });
  assert.equal(artifacts.plan.claimableTotalRaw, '10000000000000000000');
  assert.equal(artifacts.plan.totalRaw, '10000000000000000000');
  assert.equal(artifacts.proofs.length, 1);
  assert.equal(artifacts.proofs[0].walletAddress.toLowerCase(), PLAYER.toLowerCase());
});

test('rechaza una allocation manipulada o un destino de sistema incorrecto', () => {
  const tampered = input();
  tampered.allocations[0].amountRaw = '21';
  assert.throws(() => buildRewardPublicationArtifacts(tampered), /no es canonica/);

  const wrongDestination = input();
  wrongDestination.allocations[3] = allocation(4, 'treasury', PLAYER, '52');
  wrongDestination.accounting.allocations[3] = {
    allocationId: wrongDestination.allocations[3].allocationId,
    walletNormalized: wrongDestination.allocations[3].walletNormalized,
    category: wrongDestination.allocations[3].category,
    amountRaw: wrongDestination.allocations[3].amountRaw,
    fundingMode: wrongDestination.allocations[3].fundingMode,
    sourceIds: wrongDestination.allocations[3].sourceIds,
  };
  assert.throws(() => buildRewardPublicationArtifacts(wrongDestination), /destino treasury/);
});

test('rechaza una allocation extra aunque su documento tenga un hash valido', () => {
  const injected = input();
  injected.allocations.push(allocation(7, 'player', PLAYER_TWO, '1'));
  assert.throws(
    () => buildRewardPublicationArtifacts(injected),
    /no coinciden con su cierre sellado/,
  );

  const unknown = input();
  unknown.allocations[0] = allocation(1, 'future_system_bucket', PLAYER, '20');
  unknown.accounting.allocations[0] = {
    allocationId: unknown.allocations[0].allocationId,
    walletNormalized: unknown.allocations[0].walletNormalized,
    category: unknown.allocations[0].category,
    amountRaw: unknown.allocations[0].amountRaw,
    fundingMode: unknown.allocations[0].fundingMode,
    sourceIds: unknown.allocations[0].sourceIds,
  };
  assert.throws(() => buildRewardPublicationArtifacts(unknown), /no es canonica/);
});

test('falla cerrado si cambia el configHash, la politica o un solo wei del reparto', () => {
  const wrongConfigHash = input();
  wrongConfigHash.accounting.ruleConfigHash = 'c'.repeat(64);
  assert.throws(
    () => buildRewardPublicationArtifacts(wrongConfigHash),
    /configHash exacto/,
  );

  const historicalPolicy = input();
  historicalPolicy.rule.undistributedBps = {
    treasury: 8_000,
    marketing: 500,
    development: 500,
    supplyReduction: 1_000,
  };
  assert.throws(
    () => buildRewardPublicationArtifacts(historicalPolicy),
    /80\/10\/10/,
  );

  const tamperedSplit = input();
  tamperedSplit.accounting.undistributed = {
    ...tamperedSplit.accounting.undistributed,
    treasuryRaw: '51',
    supplyReductionRaw: '8',
  };
  assert.throws(
    () => buildRewardPublicationArtifacts(tamperedSplit),
    /ultimo wei/,
  );

  const tamperedPayload = input();
  tamperedPayload.accounting.topupRaw = '1';
  assert.throws(
    () => buildRewardPublicationArtifacts(tamperedPayload),
    /payloadHash/,
  );

  const wrongSealedDestination = input();
  wrongSealedDestination.accounting.destinations.treasury = PLAYER;
  assert.throws(
    () => buildRewardPublicationArtifacts(wrongSealedDestination),
    /destinos sellados/,
  );

  const sharedRuleDestination = input();
  sharedRuleDestination.rule.destinations.marketingDevelopment = TREASURY;
  assert.throws(
    () => buildRewardPublicationArtifacts(sharedRuleDestination),
    /deben ser distintos/,
  );
});
