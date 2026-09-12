import { createHash } from 'node:crypto';
import { posix as path } from 'node:path';
import { toFunctionSelector } from 'viem';

import {
  compareCodePoints,
  isSha256,
  MAX_ARTIFACT_BYTES,
  MAX_GLOBAL_TOKENS,
  MAX_INPUT_RECORDS,
  MAX_PATH_LENGTH,
  MAX_TOKENS_PER_WALLET,
  MAX_UINT256,
  normalizeBoundedIdentifier,
  normalizeMachineId,
  normalizeNfc,
  parseUint256,
} from './canonical.js';
import {
  serializeSnapshotCsv,
  serializeSnapshotJsonl,
  stableJsonStringify,
} from './serialize.js';
import { clonePlainData } from './plain-data.js';
import {
  buildSourceBalanceBindingSha256,
  buildLegacySnapshot,
  normalizeLegacyAddress,
  verifyLegacySnapshotIntegrity,
} from './snapshot.js';
import type {
  LegacyContractArtifact,
  LegacyBalanceCoverageSource,
  LegacyCutoff,
  LegacyEnvironment,
  LegacyManifestFile,
  LegacySnapshotInput,
  LegacySnapshotIssue,
  LegacySnapshotResult,
  LegacyTransitionManifest,
  LegacyTransitionPackage,
} from './types.js';

const REQUIRED_CONTRACT_ALIASES = ['POINTS', 'STAKING_POINTS', 'BREEDING_POINTS'] as const;
const REQUIRED_FILES = ['wallets.jsonl', 'wallets.csv', 'totals.json', 'exceptions.json'] as const;
const TARGET = Object.freeze({
  databaseName: 'cukieshub-new' as const,
  economySchemaVersion: 2 as const,
  sentinelId: 'uki-economy' as const,
  baselineCollection: 'economy_schema_metadata' as const,
});

const CANONICAL_SNAPSHOT_ISSUE_CODES = new Set<LegacySnapshotIssue['code']>([
  'INVALID_WALLET',
  'MISSING_NETWORK_COVERAGE',
  'DUPLICATE_NETWORK_COVERAGE',
  'INCOMPLETE_NETWORK_COVERAGE',
  'INVALID_COVERAGE_SOURCE',
  'COVERAGE_MISMATCH',
  'WALLET_WITHOUT_USER',
  'MISSING_OBSERVATION',
  'CONFLICTING_USER',
  'CONFLICTING_OBSERVATION',
  'DUPLICATE_TOKEN',
  'DUPLICATE_SOURCE_BALANCE',
  'INVALID_SOURCE_BINDING',
  'SNAPSHOT_ERROR',
  'NETWORK_ERROR',
  'INVALID_TOKEN_ID',
]);

type RequiredAbiFunction = {
  name: string;
  inputs: string[];
  outputs: string[];
  stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
};

const REQUIRED_FUNCTIONS: Record<(typeof REQUIRED_CONTRACT_ALIASES)[number], RequiredAbiFunction[]> = {
  POINTS: [
    { name: 'getPoints', inputs: ['address'], outputs: ['uint256'], stateMutability: 'view' },
    { name: 'owner', inputs: [], outputs: ['address'], stateMutability: 'view' },
  ],
  STAKING_POINTS: [
    { name: 'owner', inputs: [], outputs: ['address'], stateMutability: 'view' },
    { name: 'getTokensOwner', inputs: ['address'], outputs: ['uint256[]'], stateMutability: 'view' },
    { name: 'calcPoints', inputs: ['uint256'], outputs: ['uint256'], stateMutability: 'view' },
    { name: 'changePause', inputs: ['bool'], outputs: [], stateMutability: 'nonpayable' },
    { name: 'stake', inputs: ['uint256'], outputs: [], stateMutability: 'nonpayable' },
    { name: 'unstake', inputs: ['uint256'], outputs: [], stateMutability: 'nonpayable' },
  ],
  BREEDING_POINTS: [
    { name: 'owner', inputs: [], outputs: ['address'], stateMutability: 'view' },
    { name: 'pauseOn', inputs: [], outputs: [], stateMutability: 'nonpayable' },
    { name: 'start', inputs: ['uint256', 'uint256'], outputs: [], stateMutability: 'nonpayable' },
    { name: 'breed', inputs: ['uint256'], outputs: [], stateMutability: 'nonpayable' },
  ],
};

