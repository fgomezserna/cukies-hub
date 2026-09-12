import { compareCodePoints, normalizeMachineId, parseUint256 } from './canonical.js';
import { assertLegacyTransitionManifestIntegrity } from './manifest.js';
import {
  generateUnsignedLegacyPausePlan,
  type LegacyExpectedVerificationAction,
  type LegacyPausePlan,
  type LegacyVerificationActionKind,
} from './plans.js';
import { clonePlainData } from './plain-data.js';
import { stableJsonStringify } from './serialize.js';
import { normalizeLegacyAddress } from './snapshot.js';
import type { LegacyChain, LegacyEnvironment, LegacyTransitionManifest } from './types.js';

const CHAINS: LegacyChain[] = ['BSC', 'TRON'];

type LegacyObservation = {
  blockNumber: number;
  blockHash: string;
  timestampMs: number;
  pointsBalanceRaw: string;
  pendingRaw: string;
};

export type LegacyExecutedActionEvidence = {
  actionId: string;
  actionKind: LegacyVerificationActionKind;
  network: LegacyChain;
  contractAlias: 'STAKING_POINTS' | 'BREEDING_POINTS';
  contractAddress: string;
  functionSignature: LegacyExpectedVerificationAction['functionSignature'];
  selector: string | null;
  tronFunctionSelector: string | null;
  calldata: string | null;
  args: Array<boolean | string>;
  expectedActor: string;
  expectedOwner: string | null;
  expectedSuccess: boolean;
  expectedRevertClassification: 'PAUSED' | 'NONE';
  executionKind: 'transaction' | 'simulation';
  receiptId: string;
  txHash: string | null;
  sender: string;
  observedOwner: string | null;
  attempted: boolean;
  success: boolean;
  revertClassification: 'PAUSED' | 'OTHER' | 'UNKNOWN' | 'NONE';
  blockNumber: number;
  blockHash: string;
  timestampMs: number;
  pauseEnabled: boolean | null;
  paidPendingRaw: string | null;
};

export type LegacyNetworkPostconditionEvidence = {
  network: LegacyChain;
  environment: LegacyEnvironment;
  manifestSha256: string;
  target: LegacyTransitionManifest['target'];
  chainId?: 56 | 97;
  tronNetwork?: 'mainnet' | 'nile' | 'shasta';
  cutoff: {
    ref: string;
    blockNumber: number;
    blockHash: string;
    timestampMs?: number;
    cursor?: string;
  };
  contracts: {
    points: string;
    stakingPoints: string;
    breedingPoints: string;
  };
  preflight: Array<{
    contractAlias: 'POINTS' | 'STAKING_POINTS' | 'BREEDING_POINTS';
    contractAddress: string;
    observedBytecodeHash: string;
    observedOwner: string;
    observedSelectors: string[];
  }>;
  expectedPendingRaw: string;
  beforePause: LegacyObservation;
  afterPause: LegacyObservation;
  afterUnstake: LegacyObservation;
  actions: LegacyExecutedActionEvidence[];
};

export type LegacyPostconditionCode =
  | 'MISSING_NETWORK_EVIDENCE'
  | 'DUPLICATE_NETWORK_EVIDENCE'
  | 'PLAN_EVIDENCE_MISMATCH'
  | 'INVALID_CHAIN_EVIDENCE'
  | 'INVALID_CONTRACT_EVIDENCE'
  | 'INVALID_CUTOFF_EVIDENCE'
  | 'INVALID_OBSERVATION_SEQUENCE'
  | 'INVALID_ACTION_EVIDENCE'
  | 'INVALID_PAUSE_AUTHORITY'
  | 'STAKE_NOT_PROVEN_PAUSED'
  | 'CALC_POINTS_NOT_FROZEN'
  | 'PENDING_MISMATCH'
  | 'UNSTAKE_NOT_ALLOWED'
  | 'BREEDING_START_NOT_PROVEN_PAUSED'
  | 'BREEDING_RESOLUTION_NOT_ALLOWED';

export type LegacyPostconditionFailure = {
  network: LegacyChain;
  code: LegacyPostconditionCode;
  message: string;
};

