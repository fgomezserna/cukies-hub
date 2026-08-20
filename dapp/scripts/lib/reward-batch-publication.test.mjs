import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  authorizeRewardClaimBatch,
  buildRewardPublicationArtifacts,
  stableRewardPublicationHash,
} from './reward-batch-publication.mjs';

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
  return {
    accountingId: 'reward-daily:2026-08-19',
    accounting: {
      _id: 'reward-daily:2026-08-19',
      ruleVersion: 'rewards-staging-test-v3',
      payloadHash: 'a'.repeat(64),
      status: 'sealed',
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
    allocations: [
      allocation(1, 'player', PLAYER, '20'),
      allocation(2, 'ambassador_ordinary', PLAYER, '5'),
      allocation(3, 'credit_pool', PLAYER_TWO, '10'),
      allocation(4, 'treasury', TREASURY, '40'),
      allocation(5, 'marketing_development', MARKETING, '15'),
      allocation(6, 'supply_reduction', REDUCTION, '10'),
    ],
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

test('rechaza una allocation manipulada o un destino de sistema incorrecto', () => {
  const tampered = input();
  tampered.allocations[0].amountRaw = '21';
  assert.throws(() => buildRewardPublicationArtifacts(tampered), /no es canonica/);

  const wrongDestination = input();
  wrongDestination.allocations[3] = allocation(4, 'treasury', PLAYER, '40');
  assert.throws(() => buildRewardPublicationArtifacts(wrongDestination), /destino treasury/);
});