function sha256(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function safeRelativePath(value: unknown) {
  if (typeof value !== 'string') throw new Error('Manifest file path must be a string.');
  const input = normalizeNfc(value.trim());
  if (
    input.length === 0 || input.length > MAX_PATH_LENGTH || input.includes('\u0000') ||
    input.includes('\\') || /^[A-Za-z]:/.test(input) || input.startsWith('//') || path.isAbsolute(input)
  ) {
    throw new Error('Manifest file paths must be portable safe relative paths.');
  }
  if (input.split('/').some((segment) => segment === '..')) {
    throw new Error('Manifest file paths must not contain parent-directory segments.');
  }
  const normalized = path.normalize(input).replace(/^\.\//, '');
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Manifest file paths must be portable safe relative paths.');
  }
  return normalized;
}

function contentBytes(value: string) {
  if (typeof value !== 'string') {
    throw new Error('Manifest artifact contents must be canonical UTF-8 text.');
  }
  return Buffer.from(value, 'utf8');
}

function buildCanonicalLegacyArtifacts(snapshot: LegacySnapshotResult): LegacyManifestFile[] {
  return [
    { path: 'wallets.jsonl', contents: serializeSnapshotJsonl(snapshot) },
    { path: 'wallets.csv', contents: serializeSnapshotCsv(snapshot) },
    { path: 'totals.json', contents: `${stableJsonStringify(snapshot.totals)}\n` },
    { path: 'exceptions.json', contents: `${stableJsonStringify(snapshot.issues)}\n` },
  ];
}

function validEnvironment(value: unknown): value is LegacyEnvironment {
  return value === 'production' || value === 'staging' || value === 'test' || value === 'development';
}

function expectedNetwork(environment: LegacyEnvironment) {
  if (environment === 'production') return { chainId: 56 as const, tronNetwork: 'mainnet' as const };
  if (environment === 'staging') return { chainId: 97 as const, tronNetwork: 'nile' as const };
  return { chainId: 97 as const, tronNetwork: 'shasta' as const };
}

function normalizeCutoffs(cutoffs: LegacyCutoff[], environment: LegacyEnvironment) {
  if (!Array.isArray(cutoffs) || cutoffs.length !== 2) {
    throw new Error('Manifest requires exactly BSC and TRON cutoffs.');
  }
  const identity = expectedNetwork(environment);
  const normalized: LegacyCutoff[] = [];
  for (const network of ['BSC', 'TRON'] as const) {
    const matches = cutoffs.filter((cutoff) => cutoff?.network === network);
    if (matches.length !== 1) throw new Error(`Manifest requires exactly one ${network} cutoff.`);
    const cutoff = matches[0];
    const ref = normalizeMachineId(cutoff.ref);
    if (!ref) throw new Error(`${network} cutoff requires a valid reference.`);
    if (network === 'BSC') {
      if (
        cutoff.chainId !== identity.chainId || !Number.isSafeInteger(cutoff.blockNumber) ||
        (cutoff.blockNumber ?? -1) < 0 || !/^0x[0-9a-fA-F]{64}$/.test(cutoff.blockHash ?? '')
      ) {
        throw new Error('BSC cutoff identity, block number or 32-byte hash is invalid for the environment.');
      }
      normalized.push({
        network, ref, chainId: cutoff.chainId,
        blockNumber: cutoff.blockNumber, blockHash: cutoff.blockHash!.toLowerCase(),
      });
    } else {
      const cursor = normalizeMachineId(cutoff.cursor);
      if (
        cutoff.tronNetwork !== identity.tronNetwork || !Number.isSafeInteger(cutoff.timestampMs) ||
        (cutoff.timestampMs ?? -1) < 0 || !cursor
      ) {
        throw new Error('TRON cutoff identity, timestamp or cursor is invalid for the environment.');
      }
      normalized.push({
        network, ref, tronNetwork: cutoff.tronNetwork, timestampMs: cutoff.timestampMs, cursor,
      });
    }
  }
  return normalized;
}

function abiTypeList(value: unknown) {
  if (!Array.isArray(value)) return null;
  const result: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof (item as { type?: unknown }).type !== 'string') return null;
    result.push((item as { type: string }).type);
  }
  return result;
}

function sameStringArray(left: string[] | null, right: string[]) {
  return left !== null && left.length === right.length && left.every((value, index) => value === right[index]);
}

function exactObjectKeys(value: unknown, expected: readonly string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort(compareCodePoints);
  const canonicalExpected = [...expected].sort(compareCodePoints);
  return sameStringArray(actual, canonicalExpected);
}

function requiredSelectors(alias: (typeof REQUIRED_CONTRACT_ALIASES)[number]) {
  return REQUIRED_FUNCTIONS[alias]
    .map((item) => toFunctionSelector(`${item.name}(${item.inputs.join(',')})`))
    .sort(compareCodePoints);
}

function validateAbi(alias: string, abi: unknown) {
  if (!Array.isArray(abi) || abi.length === 0 || abi.length > 1_000) {
    throw new Error(`Manifest ${alias} ABI must be a non-empty bounded array.`);
  }
  if (!(alias in REQUIRED_FUNCTIONS)) return [];
  for (const expected of REQUIRED_FUNCTIONS[alias as keyof typeof REQUIRED_FUNCTIONS]) {
    const matches = abi.filter((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const item = entry as Record<string, unknown>;
      return typeof item.type === 'string' && item.type.toLowerCase() === 'function' &&
        item.name === expected.name &&
        typeof item.stateMutability === 'string' &&
        item.stateMutability.toLowerCase() === expected.stateMutability &&
        sameStringArray(abiTypeList(item.inputs ?? []), expected.inputs) &&
        sameStringArray(abiTypeList(item.outputs ?? []), expected.outputs);
    });
    if (matches.length !== 1) {
      const signature = `${expected.name}(${expected.inputs.join(',')})`;
      throw new Error(`Manifest ${alias} ABI must contain exactly ${signature} with canonical outputs/mutability.`);
    }
  }
  return requiredSelectors(alias as keyof typeof REQUIRED_FUNCTIONS);
}

function normalizeContract(contract: LegacyContractArtifact) {
  if (!contract || typeof contract !== 'object' || (contract.network !== 'BSC' && contract.network !== 'TRON')) {
    throw new Error('Manifest contract runtime shape is invalid.');
  }
  const alias = typeof contract.alias === 'string'
    ? normalizeMachineId(contract.alias)?.toUpperCase() ?? ''
    : '';
  if (!alias) throw new Error('Manifest contract alias is required and bounded.');
  const address = normalizeLegacyAddress(contract.network, contract.address);
  const expectedOwner = normalizeLegacyAddress(contract.network, contract.expectedOwner);
  const expectedBytecodeHash = typeof contract.expectedBytecodeHash === 'string'
    ? contract.expectedBytecodeHash.toLowerCase()
    : '';
  if (!address || !expectedOwner) throw new Error(`Manifest ${alias} address or expected owner is invalid.`);
  if (!/^0x[0-9a-f]{64}$/.test(expectedBytecodeHash) || /^0x0{64}$/.test(expectedBytecodeHash)) {
    throw new Error(`Manifest ${alias} expected bytecode hash must be non-zero 32-byte hex.`);
  }
  const expectedSelectors = validateAbi(alias, contract.abi);
  return {
    network: contract.network,
    alias,
    address,
    abiSha256: sha256(stableJsonStringify(contract.abi)),
    expectedOwner,
    expectedBytecodeHash,
    expectedSelectors,
  };
}

