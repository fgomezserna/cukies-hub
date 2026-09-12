import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { TronWeb } from 'tronweb';

import {
  generateUnsignedLegacyPausePlan,
  type LegacyPausePlan,
  type LegacyVerificationProbe,
} from './plans.js';
import { stableJsonStringify } from './serialize.js';
import {
  BSC_USER,
  TRON_USER,
  emptySnapshotInput,
  realLegacyContracts,
  stagingCutoffs,
} from './test-fixtures.js';
import { buildLegacyTransitionPackage } from './manifest.js';
import {
  verifyLegacyPostconditions,
  type LegacyExecutedActionEvidence,
  type LegacyNetworkPostconditionEvidence,
} from './verify.js';
import type { LegacyTransitionManifest } from './types.js';

function boundManifest() {
  return buildLegacyTransitionPackage({
    snapshotInput: emptySnapshotInput(), environment: 'staging',
    cutoffs: stagingCutoffs(), contracts: realLegacyContracts(),
  }).manifest;
}

function verificationProbes(): LegacyVerificationProbe[] {
  return [
    {
      network: 'BSC', actor: BSC_USER, stakingTokenId: '11',
      breedingParentTokenIds: ['21', '22'], activeBreedingTokenId: '31',
    },
    {
      network: 'TRON', actor: TRON_USER, stakingTokenId: '12',
      breedingParentTokenIds: ['23', '24'], activeBreedingTokenId: '32',
    },
  ];
}

function planFor(manifest: LegacyTransitionManifest) {
  return generateUnsignedLegacyPausePlan({
    manifest,
    expectedManifestSha256: manifest.manifestSha256,
    verificationProbes: verificationProbes(),
  });
}

test('derives an anchored, non-executable plan with twelve exact verification actions', () => {
  const manifest = boundManifest();
  const plan = planFor(manifest);
  assert.equal(plan.schemaVersion, 4);
  assert.equal(plan.previewOnly, true);
  assert.equal(plan.cutoverAuthorized, false);
  assert.equal(plan.executable, false);
  assert.equal(plan.approved, false);
  assert.equal(plan.expectedManifestSha256, manifest.manifestSha256);
  assert.deepEqual(plan.target, manifest.target);
  assert.equal(plan.verificationActions.length, 12);
  assert.equal(new Set(plan.verificationActions.map((action) => action.actionId)).size, 12);
  assert.ok(plan.verificationActions.filter((action) => action.network === 'BSC')
    .every((action) => action.selector && action.calldata && action.tronFunctionSelector === null));
  assert.ok(plan.verificationActions.filter((action) => action.network === 'TRON')
    .every((action) => action.selector === null && action.calldata === null && action.tronFunctionSelector));
  assert.equal(plan.bsc[0]?.data, '0x5d4fead30000000000000000000000000000000000000000000000000000000000000001');
  assert.equal(plan.bsc[1]?.data, '0x686dc57c');
  assert.equal(plan.requiresLivePreflight.length, 6);
  assert.doesNotMatch(JSON.stringify(plan), /privateKey|signatureValue|signedTransaction/i);
});

test('plan and verifiers require an explicit external manifest hash anchor', () => {
  const manifest = boundManifest();
  assert.throws(() => generateUnsignedLegacyPausePlan({
    manifest, verificationProbes: verificationProbes(),
  } as never), /anchor is missing or does not match/);
  assert.throws(() => generateUnsignedLegacyPausePlan({
    manifest, expectedManifestSha256: 'f'.repeat(64), verificationProbes: verificationProbes(),
  }), /anchor is missing or does not match/);
  for (const zeroActor of [
    'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
    TronWeb.address.toHex('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'),
  ]) {
    const probes = verificationProbes();
    probes[1].actor = zeroActor;
    assert.throws(() => generateUnsignedLegacyPausePlan({
      manifest, expectedManifestSha256: manifest.manifestSha256, verificationProbes: probes,
    }), /probe actor or token ids are invalid/);
  }

  const originalAnchor = manifest.manifestSha256;
  manifest.contracts[0].expectedOwner = BSC_USER;
  const { manifestSha256: _previous, ...body } = manifest;
  manifest.manifestSha256 = createHash('sha256').update(stableJsonStringify(body)).digest('hex');
  assert.throws(() => generateUnsignedLegacyPausePlan({
    manifest, expectedManifestSha256: originalAnchor, verificationProbes: verificationProbes(),
  }), /anchor is missing or does not match/);

  const missingVerifierAnchor = verifiedFixture();
  delete (missingVerifierAnchor as Partial<typeof missingVerifierAnchor>).expectedManifestSha256;
  assert.throws(
    () => verifyLegacyPostconditions(missingVerifierAnchor as never),
    /verification input is invalid|anchor is missing or does not match/,
  );
  const rehashedVerifierFixture = verifiedFixture();
  rehashedVerifierFixture.manifest.contracts[0].expectedOwner = BSC_USER;
  const { manifestSha256: _oldVerifierHash, ...verifierBody } = rehashedVerifierFixture.manifest;
  rehashedVerifierFixture.manifest.manifestSha256 = createHash('sha256')
    .update(stableJsonStringify(verifierBody))
    .digest('hex');
  assert.throws(
    () => verifyLegacyPostconditions(rehashedVerifierFixture),
    /anchor is missing or does not match/,
  );
});

