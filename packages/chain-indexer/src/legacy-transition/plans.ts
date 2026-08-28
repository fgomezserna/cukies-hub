import {
  encodeFunctionData,
  toFunctionSelector,
  type Address,
  type Hex,
} from 'viem';

import { compareCodePoints, parseUint256 } from './canonical.js';
import { assertLegacyTransitionManifestIntegrity } from './manifest.js';
import { clonePlainData } from './plain-data.js';
import { normalizeLegacyAddress } from './snapshot.js';
import type {
  LegacyChain,
  LegacyCutoff,
  LegacyEnvironment,
  LegacyTransitionManifest,
} from './types.js';

const verificationAbi = [
  {
    type: 'function', name: 'changePause', stateMutability: 'nonpayable',
    inputs: [{ name: 'value', type: 'bool' }], outputs: [],
  },
  {
    type: 'function', name: 'pauseOn', stateMutability: 'nonpayable', inputs: [], outputs: [],
  },
  {
    type: 'function', name: 'stake', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'unstake', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'start', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenA', type: 'uint256' }, { name: 'tokenB', type: 'uint256' }], outputs: [],
  },
  {
    type: 'function', name: 'breed', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [],
  },
] as const;

export type UnsignedBscCall = {
  kind: 'unsigned-evm-call';
  chain: 'BSC';
  chainId: 56 | 97;
  label: 'pause-staking' | 'pause-breeding';
  to: Address;
  value: '0';
  data: Hex;
  functionName: 'changePause' | 'pauseOn';
  args: readonly [true] | readonly [];
  signed: false;
};

export type UnsignedTronCall = {
  kind: 'unsigned-tron-contract-call';
  chain: 'TRON';
  network: 'mainnet' | 'nile' | 'shasta';
  label: 'pause-staking' | 'pause-breeding';
  contractAddress: string;
  functionSelector: 'changePause(bool)' | 'pauseOn()';
  parameters: ReadonlyArray<{ type: 'bool'; value: true }>;
  callValueSun: '0';
  signed: false;
};

export type LegacyVerificationProbe = {
  network: LegacyChain;
  actor: string;
  stakingTokenId: string;
  breedingParentTokenIds: [string, string];
  activeBreedingTokenId: string;
};

export type LegacyVerificationActionKind =
  | 'pause-staking'
  | 'pause-breeding'
  | 'stake-probe'
  | 'unstake-probe'
  | 'breeding-start-probe'
  | 'breeding-resolution-probe';

export type LegacyExpectedVerificationAction = {
  actionId: string;
  actionKind: LegacyVerificationActionKind;
  network: LegacyChain;
  contractAlias: 'STAKING_POINTS' | 'BREEDING_POINTS';
  contractAddress: string;
  functionSignature:
    | 'changePause(bool)' | 'pauseOn()' | 'stake(uint256)' | 'unstake(uint256)'
    | 'start(uint256,uint256)' | 'breed(uint256)';
  selector: string | null;
  tronFunctionSelector: string | null;
  calldata: Hex | null;
  args: Array<boolean | string>;
  expectedActor: string;
  expectedOwner: string | null;
  expectedSuccess: boolean;
  expectedRevertClassification: 'PAUSED' | 'NONE';
};

export type LegacyPausePlan = {
  schemaVersion: 4;
  previewOnly: true;
  cutoverAuthorized: false;
  executable: false;
  approved: false;
  manifestSha256: string;
  expectedManifestSha256: string;
  environment: LegacyEnvironment;
  target: LegacyTransitionManifest['target'];
  cutoffs: LegacyCutoff[];
  signed: false;
  bsc: UnsignedBscCall[];
  tron: UnsignedTronCall[];
  verificationProbes: LegacyVerificationProbe[];
  verificationActions: LegacyExpectedVerificationAction[];
  requiresLivePreflight: Array<{
    network: LegacyChain;
    contractAlias: 'POINTS' | 'STAKING_POINTS' | 'BREEDING_POINTS';
    contractAddress: string;
    expectedBytecodeHash: string;
    expectedOwner: string;
    expectedSelectors: readonly string[];
    verified: false;
  }>;
};

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value).sort(compareCodePoints);
  const canonical = [...expected].sort(compareCodePoints);
  return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}

function manifestContract(
  manifest: LegacyTransitionManifest,
  network: LegacyChain,
  alias: 'POINTS' | 'STAKING_POINTS' | 'BREEDING_POINTS',
) {
  const contract = manifest.contracts.find(
    (candidate) => candidate.network === network && candidate.alias === alias,
  );
  if (!contract) throw new Error(`Manifest is missing ${network} ${alias}.`);
  return contract;
}