function assertCanonicalSnapshotCoverage(snapshot: LegacySnapshotResult) {
  if (!exactObjectKeys(snapshot.totals, ['BSC', 'TRON'])) {
    throw new Error('Snapshot totals runtime shape is invalid.');
  }
  for (const [index, network] of (['BSC', 'TRON'] as const).entries()) {
    const coverage = snapshot.coverage[index];
    if (!coverage || coverage.network !== network || !exactObjectKeys(coverage, [
      'network', 'cutoffRef', 'wallets', 'claimed', 'pending',
    ])) {
      throw new Error('Snapshot coverage is not in canonical BSC/TRON order.');
    }
    const cutoffRef = typeof coverage.cutoffRef === 'string'
      ? normalizeMachineId(coverage.cutoffRef)
      : null;
    if (!cutoffRef || cutoffRef !== coverage.cutoffRef) {
      throw new Error(`${network} snapshot cutoff reference is invalid.`);
    }

    const sourceIds: string[] = [];
    for (const role of ['wallets', 'claimed', 'pending'] as const) {
      const source = coverage[role];
      const expectedKeys = role === 'wallets'
        ? ['sourceId', 'cutoffRef', 'querySha256', 'sourceSha256', 'complete', 'recordCount']
        : ['sourceId', 'cutoffRef', 'querySha256', 'sourceSha256', 'complete', 'recordCount', 'aggregateRaw'];
      const sourceId = typeof source?.sourceId === 'string'
        ? normalizeMachineId(source.sourceId)
        : null;
      if (!exactObjectKeys(source, expectedKeys) || !sourceId || sourceId !== source.sourceId ||
        source.cutoffRef !== cutoffRef || !isSha256(source.querySha256) ||
        !isSha256(source.sourceSha256) || typeof source.complete !== 'boolean' ||
        !Number.isSafeInteger(source.recordCount) || source.recordCount < 0 ||
        source.recordCount > MAX_INPUT_RECORDS) {
        throw new Error(`${network} snapshot ${role} coverage metadata is invalid.`);
      }
      if (snapshot.complete && source.complete !== true) {
        throw new Error(`${network} complete snapshot requires complete ${role} coverage.`);
      }
      if (role !== 'wallets') {
        const aggregateRaw = (source as LegacyBalanceCoverageSource).aggregateRaw;
        const aggregate = parseUint256(aggregateRaw);
        if (aggregate === null || aggregate.toString() !== aggregateRaw) {
          throw new Error(`${network} snapshot ${role} aggregate is not canonical uint256.`);
        }
      }
      sourceIds.push(sourceId);
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error(`${network} snapshot coverage source ids must be distinct.`);
    }

    const total = snapshot.totals[network];
    if (!exactObjectKeys(total, ['wallets', 'claimedRaw', 'pendingRaw', 'totalRaw', 'tokens'])) {
      throw new Error(`${network} snapshot totals shape is invalid.`);
    }
    const claimed = parseUint256(total.claimedRaw);
    const pending = parseUint256(total.pendingRaw);
    const combined = parseUint256(total.totalRaw);
    if (claimed === null || pending === null || combined === null || claimed + pending !== combined ||
      !Number.isSafeInteger(total.wallets) || total.wallets < 0 || total.wallets > MAX_INPUT_RECORDS * 2 ||
      !Number.isSafeInteger(total.tokens) || total.tokens < 0 || total.tokens > MAX_GLOBAL_TOKENS) {
      throw new Error(`${network} snapshot totals are invalid.`);
    }
    if (snapshot.complete && (
      coverage.wallets.recordCount !== total.wallets ||
      coverage.claimed.recordCount !== total.wallets ||
      coverage.pending.recordCount !== total.wallets ||
      coverage.claimed.aggregateRaw !== total.claimedRaw ||
      coverage.pending.aggregateRaw !== total.pendingRaw
    )) {
      throw new Error(`${network} complete snapshot coverage does not reconcile with totals.`);
    }
  }
}

function canonicalExternalCode(value: string) {
  return /^(?:TIMEOUT|RPC_TIMEOUT|RPC_DOWN|NETWORK_ERROR|RATE_LIMITED|NOT_FOUND|UNAVAILABLE|INVALID_RESPONSE|EXTERNAL_[0-9a-f]{12})$/.test(value);
}

function canonicalIssueMessage(issue: LegacySnapshotIssue) {
  const network = issue.network;
  const coverageRoles = ['wallets', 'claimed', 'pending'] as const;
  switch (issue.code) {
    case 'MISSING_NETWORK_COVERAGE':
      return issue.message === `Coverage for ${network} is missing.`;
    case 'DUPLICATE_NETWORK_COVERAGE':
      return issue.message === `Coverage for ${network} must appear exactly once.`;
    case 'INCOMPLETE_NETWORK_COVERAGE':
      return coverageRoles.some((role) => issue.message === `${network} ${role} coverage is incomplete.`);
    case 'INVALID_COVERAGE_SOURCE':
      return coverageRoles.some((role) =>
        issue.message === `${network} ${role} coverage evidence is malformed or not tied to its cutoff.` ||
        issue.message === `${network} ${role} aggregate must be a uint256 raw string.`) ||
        issue.message === `${network} coverage cutoff reference is invalid.` ||
        issue.message === `${network} wallets, claimed and pending evidence require distinct source ids.` ||
        issue.message === `${network} combined claimed and pending aggregate exceeds uint256.`;
    case 'COVERAGE_MISMATCH':
      return ['discovered count', 'observed count', 'claimed aggregate', 'pending aggregate']
        .some((field) => issue.message === `${network} coverage ${field} does not match the canonical snapshot.`);
    case 'INVALID_WALLET':
      return issue.message === 'Wallet discovery contains invalid or oversized identifiers.' ||
        issue.message === 'Snapshot observation contains an invalid wallet or snapshot identifier.';
    case 'INVALID_SOURCE_BINDING':
      return [
        'Wallet discovery source does not match the covered wallet source.',
        'Canonical observation source ids, row hashes, balance ids or uint256 amounts are invalid.',
        'Source row hashes do not bind balances to the canonical wallet and cutoff.',
      ].includes(issue.message);
    case 'CONFLICTING_USER':
      return issue.message === 'The same wallet discovery source resolves to different users.' ||
        issue.message === 'The wallet is linked to more than one legacy user.';
    case 'CONFLICTING_OBSERVATION':
      return issue.message === 'A wallet/network must have exactly one final canonical claimed+pending observation.';
    case 'DUPLICATE_SOURCE_BALANCE':
      return issue.message === 'Source balance ids and row hashes must be globally unique across wallets and networks.';
    case 'INVALID_TOKEN_ID':
      return issue.message === 'Token identifiers must be uint256 raw strings.';
    case 'WALLET_WITHOUT_USER':
      return issue.message === 'The discovered wallet is not linked to a legacy user.';
    case 'MISSING_OBSERVATION':
      return issue.message === 'The discovered wallet has no canonical snapshot observation.';
    case 'DUPLICATE_TOKEN':
      return issue.message === 'Token is assigned to more than one wallet or network.';
    case 'SNAPSHOT_ERROR': {
      const match = /^([A-Z0-9_]+): external snapshot source failed\.$/.exec(issue.message);
      return Boolean(match && canonicalExternalCode(match[1]));
    }
    case 'NETWORK_ERROR': {
      const match = /^([A-Z0-9_]+): external network source failed\.$/.exec(issue.message);
      return Boolean(match && canonicalExternalCode(match[1]));
    }
    default:
      return false;
  }
}