function blockHash(network: 'BSC' | 'TRON', block: number) {
  const value = block.toString(16).padStart(64, '0');
  return network === 'BSC' ? `0x${value}` : value;
}

function executedAction(
  specification: LegacyPausePlan['verificationActions'][number],
  base: number,
  timestampBase = base * 1_000,
): LegacyExecutedActionEvidence {
  const offsets = {
    'pause-staking': 2,
    'pause-breeding': 3,
    'stake-probe': 4,
    'unstake-probe': 5,
    'breeding-start-probe': 4,
    'breeding-resolution-probe': 6,
  } as const;
  const offset = offsets[specification.actionKind];
  return {
    ...specification,
    executionKind: 'simulation',
    receiptId: `${specification.actionId}:simulation`,
    txHash: null,
    sender: specification.expectedActor,
    observedOwner: specification.expectedOwner,
    attempted: true,
    success: specification.expectedSuccess,
    revertClassification: specification.expectedRevertClassification,
    blockNumber: base + offset,
    blockHash: blockHash(specification.network, base + offset),
    timestampMs: timestampBase + offset * 1_000,
    pauseEnabled: specification.expectedOwner === null ? null : true,
    paidPendingRaw: specification.actionKind === 'unstake-probe' ? '7' : null,
  };
}

function evidence(
  network: 'BSC' | 'TRON',
  manifest: LegacyTransitionManifest,
  plan: LegacyPausePlan,
): LegacyNetworkPostconditionEvidence {
  const bsc = network === 'BSC';
  const manifestCutoff = manifest.cutoffs.find((item) => item.network === network)!;
  const base = bsc ? manifestCutoff.blockNumber! : 100;
  const timestampBase = bsc ? base * 1_000 : manifestCutoff.timestampMs!;
  const contracts = Object.fromEntries(
    manifest.contracts.filter((item) => item.network === network).map((item) => [item.alias, item]),
  ) as Record<string, LegacyTransitionManifest['contracts'][number]>;
  const preflight = plan.requiresLivePreflight.filter((item) => item.network === network);
  return {
    network,
    environment: manifest.environment,
    manifestSha256: manifest.manifestSha256,
    target: manifest.target,
    ...(bsc ? { chainId: manifestCutoff.chainId } : { tronNetwork: manifestCutoff.tronNetwork }),
    cutoff: {
      ref: manifestCutoff.ref,
      blockNumber: base,
      blockHash: bsc ? manifestCutoff.blockHash! : blockHash(network, base),
      ...(bsc ? {} : { timestampMs: manifestCutoff.timestampMs, cursor: manifestCutoff.cursor }),
    },
    contracts: {
      points: contracts.POINTS.address,
      stakingPoints: contracts.STAKING_POINTS.address,
      breedingPoints: contracts.BREEDING_POINTS.address,
    },
    preflight: preflight.map((item) => ({
      contractAlias: item.contractAlias,
      contractAddress: item.contractAddress,
      observedBytecodeHash: item.expectedBytecodeHash,
      observedOwner: item.expectedOwner,
      observedSelectors: [...item.expectedSelectors],
    })),
    expectedPendingRaw: '7',
    beforePause: {
      blockNumber: base + 1, blockHash: blockHash(network, base + 1),
      timestampMs: timestampBase + 1_000, pointsBalanceRaw: '100', pendingRaw: '7',
    },
    afterPause: {
      blockNumber: base + 4, blockHash: blockHash(network, base + 4),
      timestampMs: timestampBase + 4_000, pointsBalanceRaw: '100', pendingRaw: '7',
    },
    afterUnstake: {
      blockNumber: base + 7, blockHash: blockHash(network, base + 7),
      timestampMs: timestampBase + 7_000, pointsBalanceRaw: '107', pendingRaw: '0',
    },
    actions: plan.verificationActions
      .filter((action) => action.network === network)
      .map((action) => executedAction(action, base, timestampBase)),
  };
}

function verifiedFixture() {
  const manifest = boundManifest();
  const plan = planFor(manifest);
  return {
    manifest,
    expectedManifestSha256: manifest.manifestSha256,
    plan,
    evidences: [evidence('BSC', manifest, plan), evidence('TRON', manifest, plan)],
  };
}

test('strong verification binds exact actions, actors, calldata and simulated receipts', () => {
  const fixture = verifiedFixture();
  const result = verifyLegacyPostconditions(fixture);
  assert.equal(result.ok, true);
  assert.equal(result.expectedManifestSha256, fixture.expectedManifestSha256);
  assert.ok(result.networks.every((item) => Object.values(item.checks).every(Boolean)));

  const transactionFixture = verifiedFixture();
  const action = transactionFixture.evidences[0].actions[0];
  action.executionKind = 'transaction';
  action.txHash = blockHash('BSC', 999);
  action.receiptId = action.txHash;
  assert.equal(verifyLegacyPostconditions(transactionFixture).ok, true);
});