function normalizeProbes(input: LegacyVerificationProbe[]) {
  if (!Array.isArray(input) || input.length !== 2) {
    throw new Error('Pause plan requires exactly one BSC and one TRON verification probe.');
  }
  return (['BSC', 'TRON'] as const).map((network) => {
    const matches = input.filter((probe) => probe?.network === network);
    if (matches.length !== 1 || !exactKeys(matches[0] as unknown as Record<string, unknown>, [
      'network', 'actor', 'stakingTokenId', 'breedingParentTokenIds', 'activeBreedingTokenId',
    ])) throw new Error(`Pause plan requires one canonical ${network} verification probe.`);
    const probe = matches[0];
    const actor = normalizeLegacyAddress(network, probe.actor);
    const stakingTokenId = parseUint256(probe.stakingTokenId);
    const activeBreedingTokenId = parseUint256(probe.activeBreedingTokenId);
    if (!Array.isArray(probe.breedingParentTokenIds) || probe.breedingParentTokenIds.length !== 2) {
      throw new Error(`${network} breeding parent token ids are invalid.`);
    }
    const parents = probe.breedingParentTokenIds.map((value) => parseUint256(value));
    if (!actor || actor !== probe.actor || stakingTokenId === null || activeBreedingTokenId === null ||
      parents.some((value) => value === null)) {
      throw new Error(`${network} verification probe actor or token ids are invalid.`);
    }
    return {
      network,
      actor,
      stakingTokenId: stakingTokenId.toString(),
      breedingParentTokenIds: [parents[0]!.toString(), parents[1]!.toString()] as [string, string],
      activeBreedingTokenId: activeBreedingTokenId.toString(),
    };
  });
}

function verificationActions(
  manifest: LegacyTransitionManifest,
  probes: LegacyVerificationProbe[],
): LegacyExpectedVerificationAction[] {
  const result: LegacyExpectedVerificationAction[] = [];
  for (const probe of probes) {
    const staking = manifestContract(manifest, probe.network, 'STAKING_POINTS');
    const breeding = manifestContract(manifest, probe.network, 'BREEDING_POINTS');
    const actions: Array<{
      actionKind: LegacyVerificationActionKind;
      contract: typeof staking;
      functionSignature: LegacyExpectedVerificationAction['functionSignature'];
      args: Array<boolean | string>;
      expectedActor: string;
      expectedOwner: string | null;
      expectedSuccess: boolean;
      expectedRevertClassification: 'PAUSED' | 'NONE';
    }> = [
      {
        actionKind: 'pause-staking', contract: staking, functionSignature: 'changePause(bool)',
        args: [true], expectedActor: staking.expectedOwner, expectedOwner: staking.expectedOwner,
        expectedSuccess: true, expectedRevertClassification: 'NONE',
      },
      {
        actionKind: 'pause-breeding', contract: breeding, functionSignature: 'pauseOn()',
        args: [], expectedActor: breeding.expectedOwner, expectedOwner: breeding.expectedOwner,
        expectedSuccess: true, expectedRevertClassification: 'NONE',
      },
      {
        actionKind: 'stake-probe', contract: staking, functionSignature: 'stake(uint256)',
        args: [probe.stakingTokenId], expectedActor: probe.actor, expectedOwner: null,
        expectedSuccess: false, expectedRevertClassification: 'PAUSED',
      },
      {
        actionKind: 'unstake-probe', contract: staking, functionSignature: 'unstake(uint256)',
        args: [probe.stakingTokenId], expectedActor: probe.actor, expectedOwner: null,
        expectedSuccess: true, expectedRevertClassification: 'NONE',
      },
      {
        actionKind: 'breeding-start-probe', contract: breeding,
        functionSignature: 'start(uint256,uint256)', args: [...probe.breedingParentTokenIds],
        expectedActor: probe.actor, expectedOwner: null,
        expectedSuccess: false, expectedRevertClassification: 'PAUSED',
      },
      {
        actionKind: 'breeding-resolution-probe', contract: breeding,
        functionSignature: 'breed(uint256)', args: [probe.activeBreedingTokenId],
        expectedActor: probe.actor, expectedOwner: null,
        expectedSuccess: true, expectedRevertClassification: 'NONE',
      },
    ];
    for (const action of actions) {
      const selector = toFunctionSelector(action.functionSignature);
      let calldata: Hex | null = null;
      if (probe.network === 'BSC') {
        const uintArgs = action.args.map((value) => typeof value === 'string' ? BigInt(value) : value);
        calldata = encodeFunctionData({
          abi: verificationAbi,
          functionName: action.functionSignature.slice(0, action.functionSignature.indexOf('(')) as
            'changePause' | 'pauseOn' | 'stake' | 'unstake' | 'start' | 'breed',
          args: uintArgs as never,
        });
      }
      result.push({
        actionId: `${probe.network.toLowerCase()}:${action.actionKind}`,
        actionKind: action.actionKind,
        network: probe.network,
        contractAlias: action.contract.alias as 'STAKING_POINTS' | 'BREEDING_POINTS',
        contractAddress: action.contract.address,
        functionSignature: action.functionSignature,
        selector: probe.network === 'BSC' ? selector : null,
        tronFunctionSelector: probe.network === 'TRON' ? action.functionSignature : null,
        calldata,
        args: action.args,
        expectedActor: action.expectedActor,
        expectedOwner: action.expectedOwner,
        expectedSuccess: action.expectedSuccess,
        expectedRevertClassification: action.expectedRevertClassification,
      });
    }
  }
  return result;
}