export type LegacyNetworkPostconditionResult = {
  network: LegacyChain;
  previewOnly: true;
  cutoverAuthorized: false;
  requiresLiveVerification: true;
  requiresExplicitApproval: true;
  ok: boolean;
  checks: {
    manifestPlanBinding: boolean;
    identityAndContracts: boolean;
    cutoffAndObservationSequence: boolean;
    exactActionSetAndReceipts: boolean;
    pauseAuthority: boolean;
    stakeBlockedByPause: boolean;
    calcPointsFrozen: boolean;
    unstakeAllowedWithExactBalanceDelta: boolean;
    breedingStartBlockedByPause: boolean;
    activeBreedingResolutionAllowed: boolean;
  };
  failures: LegacyPostconditionFailure[];
};

export type LegacyPostconditionResult = {
  previewOnly: true;
  cutoverAuthorized: false;
  requiresLiveVerification: true;
  requiresExplicitApproval: true;
  target: LegacyTransitionManifest['target'];
  manifestSha256: string;
  expectedManifestSha256: string;
  ok: boolean;
  networks: LegacyNetworkPostconditionResult[];
  failures: LegacyPostconditionFailure[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: unknown, expected: readonly string[]) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const canonical = [...expected].sort(compareCodePoints);
  return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}

function validAddress(network: LegacyChain, value: unknown) {
  return typeof value === 'string' && normalizeLegacyAddress(network, value) === value;
}

function sameAddress(network: LegacyChain, left: unknown, right: unknown) {
  return validAddress(network, left) && validAddress(network, right) && left === right;
}

function validBlockHash(network: LegacyChain, value: unknown) {
  return typeof value === 'string' && (network === 'BSC'
    ? /^0x[0-9a-f]{64}$/.test(value)
    : /^[0-9a-f]{64}$/.test(value));
}

function validTransactionHash(network: LegacyChain, value: unknown) {
  return validBlockHash(network, value);
}

function validBlockNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function sameSelectors(left: unknown, right: readonly string[]) {
  if (!Array.isArray(left) || !left.every((selector) => typeof selector === 'string')) return false;
  const actual = [...left].sort(compareCodePoints);
  const expected = [...right].sort(compareCodePoints);
  return stableJsonStringify(actual) === stableJsonStringify(expected);
}

function assertEvidenceRuntimeShape(value: unknown): asserts value is LegacyNetworkPostconditionEvidence {
  if (!isRecord(value) || (value.network !== 'BSC' && value.network !== 'TRON') ||
    !isRecord(value.target) || !isRecord(value.cutoff) || !isRecord(value.contracts)) {
    throw new Error('Legacy network evidence runtime shape is invalid.');
  }
  const identityKey = value.network === 'BSC' ? 'chainId' : 'tronNetwork';
  const cutoffKeys = value.network === 'BSC'
    ? ['ref', 'blockNumber', 'blockHash']
    : ['ref', 'blockNumber', 'blockHash', 'timestampMs', 'cursor'];
  const observationKeys = ['blockNumber', 'blockHash', 'timestampMs', 'pointsBalanceRaw', 'pendingRaw'];
  const actionKeys = [
    'actionId', 'actionKind', 'network', 'contractAlias', 'contractAddress',
    'functionSignature', 'selector', 'tronFunctionSelector', 'calldata', 'args',
    'expectedActor', 'expectedOwner', 'executionKind', 'receiptId', 'txHash', 'sender',
    'expectedSuccess', 'expectedRevertClassification',
    'observedOwner', 'attempted', 'success', 'revertClassification', 'blockNumber',
    'blockHash', 'timestampMs', 'pauseEnabled', 'paidPendingRaw',
  ];
  if (!hasExactKeys(value, [
    'network', 'environment', 'manifestSha256', 'target', identityKey, 'cutoff',
    'contracts', 'preflight', 'expectedPendingRaw', 'beforePause', 'afterPause',
    'afterUnstake', 'actions',
  ]) || !hasExactKeys(value.target, [
    'databaseName', 'economySchemaVersion', 'sentinelId', 'baselineCollection',
  ]) || !hasExactKeys(value.cutoff, cutoffKeys) || !hasExactKeys(value.contracts, [
    'points', 'stakingPoints', 'breedingPoints',
  ]) || !Array.isArray(value.preflight) || value.preflight.length !== 3 ||
    !value.preflight.every((item) => hasExactKeys(item, [
      'contractAlias', 'contractAddress', 'observedBytecodeHash', 'observedOwner', 'observedSelectors',
    ])) || !hasExactKeys(value.beforePause, observationKeys) ||
    !hasExactKeys(value.afterPause, observationKeys) ||
    !hasExactKeys(value.afterUnstake, observationKeys) ||
    !Array.isArray(value.actions) || value.actions.length !== 6 ||
    !value.actions.every((action) => hasExactKeys(action, actionKeys))) {
    throw new Error('Legacy network evidence runtime shape is invalid.');
  }
}

