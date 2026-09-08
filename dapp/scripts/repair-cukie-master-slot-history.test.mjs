import assert from 'node:assert/strict';
import test from 'node:test';

import { assertExistingRepairPayload, assertNonEmptyRepairPlan, planSlotHistoryRepair, validateRepairEnvironment } from './repair-cukie-master-slot-history.mjs';

const wallet = `0x${'1'.repeat(40)}`;
const vault = '0x4482ebA4D55a1DF6aA102a8CC22A4fBa252D7eDB';
const configuredVault = vault.toLowerCase();
const hash = `0x${'a'.repeat(64)}`;
const at = (block) => new Date(Date.parse('2026-09-08T13:00:00.000Z') + block * 1_000);

function withdrawal(block, id) {
  return { _id: id, chain: 'BSC', chainId: 97, status: 'projected', contractAlias: 'CUKIE_MASTER_NFT_VAULT', contractAddress: vault, eventName: 'CukieMasterWithdrawn', blockNumber: block, blockHash: hash, logIndex: 0, timestampMs: at(block).getTime(), normalized: { beneficiaryNormalized: wallet } };
}

function slot(ordinal, status = 'active') {
  return { _id: `${wallet}:nft:${ordinal}`, walletNormalized: wallet, route: 'nft', ordinal, status, eligibilityEpoch: 1, revision: 2, ruleVersion: 'r1', roundId: 'round-1', sourceHash: 'c'.repeat(64) };
}

function positionEvent(jobId, ordinal) {
  const previous = slot(ordinal);
  const next = { ...previous, status: 'inactive' };
  return { _id: `position:${jobId}:${ordinal}`, eventType: 'slot_transitioned', reason: 'slot_eligibility_lost', route: 'nft', walletNormalized: wallet, requestIdempotencyKey: `outbox:${jobId}`, previousSlot: previous, nextSlot: next, next: { route: 'nft', sourceHash: next.sourceHash, ruleVersion: next.ruleVersion, roundId: next.roundId }, createdAt: at(jobId === 'job-1' ? 151 : 201) };
}

function version(ordinal) {
  const active = slot(ordinal);
  return { _id: `${active._id}:2`, slotId: active._id, route: 'nft', effectiveBlockNumber: 99, effectiveBlockHash: hash, effectiveBlockTimestamp: at(99), validFrom: at(99), slot: active };
}

const checkpoint = { safeBlockNumber: 300, safeBlockHash: hash, checkedAt: at(300) };

test('plans first loss for ordinal 5 and second loss for ordinals 1-4', () => {
  const withdrawals = [withdrawal(150, 'withdrawal-1'), withdrawal(200, 'withdrawal-2')];
  const jobs = [
    { _id: 'job-1', status: 'completed', route: 'nft', walletNormalized: wallet, sourceType: 'chain_event', sourceEventId: 'withdrawal-1', completedAt: at(151) },
    { _id: 'job-2', status: 'completed', route: 'nft', walletNormalized: wallet, sourceType: 'chain_event', sourceEventId: 'withdrawal-2', completedAt: at(201) },
  ];
  const positionEvents = [positionEvent('job-1', 5), ...[1, 2, 3, 4].map((ordinal) => positionEvent('job-2', ordinal))];
  const plan = planSlotHistoryRepair({ withdrawals, jobs, positionEvents, versions: [1, 2, 3, 4, 5].map(version), checkpoint, vaultAddress: configuredVault, now: at(301) });
  assert.deepEqual(plan.plans.map((item) => item.positionEvent.nextSlot.ordinal), [5, 1, 2, 3, 4]);
  assert.ok(plan.plans.every((item) => item.version._id.startsWith('repair:')));
  assert.ok(plan.plans.every((item) => item.version.slot.revision === 2));
  const activeCountAt = (cutoffBlock) => {
    const active = new Set([1, 2, 3, 4, 5]);
    for (const item of plan.plans.filter((candidate) => candidate.withdrawal.blockNumber <= cutoffBlock)) {
      active.delete(item.positionEvent.nextSlot.ordinal);
    }
    return active.size;
  };
  assert.equal(activeCountAt(149), 5);
  assert.equal(activeCountAt(175), 4);
  assert.equal(activeCountAt(250), 0);
  const repeated = planSlotHistoryRepair({ withdrawals, jobs, positionEvents, versions: [...[1, 2, 3, 4, 5].map(version), ...plan.plans.map((item) => item.version)], checkpoint, vaultAddress: configuredVault, now: at(301) });
  assert.equal(repeated.planHash, plan.planHash);
  assert.doesNotThrow(() => assertExistingRepairPayload(plan.plans[0].version, plan.plans[0]));
  assert.doesNotThrow(() => assertExistingRepairPayload(undefined, plan.plans[0]));
  assert.throws(() => assertExistingRepairPayload({ repairPayloadHash: 'different' }, plan.plans[0]), /payload distinto/);
  const tampered = { ...plan.plans[0].version, slot: { ...plan.plans[0].version.slot, status: 'active' } };
  assert.throws(() => assertExistingRepairPayload(tampered, plan.plans[0]), /payload distinto/);
});

test('fails closed on ambiguous linkage and legacy timestamp gaps', () => {
  const event = withdrawal(150, 'withdrawal-ambiguous');
  const base = { withdrawals: [event], jobs: [], positionEvents: [], versions: [{ ...version(1), effectiveBlockTimestamp: undefined }], checkpoint, vaultAddress: configuredVault };
  const plan = planSlotHistoryRepair({ ...base, now: at(301) });
  assert.equal(plan.plans.length, 0);
  assert.equal(plan.mismatches[0].code, 'WITHDRAWAL_JOB_LINK_AMBIGUOUS');
  assert.throws(() => assertNonEmptyRepairPlan(plan, { wallet, fromBlock: 1, toBlock: 2 }), /scope explicito/);
});

test('fails closed when the canonical temporal version is missing or validFrom-invalid', () => {
  const event = withdrawal(150, 'withdrawal-missing-version');
  const job = { _id: 'job-missing-version', status: 'completed', route: 'nft', walletNormalized: wallet, sourceType: 'chain_event', sourceEventId: event._id, completedAt: at(151) };
  const position = positionEvent(job._id, 1);
  const plan = planSlotHistoryRepair({
    withdrawals: [event],
    jobs: [job],
    positionEvents: [position],
    versions: [{ ...version(1), validFrom: undefined }],
    checkpoint,
    vaultAddress: configuredVault,
    now: at(301),
  });
  assert.equal(plan.plans.length, 0);
  assert.equal(plan.mismatches[0].code, 'CANONICAL_VERSION_REVISION_MISSING');
});

test('requires explicit staging chain, database and vault guards', () => {
  assert.throws(() => validateRepairEnvironment({ APP_ENV: 'staging', STAGING_ONLY_GUARD: 'true', NEXT_PUBLIC_UKI_CHAIN_ID: '97', CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging', CHAIN_INDEXER_MONGO_URL: 'mongodb://localhost/cukieshub-new-staging' }), /ADDRESS/);
});