function assertCanonicalSnapshotIssues(snapshot: LegacySnapshotResult) {
  let previousKey: string | null = null;
  for (const issue of snapshot.issues) {
    const optionalKeys = ['wallet', 'tokenId', 'source'].filter((key) => (
      Object.prototype.hasOwnProperty.call(issue, key)
    ));
    if (!issue || typeof issue !== 'object' || !exactObjectKeys(issue, [
      'code', 'severity', 'network', 'message', ...optionalKeys,
    ]) || !CANONICAL_SNAPSHOT_ISSUE_CODES.has(issue.code) || issue.severity !== 'error' ||
      (issue.network !== 'BSC' && issue.network !== 'TRON') ||
      typeof issue.message !== 'string' || issue.message.length === 0 || issue.message.length > 512 ||
      normalizeNfc(issue.message) !== issue.message || !canonicalIssueMessage(issue)) {
      throw new Error('Snapshot issue runtime shape or message is not canonical.');
    }
    if (issue.wallet !== undefined && normalizeLegacyAddress(issue.network, issue.wallet) !== issue.wallet) {
      throw new Error('Snapshot issue wallet is not canonical.');
    }
    if (issue.tokenId !== undefined) {
      const tokenId = parseUint256(issue.tokenId);
      if (tokenId === null || tokenId.toString() !== issue.tokenId) {
        throw new Error('Snapshot issue token id is not canonical.');
      }
    }
    if (issue.source !== undefined && normalizeMachineId(issue.source) !== issue.source) {
      throw new Error('Snapshot issue source is not canonical.');
    }
    const key = [
      issue.network, issue.wallet ?? '', issue.code, issue.tokenId ?? '', issue.source ?? '', issue.message,
    ].join('\u0000');
    if (previousKey !== null && compareCodePoints(previousKey, key) > 0) {
      throw new Error('Snapshot issues are not canonically ordered.');
    }
    previousKey = key;
  }
}

function recomputeTotals(snapshot: LegacySnapshotResult) {
  const totals = {
    BSC: { wallets: 0, claimedRaw: '0', pendingRaw: '0', totalRaw: '0', tokens: 0 },
    TRON: { wallets: 0, claimedRaw: '0', pendingRaw: '0', totalRaw: '0', tokens: 0 },
  };
  const walletKeys = new Set<string>();
  const tokenOwners = new Set<string>();
  const sourceBalanceIds = new Set<string>();
  const sourceRowBindings = new Set<string>();
  let previousWalletKey: string | null = null;
  let globalTokens = 0;
  for (const wallet of snapshot.wallets) {
    if (!wallet || (wallet.network !== 'BSC' && wallet.network !== 'TRON') ||
      !exactObjectKeys(wallet, [
        'network', 'wallet', 'userId', 'claimedRaw', 'pendingRaw', 'totalRaw',
        'tokenIds', 'snapshotIds', 'claimedSourceId', 'pendingSourceId',
        'claimedSourceBalanceId', 'pendingSourceBalanceId',
        'claimedSourceRowSha256', 'pendingSourceRowSha256',
      ])) {
      throw new Error('Snapshot wallet runtime shape is invalid.');
    }
    const address = normalizeLegacyAddress(wallet.network, wallet.wallet);
    const claimed = parseUint256(wallet.claimedRaw);
    const pending = parseUint256(wallet.pendingRaw);
    const total = parseUint256(wallet.totalRaw);
    if (!address || address !== wallet.wallet || claimed === null || pending === null ||
      total === null || claimed + pending !== total) {
      throw new Error('Snapshot wallet amounts or address are not canonical.');
    }
    const key = `${wallet.network}\u0000${address}`;
    if (walletKeys.has(key) || (previousWalletKey !== null && compareCodePoints(previousWalletKey, key) >= 0)) {
      throw new Error('Snapshot contains a duplicate or non-canonically ordered wallet.');
    }
    walletKeys.add(key);
    previousWalletKey = key;
    if (!Array.isArray(wallet.tokenIds) || wallet.tokenIds.length > MAX_TOKENS_PER_WALLET ||
      !Array.isArray(wallet.snapshotIds)) {
      throw new Error('Snapshot wallet arrays are invalid.');
    }
    let previousToken: bigint | null = null;
    for (const tokenId of wallet.tokenIds) {
      const parsed = parseUint256(tokenId);
      if (parsed === null || parsed.toString() !== tokenId ||
        (previousToken !== null && parsed <= previousToken)) {
        throw new Error('Snapshot token ids are not unique canonical uint256 values.');
      }
      previousToken = parsed;
      if (snapshot.complete && tokenOwners.has(tokenId)) {
        throw new Error('Complete snapshot contains a duplicate token owner.');
      }
      tokenOwners.add(tokenId);
    }
    const canonicalSnapshotIds = wallet.snapshotIds.map((snapshotId) => (
      normalizeMachineId(snapshotId)
    ));
    if (canonicalSnapshotIds.some((snapshotId, index) => snapshotId !== wallet.snapshotIds[index]) ||
      new Set(wallet.snapshotIds).size !== wallet.snapshotIds.length ||
      !sameStringArray(wallet.snapshotIds, [...wallet.snapshotIds].sort(compareCodePoints))) {
      throw new Error('Snapshot observation ids are not canonical.');
    }
    if (wallet.userId !== null && (
      typeof wallet.userId !== 'string' ||
      normalizeBoundedIdentifier(wallet.userId, 256) !== wallet.userId
    )) {
      throw new Error('Snapshot user id is not canonical.');
    }
    const sourceValues = [
      wallet.claimedSourceId, wallet.pendingSourceId,
      wallet.claimedSourceBalanceId, wallet.pendingSourceBalanceId,
      wallet.claimedSourceRowSha256, wallet.pendingSourceRowSha256,
    ];
    const allSourcesNull = sourceValues.every((value) => value === null);
    const allSourcesPresent = sourceValues.every((value) => typeof value === 'string');
    if ((!allSourcesNull && !allSourcesPresent) || (snapshot.complete && (
      !allSourcesPresent || wallet.userId === null || wallet.snapshotIds.length === 0
    ))) {
      throw new Error('Snapshot source provenance is incomplete.');
    }
    if (allSourcesPresent) {
      const coverage = snapshot.coverage.find((item) => item.network === wallet.network);
      const claimedSourceId = normalizeMachineId(wallet.claimedSourceId!);
      const pendingSourceId = normalizeMachineId(wallet.pendingSourceId!);
      const claimedBalanceId = normalizeMachineId(wallet.claimedSourceBalanceId!);
      const pendingBalanceId = normalizeMachineId(wallet.pendingSourceBalanceId!);
      if (
        !coverage || claimedSourceId !== wallet.claimedSourceId ||
        pendingSourceId !== wallet.pendingSourceId ||
        claimedBalanceId !== wallet.claimedSourceBalanceId ||
        pendingBalanceId !== wallet.pendingSourceBalanceId ||
        claimedSourceId !== coverage.claimed.sourceId || pendingSourceId !== coverage.pending.sourceId ||
        !isSha256(wallet.claimedSourceRowSha256!) || !isSha256(wallet.pendingSourceRowSha256!)
      ) {
        throw new Error('Snapshot source provenance metadata is not canonical.');
      }
      const balanceIds = [claimedBalanceId!, pendingBalanceId!];
      const rowBindings = [wallet.claimedSourceRowSha256!, wallet.pendingSourceRowSha256!];
      if (
        new Set(balanceIds).size !== balanceIds.length ||
        balanceIds.some((balanceId) => sourceBalanceIds.has(balanceId)) ||
        new Set(rowBindings).size !== rowBindings.length ||
        rowBindings.some((rowHash) => sourceRowBindings.has(rowHash))
      ) {
        throw new Error('Snapshot source balance ids and row bindings must be globally unique.');
      }
      if (
        wallet.claimedSourceRowSha256 !== buildSourceBalanceBindingSha256({
          network: wallet.network, cutoffRef: coverage.cutoffRef, sourceId: claimedSourceId!,
          wallet: address, sourceBalanceId: claimedBalanceId!, raw: claimed.toString(),
        }) || wallet.pendingSourceRowSha256 !== buildSourceBalanceBindingSha256({
          network: wallet.network, cutoffRef: coverage.cutoffRef, sourceId: pendingSourceId!,
          wallet: address, sourceBalanceId: pendingBalanceId!, raw: pending.toString(),
        })
      ) {
        throw new Error('Snapshot source provenance is not canonically bound.');
      }
      for (const balanceId of balanceIds) sourceBalanceIds.add(balanceId);
      for (const rowHash of rowBindings) sourceRowBindings.add(rowHash);
    }
    const target = totals[wallet.network];
    const nextClaimed = BigInt(target.claimedRaw) + claimed;
    const nextPending = BigInt(target.pendingRaw) + pending;
    const nextTotal = BigInt(target.totalRaw) + total;
    if (nextClaimed > MAX_UINT256 || nextPending > MAX_UINT256 || nextTotal > MAX_UINT256) {
      throw new Error('Snapshot aggregate exceeds uint256.');
    }
    target.wallets += 1;
    target.claimedRaw = nextClaimed.toString();
    target.pendingRaw = nextPending.toString();
    target.totalRaw = nextTotal.toString();
    target.tokens += wallet.tokenIds.length;
    globalTokens += wallet.tokenIds.length;
    if (globalTokens > MAX_GLOBAL_TOKENS) throw new Error('Snapshot global token limit exceeded.');
  }
  return totals;
}