function contextMatches(
  evidence: LegacyNetworkPostconditionEvidence,
  manifest: LegacyTransitionManifest,
  plan: LegacyPausePlan,
) {
  if (evidence.manifestSha256 !== manifest.manifestSha256 ||
    evidence.environment !== manifest.environment ||
    stableJsonStringify(evidence.target) !== stableJsonStringify(manifest.target)) return false;
  const cutoff = manifest.cutoffs.find((item) => item.network === evidence.network);
  if (!cutoff || evidence.cutoff.ref !== cutoff.ref) return false;
  if (evidence.network === 'BSC') {
    if (evidence.chainId !== cutoff.chainId || evidence.chainId !== plan.bsc[0]?.chainId ||
      evidence.cutoff.blockNumber !== cutoff.blockNumber ||
      evidence.cutoff.blockHash !== cutoff.blockHash) return false;
  } else if (evidence.tronNetwork !== cutoff.tronNetwork ||
    evidence.tronNetwork !== plan.tron[0]?.network ||
    evidence.cutoff.timestampMs !== cutoff.timestampMs || evidence.cutoff.cursor !== cutoff.cursor) return false;

  const aliases = [
    ['POINTS', evidence.contracts.points],
    ['STAKING_POINTS', evidence.contracts.stakingPoints],
    ['BREEDING_POINTS', evidence.contracts.breedingPoints],
  ] as const;
  for (const [alias, address] of aliases) {
    const contract = manifest.contracts.find(
      (item) => item.network === evidence.network && item.alias === alias,
    );
    if (!contract || !sameAddress(evidence.network, contract.address, address)) return false;
  }

  const expected = plan.requiresLivePreflight.filter((item) => item.network === evidence.network);
  if (evidence.preflight.length !== expected.length) return false;
  for (const preflight of expected) {
    const matches = evidence.preflight.filter((item) => item.contractAlias === preflight.contractAlias);
    if (matches.length !== 1) return false;
    const actual = matches[0];
    if (!sameAddress(evidence.network, actual.contractAddress, preflight.contractAddress) ||
      !sameAddress(evidence.network, actual.observedOwner, preflight.expectedOwner) ||
      actual.observedBytecodeHash !== preflight.expectedBytecodeHash ||
      !sameSelectors(actual.observedSelectors, preflight.expectedSelectors)) return false;
  }
  return true;
}

function validateExecutionIdentity(network: LegacyChain, action: LegacyExecutedActionEvidence) {
  if (normalizeMachineId(action.actionId) !== action.actionId || action.attempted !== true ||
    !validBlockNumber(action.blockNumber) || !validBlockHash(network, action.blockHash) ||
    !validTimestamp(action.timestampMs)) return false;
  if (action.executionKind === 'simulation') {
    return action.txHash === null && action.receiptId === `${action.actionId}:simulation` &&
      normalizeMachineId(action.receiptId) === action.receiptId;
  }
  return action.executionKind === 'transaction' && validTransactionHash(network, action.txHash) &&
    action.receiptId === action.txHash && normalizeMachineId(action.receiptId) === action.receiptId;
}