export function generateUnsignedLegacyPausePlan(input: {
  manifest: LegacyTransitionManifest;
  expectedManifestSha256: string;
  verificationProbes: LegacyVerificationProbe[];
}): LegacyPausePlan {
  input = clonePlainData(input, 'Pause plan input', {
    maxDepth: 32, maxNodes: 75_000, maxArrayLength: 10_000,
    maxStringBytes: 1024 * 1024, maxTotalBytes: 8 * 1024 * 1024,
  });
  if (!input || typeof input !== 'object') throw new Error('Pause plan input is invalid.');
  if (typeof input.expectedManifestSha256 !== 'string') {
    throw new Error('Expected manifest SHA-256 anchor is missing or does not match.');
  }
  if (!exactKeys(input as unknown as Record<string, unknown>, [
    'manifest', 'expectedManifestSha256', 'verificationProbes',
  ])) throw new Error('Pause plan input is invalid.');
  const manifest = assertLegacyTransitionManifestIntegrity(
    input.manifest,
    input.expectedManifestSha256,
  );
  if (!manifest.complete) throw new Error('Pause plan requires a complete preview manifest.');
  const probes = normalizeProbes(input.verificationProbes);
  const bscCutoff = manifest.cutoffs.find((cutoff) => cutoff.network === 'BSC');
  const tronCutoff = manifest.cutoffs.find((cutoff) => cutoff.network === 'TRON');
  if (!bscCutoff?.chainId || !tronCutoff?.tronNetwork) {
    throw new Error('Manifest cutoffs lack chain identity.');
  }

  const bscPoints = manifestContract(manifest, 'BSC', 'POINTS');
  const bscStaking = manifestContract(manifest, 'BSC', 'STAKING_POINTS');
  const bscBreeding = manifestContract(manifest, 'BSC', 'BREEDING_POINTS');
  const tronPoints = manifestContract(manifest, 'TRON', 'POINTS');
  const tronStaking = manifestContract(manifest, 'TRON', 'STAKING_POINTS');
  const tronBreeding = manifestContract(manifest, 'TRON', 'BREEDING_POINTS');
  const preflight: LegacyPausePlan['requiresLivePreflight'] = [
    bscPoints, bscStaking, bscBreeding, tronPoints, tronStaking, tronBreeding,
  ].map((contract) => ({
    network: contract.network,
    contractAlias: contract.alias as 'POINTS' | 'STAKING_POINTS' | 'BREEDING_POINTS',
    contractAddress: contract.address,
    expectedBytecodeHash: contract.expectedBytecodeHash,
    expectedOwner: contract.expectedOwner,
    expectedSelectors: contract.expectedSelectors,
    verified: false,
  }));

  return {
    schemaVersion: 4,
    previewOnly: true,
    cutoverAuthorized: false,
    executable: false,
    approved: false,
    manifestSha256: manifest.manifestSha256,
    expectedManifestSha256: input.expectedManifestSha256,
    environment: manifest.environment,
    target: manifest.target,
    cutoffs: manifest.cutoffs,
    signed: false,
    bsc: [
      {
        kind: 'unsigned-evm-call', chain: 'BSC', chainId: bscCutoff.chainId,
        label: 'pause-staking', to: bscStaking.address as Address, value: '0',
        data: encodeFunctionData({ abi: verificationAbi, functionName: 'changePause', args: [true] }),
        functionName: 'changePause', args: [true], signed: false,
      },
      {
        kind: 'unsigned-evm-call', chain: 'BSC', chainId: bscCutoff.chainId,
        label: 'pause-breeding', to: bscBreeding.address as Address, value: '0',
        data: encodeFunctionData({ abi: verificationAbi, functionName: 'pauseOn' }),
        functionName: 'pauseOn', args: [], signed: false,
      },
    ],
    tron: [
      {
        kind: 'unsigned-tron-contract-call', chain: 'TRON', network: tronCutoff.tronNetwork,
        label: 'pause-staking', contractAddress: tronStaking.address,
        functionSelector: 'changePause(bool)', parameters: [{ type: 'bool', value: true }],
        callValueSun: '0', signed: false,
      },
      {
        kind: 'unsigned-tron-contract-call', chain: 'TRON', network: tronCutoff.tronNetwork,
        label: 'pause-breeding', contractAddress: tronBreeding.address,
        functionSelector: 'pauseOn()', parameters: [], callValueSun: '0', signed: false,
      },
    ],
    verificationProbes: probes,
    verificationActions: verificationActions(manifest, probes),
    requiresLivePreflight: preflight,
  };
}