export function assertCanonicalLegacySnapshot(snapshot: LegacySnapshotResult) {
  snapshot = clonePlainData(snapshot, 'Canonical legacy snapshot', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 16 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024,
  });
  if (!snapshot || typeof snapshot !== 'object' || !exactObjectKeys(snapshot, [
    'previewOnly', 'cutoverAuthorized', 'complete', 'coverage', 'wallets', 'totals',
    'issues', 'integritySha256',
  ]) || snapshot.previewOnly !== true ||
    snapshot.cutoverAuthorized !== false || !Array.isArray(snapshot.coverage) ||
    !Array.isArray(snapshot.wallets) || !Array.isArray(snapshot.issues) ||
    snapshot.complete !== (snapshot.issues.length === 0) ||
    !/^[0-9a-f]{64}$/.test(snapshot.integritySha256 ?? '')) {
    throw new Error('Snapshot result is not a canonical preview result.');
  }
  assertCanonicalSnapshotCoverage(snapshot);
  assertCanonicalSnapshotIssues(snapshot);
  const totals = recomputeTotals(snapshot);
  if (stableJsonStringify(totals) !== stableJsonStringify(snapshot.totals)) {
    throw new Error('Snapshot result totals do not match its wallets.');
  }
  if (!verifyLegacySnapshotIntegrity(snapshot)) {
    throw new Error('Snapshot result integrity hash is invalid.');
  }
  return snapshot;
}

function canonicalFiles(snapshot: LegacySnapshotResult, files: LegacyManifestFile[]) {
  if (!Array.isArray(files) || files.length !== REQUIRED_FILES.length) {
    throw new Error('Manifest requires exactly the four canonical snapshot artifacts.');
  }
  const expected = new Map(
    buildCanonicalLegacyArtifacts(snapshot).map((file) => [file.path, contentBytes(file.contents)]),
  );
  const seen = new Set<string>();
  const result = files.map((file) => {
    if (!file || typeof file !== 'object') throw new Error('Manifest artifact runtime shape is invalid.');
    const filePath = safeRelativePath(file.path);
    if (seen.has(filePath)) throw new Error(`Duplicate manifest file path: ${filePath}`);
    seen.add(filePath);
    const actual = contentBytes(file.contents);
    if (actual.byteLength === 0 || actual.byteLength > MAX_ARTIFACT_BYTES) {
      throw new Error(`Manifest artifact size is invalid: ${filePath}`);
    }
    const canonical = expected.get(filePath);
    if (!canonical || !actual.equals(canonical)) {
      throw new Error(`Manifest artifact does not match canonical snapshot serialization: ${filePath}`);
    }
    return { path: filePath, sha256: sha256(actual), bytes: actual.byteLength };
  });
  for (const required of REQUIRED_FILES) {
    if (!seen.has(required)) throw new Error(`Manifest requires artifact file: ${required}`);
  }
  return result.sort((a, b) => compareCodePoints(a.path, b.path));
}