function validateActionSet(
  evidence: LegacyNetworkPostconditionEvidence,
  plan: LegacyPausePlan,
) {
  const expected = plan.verificationActions.filter((action) => action.network === evidence.network);
  if (expected.length !== 6 || evidence.actions.length !== expected.length) return false;
  const receiptIds = new Set<string>();
  for (const specification of expected) {
    const matches = evidence.actions.filter((action) => action.actionId === specification.actionId);
    if (matches.length !== 1) return false;
    const action = matches[0];
    const metadata = {
      actionId: action.actionId,
      actionKind: action.actionKind,
      network: action.network,
      contractAlias: action.contractAlias,
      contractAddress: action.contractAddress,
      functionSignature: action.functionSignature,
      selector: action.selector,
      tronFunctionSelector: action.tronFunctionSelector,
      calldata: action.calldata,
      args: action.args,
      expectedActor: action.expectedActor,
      expectedOwner: action.expectedOwner,
      expectedSuccess: action.expectedSuccess,
      expectedRevertClassification: action.expectedRevertClassification,
    };
    if (stableJsonStringify(metadata) !== stableJsonStringify(specification) ||
      !validAddress(evidence.network, action.sender) || action.sender !== specification.expectedActor ||
      action.success !== specification.expectedSuccess ||
      action.revertClassification !== specification.expectedRevertClassification ||
      !validateExecutionIdentity(evidence.network, action) || receiptIds.has(action.receiptId)) return false;
    if (specification.expectedOwner === null) {
      if (action.observedOwner !== null || action.pauseEnabled !== null) return false;
    } else if (action.observedOwner !== specification.expectedOwner || action.pauseEnabled !== true) return false;
    if (specification.actionKind === 'unstake-probe') {
      if (parseUint256(action.paidPendingRaw ?? undefined) === null) return false;
    } else if (action.paidPendingRaw !== null) return false;
    receiptIds.add(action.receiptId);
  }
  return true;
}

function actionByKind(
  evidence: LegacyNetworkPostconditionEvidence,
  kind: LegacyVerificationActionKind,
) {
  return evidence.actions.find((action) => action.actionKind === kind) ?? null;
}