test('action evidence is rejected for arbitrary ids, metadata, actors and receipts', () => {
  const mutations: Array<(action: LegacyExecutedActionEvidence) => void> = [
    (action) => { action.actionId = 'arbitrary-action'; },
    (action) => { action.functionSignature = 'stake(uint256)'; },
    (action) => { action.selector = '0x00000000'; },
    (action) => { action.calldata = '0x00'; },
    (action) => { action.args = ['999']; },
    (action) => { action.receiptId = 'arbitrary-receipt'; },
  ];
  for (const mutate of mutations) {
    const fixture = verifiedFixture();
    mutate(fixture.evidences[0].actions[0]);
    const result = verifyLegacyPostconditions(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === 'INVALID_ACTION_EVIDENCE'));
  }

  for (const zero of [
    'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
    TronWeb.address.toHex('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'),
  ]) {
    const fixture = verifiedFixture();
    fixture.evidences[1].actions[2].sender = zero;
    const result = verifyLegacyPostconditions(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === 'INVALID_ACTION_EVIDENCE'));
  }
});

test('manifest, environment, target, cutoff and preflight remain exact', () => {
  const mutations: Array<(evidence: LegacyNetworkPostconditionEvidence) => void> = [
    (item) => { item.manifestSha256 = 'f'.repeat(64); },
    (item) => { item.environment = 'production'; },
    (item) => { item.target = { ...item.target, databaseName: 'other' as 'cukieshub-new' }; },
    (item) => { item.cutoff.ref = 'other-cutoff'; },
    (item) => { item.contracts.stakingPoints = item.contracts.breedingPoints; },
    (item) => { item.preflight[0].observedBytecodeHash = `0x${'f'.repeat(64)}`; },
    (item) => { item.preflight[0].observedOwner = item.contracts.points; },
    (item) => { item.preflight[0].observedSelectors = ['0x00000000']; },
  ];
  for (const mutate of mutations) {
    const fixture = verifiedFixture();
    mutate(fixture.evidences[1]);
    const result = verifyLegacyPostconditions(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.failures.some((failure) => failure.code === 'PLAN_EVIDENCE_MISMATCH'));
  }
});

test('noncanonical plan, generic reverts and inexact balance deltas are rejected', () => {
  const planFixture = verifiedFixture();
  planFixture.plan.environment = 'production';
  assert.throws(() => verifyLegacyPostconditions(planFixture), /canonical anchored manifest-derived plan/);

  const actionFixture = verifiedFixture();
  const stake = actionFixture.evidences[0].actions.find((item) => item.actionKind === 'stake-probe')!;
  stake.revertClassification = 'OTHER';
  const unstake = actionFixture.evidences[1].actions.find((item) => item.actionKind === 'unstake-probe')!;
  unstake.paidPendingRaw = '6';
  const result = verifyLegacyPostconditions(actionFixture);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.code === 'STAKE_NOT_PROVEN_PAUSED'));
  assert.ok(result.failures.some((failure) => failure.code === 'PENDING_MISMATCH'));
});

test('machine ids and temporal separation are strict', () => {
  const fixture = verifiedFixture();
  fixture.evidences[1].actions[0].receiptId = `tron:pause-staking:\u200bsimulation`;
  fixture.evidences[1].afterPause.blockNumber = fixture.evidences[1].actions[0].blockNumber;
  const result = verifyLegacyPostconditions(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.code === 'INVALID_ACTION_EVIDENCE'));
  assert.ok(result.failures.some((failure) => failure.code === 'INVALID_OBSERVATION_SEQUENCE'));
});

test('TRON cutoff timestamp must strictly precede the first observation', () => {
  const fixture = verifiedFixture();
  const tron = fixture.evidences.find((item) => item.network === 'TRON')!;
  tron.cutoff.timestampMs = tron.beforePause.timestampMs;

  const result = verifyLegacyPostconditions(fixture);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.code === 'INVALID_OBSERVATION_SEQUENCE'));
});

test('global verification fails for missing or duplicate network evidence', () => {
  const fixture = verifiedFixture();
  const missing = verifyLegacyPostconditions({ ...fixture, evidences: fixture.evidences.slice(0, 1) });
  assert.ok(missing.failures.some((failure) => failure.code === 'MISSING_NETWORK_EVIDENCE'));
  const duplicate = verifyLegacyPostconditions({
    ...fixture, evidences: [...fixture.evidences, fixture.evidences[1]],
  });
  assert.ok(duplicate.failures.some((failure) => failure.code === 'DUPLICATE_NETWORK_EVIDENCE'));
  assert.equal(duplicate.cutoverAuthorized, false);
});

test('invalid plan containers fail with a bounded domain error', () => {
  for (const plan of [null, undefined]) {
    const fixture = verifiedFixture();
    assert.throws(
      () => verifyLegacyPostconditions({ ...fixture, plan } as never),
      /Legacy postcondition verification input (?:is invalid|must contain only JSON-like values)/,
    );
  }
});
