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
    allocation(4, 'treasury', TREASURY, '40'),
    allocation(5, 'marketing_development', MARKETING, '15'),
    allocation(6, 'supply_reduction', REDUCTION, '10'),
  ];
  return {
    accountingId: 'reward-daily:2026-08-19',
    accounting: {
      _id: 'reward-daily:2026-08-19',
      ruleVersion: 'rewards-staging-test-v3',
      payloadHash: 'a'.repeat(64),
      status: 'sealed',
      allocations: allocations.map((entry) => ({
        allocationId: entry.allocationId,
        walletNormalized: entry.walletNormalized,
        category: entry.category,
        amountRaw: entry.amountRaw,
        fundingMode: entry.fundingMode,
        sourceIds: entry.sourceIds,
      })),
    },
    rule: {
      version: 'rewards-staging-test-v3',
      configHash: 'b'.repeat(64),
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
  assert.equal(artifacts.plan.treasuryRaw, '40');
  assert.equal(artifacts.plan.marketingDevelopmentRaw, '15');
  assert.equal(artifacts.plan.supplyReductionRaw, '10');
  assert.equal(artifacts.plan.totalRaw, '100');
  assert.equal(artifacts.proofs.length, 2);
  assert.deepEqual(
    artifacts.plan.operations.map(({ kind, amountRaw, status }) => ({ kind, amountRaw, status })),
    [
      { kind: 'fund_distributor', amountRaw: '35', status: 'pending' },
      { kind: 'publish_batch', amountRaw: '35', status: 'pending' },
      { kind: 'transfer_treasury', amountRaw: '40', status: 'pending' },
      { kind: 'transfer_marketing_development', amountRaw: '15', status: 'pending' },
      { kind: 'burn_supply_reduction', amountRaw: '10', status: 'pending' },
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
  wrongDestination.allocations[3] = allocation(4, 'treasury', PLAYER, '40');
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