function verifyNetwork(
  evidence: LegacyNetworkPostconditionEvidence,
  manifest: LegacyTransitionManifest,
  plan: LegacyPausePlan,
): LegacyNetworkPostconditionResult {
  const failures: LegacyPostconditionFailure[] = [];
  const fail = (code: LegacyPostconditionCode, message: string) => {
    failures.push({ network: evidence.network, code, message });
  };
  const manifestPlanBinding = contextMatches(evidence, manifest, plan);
  if (!manifestPlanBinding) fail('PLAN_EVIDENCE_MISMATCH', 'Evidence context does not match its anchored manifest and plan.');

  const chainIdentityValid = evidence.network === 'BSC'
    ? evidence.chainId === manifest.cutoffs.find((item) => item.network === 'BSC')?.chainId
    : evidence.tronNetwork === manifest.cutoffs.find((item) => item.network === 'TRON')?.tronNetwork;
  const contractValues = Object.values(evidence.contracts);
  const contractsValid = contractValues.every((address) => validAddress(evidence.network, address)) &&
    new Set(contractValues).size === 3;
  const identityAndContracts = chainIdentityValid && contractsValid;
  if (!chainIdentityValid) fail('INVALID_CHAIN_EVIDENCE', 'Chain identity evidence is invalid.');
  if (!contractsValid) fail('INVALID_CONTRACT_EVIDENCE', 'Contract evidence is invalid.');

  const cutoffValid = normalizeMachineId(evidence.cutoff.ref) === evidence.cutoff.ref &&
    validBlockNumber(evidence.cutoff.blockNumber) && validBlockHash(evidence.network, evidence.cutoff.blockHash);
  if (!cutoffValid) fail('INVALID_CUTOFF_EVIDENCE', 'Cutoff block evidence is invalid.');
  const observations = [evidence.beforePause, evidence.afterPause, evidence.afterUnstake];
  const observationValuesValid = observations.every((observation) =>
    validBlockNumber(observation.blockNumber) && validBlockHash(evidence.network, observation.blockHash) &&
    validTimestamp(observation.timestampMs) && parseUint256(observation.pointsBalanceRaw) !== null &&
    parseUint256(observation.pendingRaw) !== null);

  const exactActionSetAndReceipts = validateActionSet(evidence, plan);
  if (!exactActionSetAndReceipts) {
    fail('INVALID_ACTION_EVIDENCE', 'Actions must match the plan one-for-one with canonical receipts and actors.');
  }
  const pauseStaking = actionByKind(evidence, 'pause-staking');
  const pauseBreeding = actionByKind(evidence, 'pause-breeding');
  const stake = actionByKind(evidence, 'stake-probe');
  const unstake = actionByKind(evidence, 'unstake-probe');
  const breedingStart = actionByKind(evidence, 'breeding-start-probe');
  const breedingResolution = actionByKind(evidence, 'breeding-resolution-probe');
  const pauseActions = [pauseStaking, pauseBreeding];
  const probeActions = [stake, unstake, breedingStart, breedingResolution];
  const actionSequenceValid = pauseActions.every((action) => action !== null &&
    evidence.beforePause.blockNumber < action.blockNumber && action.blockNumber < evidence.afterPause.blockNumber &&
    evidence.beforePause.timestampMs < action.timestampMs && action.timestampMs < evidence.afterPause.timestampMs) &&
    probeActions.every((action) => action !== null && action.blockNumber >= evidence.afterPause.blockNumber &&
      action.blockNumber < evidence.afterUnstake.blockNumber &&
      action.timestampMs >= evidence.afterPause.timestampMs && action.timestampMs < evidence.afterUnstake.timestampMs);
  const blockEvidence = [evidence.cutoff, evidence.beforePause, ...pauseActions,
    evidence.afterPause, ...probeActions, evidence.afterUnstake];
  const hashByBlock = new Map<number, string>();
  const blockByHash = new Map<string, number>();
  const hashesConsistent = blockEvidence.every((item) => {
    if (!item || !validBlockNumber(item.blockNumber) || !validBlockHash(evidence.network, item.blockHash)) return false;
    const existingHash = hashByBlock.get(item.blockNumber);
    const existingBlock = blockByHash.get(item.blockHash);
    if ((existingHash && existingHash !== item.blockHash) ||
      (existingBlock !== undefined && existingBlock !== item.blockNumber)) return false;
    hashByBlock.set(item.blockNumber, item.blockHash);
    blockByHash.set(item.blockHash, item.blockNumber);
    return true;
  });
  const strictlySeparated = cutoffValid && observationValuesValid && actionSequenceValid && hashesConsistent &&
    evidence.cutoff.blockNumber < evidence.beforePause.blockNumber &&
    (evidence.network !== 'TRON' ||
      (typeof evidence.cutoff.timestampMs === 'number' &&
        evidence.cutoff.timestampMs < evidence.beforePause.timestampMs)) &&
    evidence.afterPause.blockNumber < evidence.afterUnstake.blockNumber &&
    evidence.afterPause.timestampMs < evidence.afterUnstake.timestampMs;
  if (!strictlySeparated) fail('INVALID_OBSERVATION_SEQUENCE', 'Blocks and timestamps are not canonically separated.');

  const pauseAuthority = exactActionSetAndReceipts && pauseActions.every((action) => action !== null &&
    action.expectedOwner !== null && action.sender === action.expectedOwner &&
    action.observedOwner === action.expectedOwner && action.pauseEnabled === true && action.success === true);
  if (!pauseAuthority) fail('INVALID_PAUSE_AUTHORITY', 'Pause actions must be successful owner actions from the plan.');

  const stakeBlockedByPause = exactActionSetAndReceipts && stake !== null && !stake.success &&
    stake.revertClassification === 'PAUSED';
  if (!stakeBlockedByPause) fail('STAKE_NOT_PROVEN_PAUSED', 'Stake must fail with a PAUSED classification.');
  const expectedPending = parseUint256(evidence.expectedPendingRaw);
  const calcPointsFrozen = expectedPending !== null && evidence.beforePause.pendingRaw === expectedPending.toString() &&
    evidence.afterPause.pendingRaw === expectedPending.toString() &&
    evidence.beforePause.pointsBalanceRaw === evidence.afterPause.pointsBalanceRaw;
  if (!calcPointsFrozen) fail('CALC_POINTS_NOT_FROZEN', 'Pending and points balance must remain unchanged through pause.');

  const beforeBalance = parseUint256(evidence.beforePause.pointsBalanceRaw);
  const afterBalance = parseUint256(evidence.afterUnstake.pointsBalanceRaw);
  const paidPending = parseUint256(unstake?.paidPendingRaw ?? undefined);
  const exactDelta = beforeBalance !== null && afterBalance !== null && expectedPending !== null && paidPending !== null &&
    afterBalance >= beforeBalance && afterBalance - beforeBalance === expectedPending &&
    paidPending === expectedPending && evidence.afterUnstake.pendingRaw === '0';
  const unstakeAllowedWithExactBalanceDelta = exactActionSetAndReceipts && unstake !== null && unstake.success &&
    unstake.revertClassification === 'NONE' && exactDelta;
  if (!unstakeAllowedWithExactBalanceDelta) {
    fail(unstake?.success ? 'PENDING_MISMATCH' : 'UNSTAKE_NOT_ALLOWED',
      'Unstake must succeed with exact pending payment and points delta.');
  }
  const breedingStartBlockedByPause = exactActionSetAndReceipts && breedingStart !== null && !breedingStart.success &&
    breedingStart.revertClassification === 'PAUSED';
  if (!breedingStartBlockedByPause) {
    fail('BREEDING_START_NOT_PROVEN_PAUSED', 'Breeding start must fail with a PAUSED classification.');
  }
  const activeBreedingResolutionAllowed = exactActionSetAndReceipts && breedingResolution !== null && breedingResolution.success &&
    breedingResolution.revertClassification === 'NONE';
  if (!activeBreedingResolutionAllowed) {
    fail('BREEDING_RESOLUTION_NOT_ALLOWED', 'Resolving an active breeding operation must succeed.');
  }

  return {
    network: evidence.network,
    previewOnly: true,
    cutoverAuthorized: false,
    requiresLiveVerification: true,
    requiresExplicitApproval: true,
    ok: failures.length === 0,
    checks: {
      manifestPlanBinding,
      identityAndContracts,
      cutoffAndObservationSequence: strictlySeparated,
      exactActionSetAndReceipts,
      pauseAuthority,
      stakeBlockedByPause,
      calcPointsFrozen,
      unstakeAllowedWithExactBalanceDelta,
      breedingStartBlockedByPause,
      activeBreedingResolutionAllowed,
    },
    failures,
  };
}