function assertManifestCoverageAndTotals(manifest: LegacyTransitionManifest) {
  if (!exactObjectKeys(manifest.totals, ['BSC', 'TRON'])) {
    throw new Error('Transition manifest totals shape is invalid.');
  }
  let globalTokens = 0;
  for (const [index, network] of (['BSC', 'TRON'] as const).entries()) {
    const coverage = manifest.coverage[index];
    if (!coverage || coverage.network !== network || !exactObjectKeys(coverage, [
      'network', 'cutoffRef', 'wallets', 'claimed', 'pending',
    ])) {
      throw new Error('Transition manifest coverage is not in canonical BSC/TRON order.');
    }
    const cutoffRef = typeof coverage.cutoffRef === 'string'
      ? normalizeMachineId(coverage.cutoffRef)
      : null;
    const cutoff = manifest.cutoffs[index];
    if (!cutoffRef || cutoffRef !== coverage.cutoffRef || cutoff?.network !== network || cutoff.ref !== cutoffRef) {
      throw new Error(`${network} manifest coverage is not tied to its canonical cutoff.`);
    }

    const sourceIds: string[] = [];
    for (const role of ['wallets', 'claimed', 'pending'] as const) {
      const source = coverage[role];
      const expectedKeys = role === 'wallets'
        ? ['sourceId', 'cutoffRef', 'querySha256', 'sourceSha256', 'complete', 'recordCount']
        : ['sourceId', 'cutoffRef', 'querySha256', 'sourceSha256', 'complete', 'recordCount', 'aggregateRaw'];
      const sourceId = typeof source?.sourceId === 'string'
        ? normalizeMachineId(source.sourceId)
        : null;
      if (
        !exactObjectKeys(source, expectedKeys) || !sourceId || sourceId !== source.sourceId ||
        source.cutoffRef !== cutoffRef || typeof source.querySha256 !== 'string' ||
        typeof source.sourceSha256 !== 'string' || !isSha256(source.querySha256) ||
        !isSha256(source.sourceSha256) || typeof source.complete !== 'boolean' ||
        !Number.isSafeInteger(source.recordCount) || source.recordCount < 0 ||
        source.recordCount > MAX_INPUT_RECORDS
      ) {
        throw new Error(`${network} manifest ${role} coverage metadata is invalid.`);
      }
      if (manifest.complete && source.complete !== true) {
        throw new Error(`${network} complete manifest requires complete ${role} coverage.`);
      }
      if (role !== 'wallets') {
        const balanceSource = source as LegacyBalanceCoverageSource;
        const raw = parseUint256(balanceSource.aggregateRaw);
        if (raw === null || raw.toString() !== balanceSource.aggregateRaw) {
          throw new Error(`${network} manifest ${role} aggregate is not canonical uint256.`);
        }
      }
      sourceIds.push(sourceId);
    }
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new Error(`${network} manifest coverage source ids must be distinct.`);
    }

    const total = manifest.totals[network];
    if (!exactObjectKeys(total, ['wallets', 'claimedRaw', 'pendingRaw', 'totalRaw', 'tokens'])) {
      throw new Error(`${network} transition manifest totals shape is invalid.`);
    }
    const claimed = parseUint256(total.claimedRaw);
    const pending = parseUint256(total.pendingRaw);
    const combined = parseUint256(total.totalRaw);
    if (
      claimed === null || pending === null || combined === null || claimed + pending !== combined ||
      !Number.isSafeInteger(total.wallets) || total.wallets < 0 ||
      total.wallets > MAX_INPUT_RECORDS * 2 || !Number.isSafeInteger(total.tokens) ||
      total.tokens < 0 || total.tokens > MAX_GLOBAL_TOKENS
    ) {
      throw new Error(`${network} transition manifest totals are invalid.`);
    }
    globalTokens += total.tokens;
    if (globalTokens > MAX_GLOBAL_TOKENS) {
      throw new Error('Transition manifest global token total exceeds its limit.');
    }
    if (manifest.complete && (
      coverage.wallets.recordCount !== total.wallets ||
      coverage.claimed.recordCount !== total.wallets ||
      coverage.pending.recordCount !== total.wallets ||
      coverage.claimed.aggregateRaw !== total.claimedRaw ||
      coverage.pending.aggregateRaw !== total.pendingRaw
    )) {
      throw new Error(`${network} complete manifest coverage does not reconcile with totals.`);
    }
  }
}

function assertManifestContracts(manifest: LegacyTransitionManifest) {
  const seenAliases = new Set<string>();
  const seenAddresses = new Set<string>();
  const order: string[] = [];
  for (const contract of manifest.contracts) {
    if (!exactObjectKeys(contract, [
      'network', 'alias', 'address', 'abiSha256', 'expectedOwner',
      'expectedBytecodeHash', 'expectedSelectors',
    ]) || (contract.network !== 'BSC' && contract.network !== 'TRON')) {
      throw new Error('Transition manifest contract metadata shape is invalid.');
    }
    const alias = typeof contract.alias === 'string'
      ? normalizeMachineId(contract.alias)?.toUpperCase()
      : null;
    if (
      !alias || alias !== contract.alias ||
      !REQUIRED_CONTRACT_ALIASES.includes(alias as (typeof REQUIRED_CONTRACT_ALIASES)[number])
    ) {
      throw new Error('Transition manifest contract alias is invalid.');
    }
    const address = typeof contract.address === 'string'
      ? normalizeLegacyAddress(contract.network, contract.address)
      : null;
    const owner = typeof contract.expectedOwner === 'string'
      ? normalizeLegacyAddress(contract.network, contract.expectedOwner)
      : null;
    const selectors = requiredSelectors(alias as (typeof REQUIRED_CONTRACT_ALIASES)[number]);
    if (
      !address || address !== contract.address || !owner || owner !== contract.expectedOwner ||
      typeof contract.abiSha256 !== 'string' || !isSha256(contract.abiSha256) ||
      typeof contract.expectedBytecodeHash !== 'string' ||
      !/^0x[0-9a-f]{64}$/.test(contract.expectedBytecodeHash) ||
      /^0x0{64}$/.test(contract.expectedBytecodeHash) ||
      !Array.isArray(contract.expectedSelectors) ||
      !contract.expectedSelectors.every((selector) => typeof selector === 'string') ||
      !sameStringArray(contract.expectedSelectors, selectors)
    ) {
      throw new Error(`${contract.network} ${alias} transition manifest metadata is invalid.`);
    }
    const aliasKey = `${contract.network}\u0000${alias}`;
    const addressKey = `${contract.network}\u0000${address}`;
    if (seenAliases.has(aliasKey) || seenAddresses.has(addressKey)) {
      throw new Error('Transition manifest contract aliases and addresses must be distinct.');
    }
    seenAliases.add(aliasKey);
    seenAddresses.add(addressKey);
    order.push(`${aliasKey}\u0000${address}`);
  }
  const canonicalOrder = [...order].sort(compareCodePoints);
  if (!sameStringArray(order, canonicalOrder)) {
    throw new Error('Transition manifest contracts are not canonically ordered.');
  }
  for (const network of ['BSC', 'TRON'] as const) {
    for (const alias of REQUIRED_CONTRACT_ALIASES) {
      if (!seenAliases.has(`${network}\u0000${alias}`)) {
        throw new Error(`Transition manifest requires ${network} ${alias}.`);
      }
    }
  }
}

function assertManifestFiles(manifest: LegacyTransitionManifest) {
  const paths: string[] = [];
  for (const file of manifest.files) {
    if (!exactObjectKeys(file, ['path', 'sha256', 'bytes'])) {
      throw new Error('Transition manifest file metadata shape is invalid.');
    }
    const filePath = safeRelativePath(file.path);
    if (
      filePath !== file.path || !REQUIRED_FILES.includes(filePath as (typeof REQUIRED_FILES)[number]) ||
      typeof file.sha256 !== 'string' || !isSha256(file.sha256) ||
      !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_ARTIFACT_BYTES
    ) {
      throw new Error('Transition manifest file metadata is invalid.');
    }
    paths.push(filePath);
  }
  if (new Set(paths).size !== REQUIRED_FILES.length ||
    !REQUIRED_FILES.every((filePath) => paths.includes(filePath)) ||
    !sameStringArray(paths, [...paths].sort(compareCodePoints))) {
    throw new Error('Transition manifest files are not the canonical artifact set.');
  }
}

function assertLegacyTransitionManifestPlain(manifest: LegacyTransitionManifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Transition manifest is missing.');
  if (
    !exactObjectKeys(manifest, [
      'schemaVersion', 'previewOnly', 'cutoverAuthorized', 'complete', 'environment',
      'target', 'coverage', 'cutoffs', 'contracts', 'files', 'totals', 'issueCount',
      'manifestSha256',
    ]) || manifest.schemaVersion !== 1 || manifest.previewOnly !== true ||
    manifest.cutoverAuthorized !== false ||
    !validEnvironment(manifest.environment) || !Number.isSafeInteger(manifest.issueCount) ||
    manifest.issueCount < 0 || manifest.issueCount > MAX_INPUT_RECORDS * 20 ||
    manifest.complete !== (manifest.issueCount === 0) ||
    !Array.isArray(manifest.coverage) || manifest.coverage.length !== 2 ||
    !Array.isArray(manifest.cutoffs) || manifest.cutoffs.length !== 2 ||
    !Array.isArray(manifest.contracts) || manifest.contracts.length !== 6 ||
    !Array.isArray(manifest.files) || manifest.files.length !== REQUIRED_FILES.length ||
    !exactObjectKeys(manifest.target, [
      'databaseName', 'economySchemaVersion', 'sentinelId', 'baselineCollection',
    ]) || manifest.target.databaseName !== TARGET.databaseName ||
    manifest.target.economySchemaVersion !== TARGET.economySchemaVersion ||
    manifest.target.sentinelId !== TARGET.sentinelId ||
    manifest.target.baselineCollection !== TARGET.baselineCollection ||
    typeof manifest.manifestSha256 !== 'string' || !isSha256(manifest.manifestSha256)
  ) {
    throw new Error('Transition manifest integrity or runtime flags are invalid.');
  }
  for (const cutoff of manifest.cutoffs) {
    const keys = cutoff?.network === 'BSC'
      ? ['network', 'ref', 'chainId', 'blockNumber', 'blockHash']
      : ['network', 'ref', 'tronNetwork', 'timestampMs', 'cursor'];
    if (!exactObjectKeys(cutoff, keys)) {
      throw new Error('Transition manifest cutoff shape is invalid.');
    }
  }
  const normalizedCutoffs = normalizeCutoffs(manifest.cutoffs, manifest.environment);
  if (stableJsonStringify(normalizedCutoffs) !== stableJsonStringify(manifest.cutoffs)) {
    throw new Error('Transition manifest cutoffs are not canonical.');
  }
  assertManifestCoverageAndTotals(manifest);
  assertManifestContracts(manifest);
  assertManifestFiles(manifest);

  const { manifestSha256, ...body } = manifest;
  const canonicalBody = stableJsonStringify(body);
  if (Buffer.byteLength(canonicalBody, 'utf8') > 1024 * 1024 || sha256(canonicalBody) !== manifestSha256) {
    throw new Error('Transition manifest integrity hash is invalid.');
  }
}

function assertManifestAnchor(expectedManifestSha256: unknown, actualManifestSha256: string) {
  if (typeof expectedManifestSha256 !== 'string' || !isSha256(expectedManifestSha256) ||
    expectedManifestSha256 !== actualManifestSha256) {
    throw new Error('Expected manifest SHA-256 anchor is missing or does not match.');
  }
}

export function assertLegacyTransitionManifestIntegrity(
  manifest: LegacyTransitionManifest,
  expectedManifestSha256: string,
) {
  manifest = clonePlainData(manifest, 'Legacy transition manifest', {
    maxDepth: 32, maxNodes: 50_000, maxArrayLength: 10_000,
    maxStringBytes: 1024 * 1024, maxTotalBytes: 4 * 1024 * 1024,
  });
  const actualManifestSha256 = manifest && typeof manifest === 'object' &&
    typeof manifest.manifestSha256 === 'string' ? manifest.manifestSha256 : '';
  assertManifestAnchor(expectedManifestSha256, actualManifestSha256);
  assertLegacyTransitionManifestPlain(manifest);
  return manifest;
}