export function verifyLegacyPostconditions(input: {
  manifest: LegacyTransitionManifest;
  expectedManifestSha256: string;
  plan: LegacyPausePlan;
  evidences: LegacyNetworkPostconditionEvidence[];
}): LegacyPostconditionResult {
  input = clonePlainData(input, 'Legacy postcondition verification input', {
    maxDepth: 32, maxNodes: 150_000, maxArrayLength: 10_000,
    maxStringBytes: 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024,
  });
  if (!hasExactKeys(input, ['manifest', 'expectedManifestSha256', 'plan', 'evidences']) ||
    !isRecord(input.plan)) {
    throw new Error('Legacy postcondition verification input is invalid.');
  }
  const manifest = assertLegacyTransitionManifestIntegrity(
    input.manifest,
    input.expectedManifestSha256,
  );
  const canonicalPlan = generateUnsignedLegacyPausePlan({
    manifest,
    expectedManifestSha256: input.expectedManifestSha256,
    verificationProbes: input.plan.verificationProbes,
  });
  if (stableJsonStringify(canonicalPlan) !== stableJsonStringify(input.plan)) {
    throw new Error('Pause plan does not match the canonical anchored manifest-derived plan.');
  }
  if (!Array.isArray(input.evidences) || input.evidences.length > CHAINS.length * 2) {
    throw new Error('Network evidences must be a bounded array.');
  }
  for (const evidence of input.evidences) assertEvidenceRuntimeShape(evidence);
  const networks: LegacyNetworkPostconditionResult[] = [];
  const failures: LegacyPostconditionFailure[] = [];
  for (const network of CHAINS) {
    const matches = input.evidences.filter((item) => item.network === network);
    if (matches.length === 0) {
      failures.push({ network, code: 'MISSING_NETWORK_EVIDENCE', message: `${network} evidence is missing.` });
      continue;
    }
    if (matches.length !== 1) {
      failures.push({ network, code: 'DUPLICATE_NETWORK_EVIDENCE', message: `${network} evidence must appear once.` });
      continue;
    }
    const result = verifyNetwork(matches[0], manifest, canonicalPlan);
    networks.push(result);
    failures.push(...result.failures);
  }
  return {
    previewOnly: true,
    cutoverAuthorized: false,
    requiresLiveVerification: true,
    requiresExplicitApproval: true,
    target: manifest.target,
    manifestSha256: manifest.manifestSha256,
    expectedManifestSha256: input.expectedManifestSha256,
    ok: failures.length === 0 && networks.length === CHAINS.length,
    networks,
    failures,
  };
}