function buildLegacyTransitionManifest(input: {
  snapshot: LegacySnapshotResult;
  environment: LegacyEnvironment;
  cutoffs: LegacyCutoff[];
  contracts: LegacyContractArtifact[];
}): LegacyTransitionManifest {
  if (!input || typeof input !== 'object') throw new Error('Manifest input is invalid.');
  const snapshot = assertCanonicalLegacySnapshot(input.snapshot);
  if (!validEnvironment(input.environment)) throw new Error('Manifest environment is invalid.');
  if (!Array.isArray(input.contracts) || input.contracts.length !== 6) {
    throw new Error('Manifest requires exactly six legacy contract artifacts.');
  }
  const cutoffs = normalizeCutoffs(input.cutoffs, input.environment);
  for (const coverage of snapshot.coverage) {
    const cutoff = cutoffs.find((item) => item.network === coverage.network);
    if (!cutoff || cutoff.ref !== coverage.cutoffRef) {
      throw new Error(`${coverage.network} coverage is not tied to the manifest cutoff.`);
    }
  }

  const seenAliases = new Set<string>();
  const seenAddresses = new Set<string>();
  const contracts = input.contracts.map((contract) => {
    const normalized = normalizeContract(contract);
    const aliasKey = `${normalized.network}\u0000${normalized.alias}`;
    const addressKey = `${normalized.network}\u0000${normalized.address}`;
    if (seenAliases.has(aliasKey)) throw new Error(`Duplicate manifest contract: ${normalized.alias}`);
    if (seenAddresses.has(addressKey)) throw new Error(`Manifest contract aliases require distinct canonical addresses.`);
    seenAliases.add(aliasKey);
    seenAddresses.add(addressKey);
    return normalized;
  }).sort((a, b) => compareCodePoints(
    `${a.network}\u0000${a.alias}\u0000${a.address}`,
    `${b.network}\u0000${b.alias}\u0000${b.address}`,
  ));

  for (const network of ['BSC', 'TRON'] as const) {
    for (const alias of REQUIRED_CONTRACT_ALIASES) {
      if (!seenAliases.has(`${network}\u0000${alias}`)) {
        throw new Error(`Manifest requires ${network} ${alias} contract metadata.`);
      }
    }
  }

  const files = canonicalFiles(snapshot, buildCanonicalLegacyArtifacts(snapshot));
  const body = {
    schemaVersion: 1 as const,
    previewOnly: true as const,
    cutoverAuthorized: false as const,
    complete: snapshot.complete,
    environment: input.environment,
    // Never expose the module-level invariant by reference. Transition packages
    // are plain caller-owned data and callers may mutate a previous result.
    target: { ...TARGET },
    coverage: snapshot.coverage,
    cutoffs,
    contracts,
    files,
    totals: snapshot.totals,
    issueCount: snapshot.issues.length,
  };
  const manifest = { ...body, manifestSha256: sha256(stableJsonStringify(body)) };
  assertLegacyTransitionManifestPlain(manifest);
  return manifest;
}

function assertLegacyTransitionPackagePlain(transitionPackage: LegacyTransitionPackage) {
  if (!transitionPackage || typeof transitionPackage !== 'object' ||
    !exactObjectKeys(transitionPackage, [
      'previewOnly', 'cutoverAuthorized', 'artifacts', 'manifest',
    ]) || transitionPackage.previewOnly !== true || transitionPackage.cutoverAuthorized !== false ||
    !Array.isArray(transitionPackage.artifacts) ||
    transitionPackage.artifacts.length !== REQUIRED_FILES.length) {
    throw new Error('Transition package runtime shape or flags are invalid.');
  }
  assertLegacyTransitionManifestPlain(transitionPackage.manifest);
  const metadataByPath = new Map(
    transitionPackage.manifest.files.map((file) => [file.path, file]),
  );
  const seen = new Set<string>();
  for (const artifact of transitionPackage.artifacts) {
    if (!artifact || typeof artifact !== 'object' ||
      !exactObjectKeys(artifact, ['path', 'contents'])) {
      throw new Error('Transition package artifact shape is invalid.');
    }
    const filePath = safeRelativePath(artifact.path);
    if (filePath !== artifact.path || seen.has(filePath)) {
      throw new Error('Transition package artifact path is invalid or duplicated.');
    }
    const contents = contentBytes(artifact.contents);
    const metadata = metadataByPath.get(filePath);
    if (!metadata || metadata.bytes !== contents.byteLength ||
      metadata.sha256 !== sha256(contents)) {
      throw new Error(`Transition package artifact does not match its manifest: ${filePath}`);
    }
    seen.add(filePath);
  }
  if (!REQUIRED_FILES.every((filePath) => seen.has(filePath))) {
    throw new Error('Transition package is missing a canonical artifact.');
  }
}

export function assertLegacyTransitionPackageIntegrity(
  transitionPackage: LegacyTransitionPackage,
  expectedManifestSha256: string,
) {
  transitionPackage = clonePlainData(transitionPackage, 'Legacy transition package', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 16 * 1024 * 1024, maxTotalBytes: 64 * 1024 * 1024,
  });
  const actualManifestSha256 = transitionPackage && typeof transitionPackage === 'object' &&
    transitionPackage.manifest && typeof transitionPackage.manifest === 'object' &&
    typeof transitionPackage.manifest.manifestSha256 === 'string'
    ? transitionPackage.manifest.manifestSha256
    : '';
  assertManifestAnchor(expectedManifestSha256, actualManifestSha256);
  assertLegacyTransitionPackagePlain(transitionPackage);
  return transitionPackage;
}

export function buildLegacyTransitionPackage(input: {
  snapshotInput: LegacySnapshotInput;
  environment: LegacyEnvironment;
  cutoffs: LegacyCutoff[];
  contracts: LegacyContractArtifact[];
}): LegacyTransitionPackage {
  input = clonePlainData(input, 'Transition package input', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024,
  });
  if (!input || typeof input !== 'object' || !exactObjectKeys(input, [
    'snapshotInput', 'environment', 'cutoffs', 'contracts',
  ])) throw new Error('Transition package input is invalid.');
  const snapshot = buildLegacySnapshot(input.snapshotInput);
  const artifacts = buildCanonicalLegacyArtifacts(snapshot);
  const manifest = buildLegacyTransitionManifest({
    snapshot,
    environment: input.environment,
    cutoffs: input.cutoffs,
    contracts: input.contracts,
  });
  const result = { previewOnly: true, cutoverAuthorized: false, artifacts, manifest } as const;
  assertLegacyTransitionPackagePlain(result);
  return result;
}
