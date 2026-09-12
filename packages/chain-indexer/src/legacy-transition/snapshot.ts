import { createHash } from 'node:crypto';
import { TronWeb } from 'tronweb';
import { isAddress } from 'viem';

import {
  compareCodePoints,
  isSha256,
  MAX_GLOBAL_TOKENS,
  MAX_INPUT_BYTES,
  MAX_INPUT_RECORDS,
  MAX_TOKENS_PER_WALLET,
  MAX_UINT256,
  MAX_USER_ID_LENGTH,
  normalizeBoundedIdentifier,
  normalizeMachineId,
  parseUint256,
  sanitizeExternalErrorCode,
} from './canonical.js';
import { stableJsonStringify } from './serialize.js';
import { clonePlainData } from './plain-data.js';
import type {
  LegacyBalanceCoverageSource,
  LegacyChain,
  LegacyChainTotals,
  LegacyCoverageSource,
  LegacyNetworkCoverage,
  LegacySnapshotInput,
  LegacySnapshotIssue,
  LegacySnapshotObservation,
  LegacySnapshotResult,
  LegacyWalletSnapshot,
  WalletDiscoveryRecord,
} from './types.js';

const CHAINS: LegacyChain[] = ['BSC', 'TRON'];
const BSC_ZERO = '0x0000000000000000000000000000000000000000';
const TRON_ZERO = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

export function normalizeLegacyAddress(network: LegacyChain, value: string) {
  if ((network !== 'BSC' && network !== 'TRON') || typeof value !== 'string') return null;
  const wallet = value.trim();
  if (wallet.length === 0 || wallet.length > 128) return null;
  if (network === 'BSC') {
    const normalized = wallet.toLowerCase();
    return isAddress(normalized) && normalized !== BSC_ZERO ? normalized : null;
  }

  let normalized = wallet;
  if (/^(41|0x)[0-9a-fA-F]{40}$/.test(wallet)) {
    try {
      normalized = TronWeb.address.fromHex(wallet.startsWith('0x') ? `41${wallet.slice(2)}` : wallet);
    } catch {
      return null;
    }
  }
  if (!TronWeb.isAddress(normalized)) return null;
  try {
    const canonical = TronWeb.address.fromHex(TronWeb.address.toHex(normalized));
    return canonical === TRON_ZERO ? null : canonical;
  } catch {
    return null;
  }
}

export function buildSourceBalanceBindingSha256(input: {
  network: LegacyChain;
  cutoffRef: string;
  sourceId: string;
  wallet: string;
  sourceBalanceId: string;
  raw: string;
}) {
  input = clonePlainData(input, 'Source balance binding', {
    maxDepth: 4, maxNodes: 32, maxArrayLength: 8, maxObjectKeys: 8,
    maxStringBytes: 512, maxTotalBytes: 4_096,
  });
  if (!input || typeof input !== 'object' ||
    Object.keys(input).sort(compareCodePoints).join('\u0000') !== [
      'cutoffRef', 'network', 'raw', 'sourceBalanceId', 'sourceId', 'wallet',
    ].join('\u0000')) throw new Error('Source balance binding input is invalid.');
  const wallet = normalizeLegacyAddress(input.network, input.wallet);
  const cutoffRef = typeof input.cutoffRef === 'string'
    ? normalizeMachineId(input.cutoffRef)
    : null;
  const sourceId = typeof input.sourceId === 'string'
    ? normalizeMachineId(input.sourceId)
    : null;
  const sourceBalanceId = typeof input.sourceBalanceId === 'string'
    ? normalizeMachineId(input.sourceBalanceId)
    : null;
  const raw = parseUint256(input.raw)?.toString();
  if (!wallet || !cutoffRef || !sourceId || !sourceBalanceId || raw === undefined) {
    throw new Error('Source balance binding input is invalid.');
  }
  return createHash('sha256').update(stableJsonStringify({
    network: input.network, cutoffRef, sourceId, wallet, sourceBalanceId, raw,
  })).digest('hex');
}

function emptyTotals(): LegacyChainTotals {
  return { wallets: 0, claimedRaw: '0', pendingRaw: '0', totalRaw: '0', tokens: 0 };
}

function issueKey(issue: LegacySnapshotIssue) {
  return [
    issue.network,
    issue.wallet ?? '',
    issue.code,
    issue.tokenId ?? '',
    issue.source ?? '',
    issue.message,
  ].join('\u0000');
}

function sortByPrecomputedKey<T>(values: Iterable<T>, keyFor: (value: T) => string) {
  return [...values]
    .map((value) => ({ key: keyFor(value), value }))
    .sort((left, right) => compareCodePoints(left.key, right.key))
    .map(({ value }) => value);
}

function stableObservationValue(observation: LegacySnapshotObservation) {
  return stableJsonStringify({
    claimedSourceId: observation.claimedSourceId ?? null,
    pendingSourceId: observation.pendingSourceId ?? null,
    claimedSourceBalanceId: observation.claimedSourceBalanceId ?? null,
    pendingSourceBalanceId: observation.pendingSourceBalanceId ?? null,
    claimedSourceRowSha256: observation.claimedSourceRowSha256 ?? null,
    pendingSourceRowSha256: observation.pendingSourceRowSha256 ?? null,
    claimedRaw: observation.claimedRaw?.trim() ?? null,
    pendingRaw: observation.pendingRaw?.trim() ?? null,
    tokenIds: [...(observation.tokenIds ?? [])]
      .map((tokenId) => tokenId.trim())
      .sort(compareCodePoints),
    error: observation.error ? sanitizeExternalErrorCode(observation.error.code) : null,
  });
}

type MutableWallet = {
  network: LegacyChain;
  wallet: string;
  userIds: Set<string>;
  claimedRaw: bigint;
  pendingRaw: bigint;
  tokenIds: Set<string>;
  snapshotIds: Set<string>;
  claimedSourceId: string | null;
  pendingSourceId: string | null;
  claimedSourceBalanceId: string | null;
  pendingSourceBalanceId: string | null;
  claimedSourceRowSha256: string | null;
  pendingSourceRowSha256: string | null;
};

type NormalizedDiscovery = WalletDiscoveryRecord & {
  wallet: string;
  source: string;
  userId: string | null;
};

function getWallet(wallets: Map<string, MutableWallet>, network: LegacyChain, wallet: string) {
  const key = `${network}\u0000${wallet}`;
  let current = wallets.get(key);
  if (!current) {
    current = {
      network,
      wallet,
      userIds: new Set(),
      claimedRaw: 0n,
      pendingRaw: 0n,
      tokenIds: new Set(),
      snapshotIds: new Set(),
      claimedSourceId: null,
      pendingSourceId: null,
      claimedSourceBalanceId: null,
      pendingSourceBalanceId: null,
      claimedSourceRowSha256: null,
      pendingSourceRowSha256: null,
    };
    wallets.set(key, current);
  }
  return current;
}

function inputLimitGuard(input: LegacySnapshotInput) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.coverage) ||
    !Array.isArray(input.discoveries) || !Array.isArray(input.observations) ||
    (input.errors !== undefined && !Array.isArray(input.errors))) {
    throw new Error('Legacy snapshot input shape is invalid.');
  }
  let inputBytes: number;
  try {
    inputBytes = Buffer.byteLength(JSON.stringify(input), 'utf8');
  } catch {
    throw new Error('Legacy snapshot input must be serializable.');
  }
  if (
    inputBytes > MAX_INPUT_BYTES || input.coverage.length !== 2 ||
    input.discoveries.length > MAX_INPUT_RECORDS ||
    input.observations.length > MAX_INPUT_RECORDS ||
    (input.errors?.length ?? 0) > MAX_INPUT_RECORDS
  ) {
    throw new Error('Legacy snapshot input limit exceeded.');
  }
  const validNetwork = (value: unknown) => value === 'BSC' || value === 'TRON';
  const coverageShapeValid = input.coverage.every((item) => item && typeof item === 'object' &&
    validNetwork(item.network) && typeof item.cutoffRef === 'string' &&
    ['wallets', 'claimed', 'pending'].every((role) => {
      const source = item[role as keyof LegacyNetworkCoverage] as unknown;
      if (!source || typeof source !== 'object') return false;
      const record = source as Record<string, unknown>;
      return typeof record.sourceId === 'string' && typeof record.cutoffRef === 'string' &&
        typeof record.querySha256 === 'string' && typeof record.sourceSha256 === 'string' &&
        typeof record.complete === 'boolean' && typeof record.recordCount === 'number' &&
        (role === 'wallets' || typeof record.aggregateRaw === 'string');
    }));
  const discoveriesShapeValid = input.discoveries.every((item) => item && typeof item === 'object' &&
    validNetwork(item.network) && typeof item.wallet === 'string' && typeof item.source === 'string' &&
    (item.userId === undefined || item.userId === null || typeof item.userId === 'string'));
  const optionalString = (value: unknown) => value === undefined || typeof value === 'string';
  const observationsShapeValid = input.observations.every((item) => item && typeof item === 'object' &&
    validNetwork(item.network) && typeof item.wallet === 'string' && typeof item.snapshotId === 'string' &&
    optionalString(item.claimedSourceId) && optionalString(item.pendingSourceId) &&
    optionalString(item.claimedSourceBalanceId) && optionalString(item.pendingSourceBalanceId) &&
    optionalString(item.claimedSourceRowSha256) && optionalString(item.pendingSourceRowSha256) &&
    optionalString(item.claimedRaw) && optionalString(item.pendingRaw) &&
    (item.tokenIds === undefined || (Array.isArray(item.tokenIds) &&
      item.tokenIds.every((id) => typeof id === 'string'))) &&
    (item.error === undefined || (item.error && typeof item.error === 'object' &&
      typeof item.error.code === 'string' && typeof item.error.message === 'string')));
  const errorsShapeValid = (input.errors ?? []).every((item) => item && typeof item === 'object' &&
    validNetwork(item.network) && typeof item.code === 'string' && typeof item.message === 'string' &&
    (item.wallet === undefined || typeof item.wallet === 'string'));
  if (!coverageShapeValid || !discoveriesShapeValid || !observationsShapeValid || !errorsShapeValid) {
    throw new Error('Legacy snapshot input contains invalid runtime values.');
  }
  const globalTokens = input.observations.reduce((sum, item) => sum + (item.tokenIds?.length ?? 0), 0);
  if (globalTokens > MAX_GLOBAL_TOKENS || input.observations.some(
    (item) => (item.tokenIds?.length ?? 0) > MAX_TOKENS_PER_WALLET,
  )) {
    throw new Error('Legacy snapshot token input limit exceeded.');
  }
}

function validCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_INPUT_RECORDS;
}

function normalizeCoverageSource(
  network: LegacyChain,
  role: 'wallets' | 'claimed' | 'pending',
  source: LegacyCoverageSource | LegacyBalanceCoverageSource,
  cutoffRef: string,
  issues: LegacySnapshotIssue[],
) {
  const sourceId = normalizeMachineId(source.sourceId);
  const sourceCutoffRef = normalizeMachineId(source.cutoffRef);
  if (
    !sourceId ||
    !sourceCutoffRef ||
    sourceCutoffRef !== cutoffRef ||
    !isSha256(source.querySha256) ||
    !isSha256(source.sourceSha256) ||
    !validCount(source.recordCount)
  ) {
    issues.push({
      code: 'INVALID_COVERAGE_SOURCE',
      severity: 'error',
      network,
      source: sourceId ?? role,
      message: `${network} ${role} coverage evidence is malformed or not tied to its cutoff.`,
    });
  }
  if (source.complete !== true) {
    issues.push({
      code: 'INCOMPLETE_NETWORK_COVERAGE',
      severity: 'error',
      network,
      source: sourceId ?? role,
      message: `${network} ${role} coverage is incomplete.`,
    });
  }
  if (role !== 'wallets' && parseUint256((source as LegacyBalanceCoverageSource).aggregateRaw) === null) {
    issues.push({
      code: 'INVALID_COVERAGE_SOURCE',
      severity: 'error',
      network,
      source: sourceId ?? role,
      message: `${network} ${role} aggregate must be a uint256 raw string.`,
    });
  }
}

function normalizeCoverage(input: LegacyNetworkCoverage[], issues: LegacySnapshotIssue[]) {
  const normalized: LegacyNetworkCoverage[] = [];
  for (const network of CHAINS) {
    const matches = input.filter((coverage) => coverage.network === network);
    if (matches.length === 0) {
      issues.push({
        code: 'MISSING_NETWORK_COVERAGE', severity: 'error', network,
        message: `Coverage for ${network} is missing.`,
      });
      continue;
    }
    if (matches.length !== 1) {
      issues.push({
        code: 'DUPLICATE_NETWORK_COVERAGE', severity: 'error', network,
        message: `Coverage for ${network} must appear exactly once.`,
      });
      continue;
    }

    const coverage = matches[0];
    const cutoffRef = normalizeMachineId(coverage.cutoffRef);
    if (!cutoffRef) {
      issues.push({
        code: 'INVALID_COVERAGE_SOURCE', severity: 'error', network,
        message: `${network} coverage cutoff reference is invalid.`,
      });
    }
    const ref = cutoffRef ?? '';
    normalizeCoverageSource(network, 'wallets', coverage.wallets, ref, issues);
    normalizeCoverageSource(network, 'claimed', coverage.claimed, ref, issues);
    normalizeCoverageSource(network, 'pending', coverage.pending, ref, issues);
    const sourceIds = [coverage.wallets.sourceId, coverage.claimed.sourceId, coverage.pending.sourceId]
      .map((sourceId) => normalizeMachineId(sourceId) ?? '');
    if (new Set(sourceIds).size !== sourceIds.length) {
      issues.push({
        code: 'INVALID_COVERAGE_SOURCE', severity: 'error', network,
        message: `${network} wallets, claimed and pending evidence require distinct source ids.`,
      });
    }
    const claimedAggregate = parseUint256(coverage.claimed.aggregateRaw);
    const pendingAggregate = parseUint256(coverage.pending.aggregateRaw);
    if (claimedAggregate !== null && pendingAggregate !== null && claimedAggregate + pendingAggregate > MAX_UINT256) {
      issues.push({
        code: 'INVALID_COVERAGE_SOURCE', severity: 'error', network,
        message: `${network} combined claimed and pending aggregate exceeds uint256.`,
      });
    }

    normalized.push({
      network,
      cutoffRef: ref,
      wallets: {
        ...coverage.wallets,
        sourceId: normalizeMachineId(coverage.wallets.sourceId) ?? '',
        cutoffRef: normalizeMachineId(coverage.wallets.cutoffRef) ?? '',
      },
      claimed: {
        ...coverage.claimed,
        sourceId: normalizeMachineId(coverage.claimed.sourceId) ?? '',
        cutoffRef: normalizeMachineId(coverage.claimed.cutoffRef) ?? '',
        aggregateRaw: parseUint256(coverage.claimed.aggregateRaw)?.toString() ?? coverage.claimed.aggregateRaw,
      },
      pending: {
        ...coverage.pending,
        sourceId: normalizeMachineId(coverage.pending.sourceId) ?? '',
        cutoffRef: normalizeMachineId(coverage.pending.cutoffRef) ?? '',
        aggregateRaw: parseUint256(coverage.pending.aggregateRaw)?.toString() ?? coverage.pending.aggregateRaw,
      },
    });
  }
  return normalized;
}

function normalizeDiscovery(
  discovery: WalletDiscoveryRecord,
  issues: LegacySnapshotIssue[],
): NormalizedDiscovery | null {
  const wallet = normalizeLegacyAddress(discovery.network, discovery.wallet);
  const source = normalizeMachineId(discovery.source);
  const userId = discovery.userId == null
    ? null
    : normalizeBoundedIdentifier(discovery.userId, MAX_USER_ID_LENGTH);
  if (!wallet || !source || (discovery.userId != null && !userId)) {
    issues.push({
      code: 'INVALID_WALLET', severity: 'error', network: discovery.network,
      ...(source ? { source } : {}),
      message: 'Wallet discovery contains invalid or oversized identifiers.',
    });
    return null;
  }
  return { ...discovery, wallet, source, userId };
}

function addCoverageMismatch(
  issues: LegacySnapshotIssue[],
  network: LegacyChain,
  source: string,
  field: string,
) {
  issues.push({
    code: 'COVERAGE_MISMATCH', severity: 'error', network, source,
    message: `${network} coverage ${field} does not match the canonical snapshot.`,
  });
}

function computeLegacySnapshotIntegrity(snapshot: Pick<
  LegacySnapshotResult,
  'previewOnly' | 'cutoverAuthorized' | 'complete' | 'coverage' | 'wallets' | 'totals' | 'issues'
>) {
  return createHash('sha256').update(stableJsonStringify({
    previewOnly: snapshot.previewOnly,
    cutoverAuthorized: snapshot.cutoverAuthorized,
    complete: snapshot.complete,
    coverage: snapshot.coverage,
    wallets: snapshot.wallets,
    totals: snapshot.totals,
    issues: snapshot.issues,
  })).digest('hex');
}

export function verifyLegacySnapshotIntegrity(snapshot: Pick<
  LegacySnapshotResult,
  | 'previewOnly' | 'cutoverAuthorized' | 'complete' | 'coverage' | 'wallets'
  | 'totals' | 'issues' | 'integritySha256'
>) {
  snapshot = clonePlainData(snapshot, 'Legacy snapshot integrity input', {
    maxDepth: 32, maxNodes: 100_000, maxArrayLength: 50_000,
    maxStringBytes: 4 * 1024 * 1024, maxTotalBytes: 16 * 1024 * 1024,
  });
  if (!snapshot || typeof snapshot !== 'object') {
    throw new Error('Legacy snapshot integrity input is invalid.');
  }
  return typeof snapshot.integritySha256 === 'string' &&
    isSha256(snapshot.integritySha256) &&
    computeLegacySnapshotIntegrity(snapshot) === snapshot.integritySha256;
}

export function buildLegacySnapshot(input: LegacySnapshotInput): LegacySnapshotResult {
  input = clonePlainData(input, 'Legacy snapshot input', {
    maxDepth: 32, maxNodes: 250_000, maxArrayLength: 50_000,
    maxStringBytes: 1024 * 1024, maxTotalBytes: MAX_INPUT_BYTES,
  });
  inputLimitGuard(input);
  const issues: LegacySnapshotIssue[] = [];
  const coverage = normalizeCoverage(input.coverage, issues);
  const wallets = new Map<string, MutableWallet>();
  const discoveries = new Map<string, NormalizedDiscovery>();
  const discoveredWalletKeys = new Set<string>();

  const normalizedDiscoveries = sortByPrecomputedKey(input.discoveries
    .map((item) => normalizeDiscovery(item, issues))
    .filter((item): item is NormalizedDiscovery => item !== null),
  (item) => `${item.network}\u0000${item.wallet}\u0000${item.source}\u0000${item.userId ?? ''}`);

  for (const discovery of normalizedDiscoveries) {
    const expectedSource = coverage.find((item) => item.network === discovery.network)?.wallets.sourceId;
    if (!expectedSource || discovery.source !== expectedSource) {
      issues.push({
        code: 'INVALID_SOURCE_BINDING', severity: 'error', network: discovery.network,
        wallet: discovery.wallet, source: discovery.source,
        message: 'Wallet discovery source does not match the covered wallet source.',
      });
      continue;
    }
    discoveredWalletKeys.add(`${discovery.network}\u0000${discovery.wallet}`);
    const key = `${discovery.network}\u0000${discovery.wallet}\u0000${discovery.source}`;
    const previous = discoveries.get(key);
    if (previous && previous.userId !== discovery.userId) {
      issues.push({
        code: 'CONFLICTING_USER', severity: 'error', network: discovery.network,
        wallet: discovery.wallet, source: discovery.source,
        message: 'The same wallet discovery source resolves to different users.',
      });
      continue;
    }
    if (previous) continue;
    discoveries.set(key, discovery);
    const target = getWallet(wallets, discovery.network, discovery.wallet);
    if (discovery.userId) target.userIds.add(discovery.userId);
  }

  const observationGroups = new Map<string, LegacySnapshotObservation[]>();
  for (const observation of input.observations) {
    const wallet = normalizeLegacyAddress(observation.network, observation.wallet);
    const snapshotId = normalizeMachineId(observation.snapshotId);
    if (!wallet || !snapshotId) {
      issues.push({
        code: 'INVALID_WALLET', severity: 'error', network: observation.network,
        message: 'Snapshot observation contains an invalid wallet or snapshot identifier.',
      });
      continue;
    }
    const normalized = { ...observation, wallet, snapshotId };
    const key = `${observation.network}\u0000${wallet}`;
    const group = observationGroups.get(key) ?? [];
    group.push(normalized);
    observationGroups.set(key, group);
  }

  const usedSourceBalances = new Set<string>();
  for (const [, candidates] of [...observationGroups].sort(([a], [b]) => compareCodePoints(a, b))) {
    const unique = new Map<string, LegacySnapshotObservation>();
    for (const candidate of candidates) {
      unique.set(`${candidate.snapshotId}\u0000${stableObservationValue(candidate)}`, candidate);
    }
    const canonicalCandidates = [...unique.entries()]
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([, candidate]) => candidate);
    const first = canonicalCandidates[0];
    if (!first) continue;
    const target = getWallet(wallets, first.network, first.wallet);
    for (const candidate of canonicalCandidates) target.snapshotIds.add(candidate.snapshotId);

    if (canonicalCandidates.length !== 1) {
      issues.push({
        code: 'CONFLICTING_OBSERVATION', severity: 'error', network: first.network,
        wallet: first.wallet,
        message: 'A wallet/network must have exactly one final canonical claimed+pending observation.',
      });
      continue;
    }
    if (first.error) {
      const code = sanitizeExternalErrorCode(first.error.code);
      issues.push({
        code: 'SNAPSHOT_ERROR', severity: 'error', network: first.network,
        wallet: first.wallet, source: first.snapshotId,
        message: `${code}: external snapshot source failed.`,
      });
      continue;
    }

    const networkCoverage = coverage.find((item) => item.network === first.network);
    const claimedSourceId = first.claimedSourceId
      ? normalizeMachineId(first.claimedSourceId)
      : null;
    const pendingSourceId = first.pendingSourceId
      ? normalizeMachineId(first.pendingSourceId)
      : null;
    const claimedSourceBalanceId = first.claimedSourceBalanceId
      ? normalizeMachineId(first.claimedSourceBalanceId)
      : null;
    const pendingSourceBalanceId = first.pendingSourceBalanceId
      ? normalizeMachineId(first.pendingSourceBalanceId)
      : null;
    const claimedRaw = parseUint256(first.claimedRaw?.trim());
    const pendingRaw = parseUint256(first.pendingRaw?.trim());
    if (
      !networkCoverage || !claimedSourceId || !pendingSourceId ||
      claimedSourceId !== networkCoverage.claimed.sourceId ||
      pendingSourceId !== networkCoverage.pending.sourceId ||
      !claimedSourceBalanceId || !pendingSourceBalanceId ||
      !isSha256(first.claimedSourceRowSha256 ?? '') ||
      !isSha256(first.pendingSourceRowSha256 ?? '') ||
      claimedRaw === null || pendingRaw === null || claimedRaw + pendingRaw > MAX_UINT256
    ) {
      issues.push({
        code: 'INVALID_SOURCE_BINDING', severity: 'error', network: first.network,
        wallet: first.wallet, source: first.snapshotId,
        message: 'Canonical observation source ids, row hashes, balance ids or uint256 amounts are invalid.',
      });
      continue;
    }
    const expectedClaimedHash = buildSourceBalanceBindingSha256({
      network: first.network, cutoffRef: networkCoverage.cutoffRef,
      sourceId: claimedSourceId, wallet: first.wallet,
      sourceBalanceId: claimedSourceBalanceId, raw: claimedRaw.toString(),
    });
    const expectedPendingHash = buildSourceBalanceBindingSha256({
      network: first.network, cutoffRef: networkCoverage.cutoffRef,
      sourceId: pendingSourceId, wallet: first.wallet,
      sourceBalanceId: pendingSourceBalanceId, raw: pendingRaw.toString(),
    });
    if (
      first.claimedSourceRowSha256 !== expectedClaimedHash ||
      first.pendingSourceRowSha256 !== expectedPendingHash
    ) {
      issues.push({
        code: 'INVALID_SOURCE_BINDING', severity: 'error', network: first.network,
        wallet: first.wallet, source: first.snapshotId,
        message: 'Source row hashes do not bind balances to the canonical wallet and cutoff.',
      });
      continue;
    }
    const sourceKeys = [
      `id\u0000${claimedSourceBalanceId}`,
      `id\u0000${pendingSourceBalanceId}`,
      `hash\u0000${expectedClaimedHash}`,
      `hash\u0000${expectedPendingHash}`,
    ];
    const duplicatedSource = new Set(sourceKeys).size !== sourceKeys.length ||
      sourceKeys.some((key) => usedSourceBalances.has(key));
    if (duplicatedSource) {
      issues.push({
        code: 'DUPLICATE_SOURCE_BALANCE', severity: 'error', network: first.network,
        wallet: first.wallet, source: first.snapshotId,
        message: 'Source balance ids and row hashes must be globally unique across wallets and networks.',
      });
      continue;
    }
    for (const key of sourceKeys) usedSourceBalances.add(key);
    target.claimedSourceId = claimedSourceId;
    target.pendingSourceId = pendingSourceId;
    target.claimedSourceBalanceId = claimedSourceBalanceId;
    target.pendingSourceBalanceId = pendingSourceBalanceId;
    target.claimedSourceRowSha256 = expectedClaimedHash;
    target.pendingSourceRowSha256 = expectedPendingHash;
    target.claimedRaw = claimedRaw;
    target.pendingRaw = pendingRaw;

    for (const rawTokenId of first.tokenIds ?? []) {
      const tokenId = parseUint256(rawTokenId.trim());
      if (tokenId === null) {
        issues.push({
          code: 'INVALID_TOKEN_ID', severity: 'error', network: first.network,
          wallet: first.wallet, source: first.snapshotId,
          message: 'Token identifiers must be uint256 raw strings.',
        });
        continue;
      }
      target.tokenIds.add(tokenId.toString());
    }
  }

  for (const error of input.errors ?? []) {
    const code = sanitizeExternalErrorCode(error.code);
    const wallet = error.wallet
      ? normalizeLegacyAddress(error.network, error.wallet) ?? undefined
      : undefined;
    issues.push({
      code: 'NETWORK_ERROR', severity: 'error', network: error.network,
      ...(wallet ? { wallet } : {}),
      message: `${code}: external network source failed.`,
    });
  }

  const tokenOwners = new Map<string, { network: LegacyChain; wallet: string }>();
  for (const wallet of sortByPrecomputedKey(
    wallets.values(),
    (item) => `${item.network}\u0000${item.wallet}`,
  )) {
    if (wallet.userIds.size === 0) {
      issues.push({
        code: 'WALLET_WITHOUT_USER', severity: 'error', network: wallet.network,
        wallet: wallet.wallet, message: 'The discovered wallet is not linked to a legacy user.',
      });
    } else if (wallet.userIds.size > 1) {
      issues.push({
        code: 'CONFLICTING_USER', severity: 'error', network: wallet.network,
        wallet: wallet.wallet, message: 'The wallet is linked to more than one legacy user.',
      });
    }
    if (wallet.snapshotIds.size === 0) {
      issues.push({
        code: 'MISSING_OBSERVATION', severity: 'error', network: wallet.network,
        wallet: wallet.wallet, message: 'The discovered wallet has no canonical snapshot observation.',
      });
    }

    for (const tokenId of wallet.tokenIds) {
      const previous = tokenOwners.get(tokenId);
      if (previous && (previous.network !== wallet.network || previous.wallet !== wallet.wallet)) {
        issues.push({
          code: 'DUPLICATE_TOKEN', severity: 'error', network: wallet.network,
          wallet: wallet.wallet, tokenId,
          message: 'Token is assigned to more than one wallet or network.',
        });
      } else tokenOwners.set(tokenId, { network: wallet.network, wallet: wallet.wallet });
    }
  }

  const normalizedWallets: LegacyWalletSnapshot[] = sortByPrecomputedKey([...wallets.values()]
    .map((wallet) => ({
      network: wallet.network,
      wallet: wallet.wallet,
      userId: wallet.userIds.size === 1 ? [...wallet.userIds][0] : null,
      claimedRaw: wallet.claimedRaw.toString(),
      pendingRaw: wallet.pendingRaw.toString(),
      totalRaw: (wallet.claimedRaw + wallet.pendingRaw).toString(),
      tokenIds: [...wallet.tokenIds]
        .map((value) => ({ numeric: BigInt(value), value }))
        .sort((left, right) => (
          left.numeric < right.numeric ? -1 : left.numeric > right.numeric ? 1 : 0
        ))
        .map(({ value }) => value),
      snapshotIds: [...wallet.snapshotIds].sort(compareCodePoints),
      claimedSourceId: wallet.claimedSourceId,
      pendingSourceId: wallet.pendingSourceId,
      claimedSourceBalanceId: wallet.claimedSourceBalanceId,
      pendingSourceBalanceId: wallet.pendingSourceBalanceId,
      claimedSourceRowSha256: wallet.claimedSourceRowSha256,
      pendingSourceRowSha256: wallet.pendingSourceRowSha256,
    })), (wallet) => `${wallet.network}\u0000${wallet.wallet}`);

  const totals: Record<LegacyChain, LegacyChainTotals> = { BSC: emptyTotals(), TRON: emptyTotals() };
  for (const wallet of normalizedWallets) {
    const total = totals[wallet.network];
    const nextClaimed = BigInt(total.claimedRaw) + BigInt(wallet.claimedRaw);
    const nextPending = BigInt(total.pendingRaw) + BigInt(wallet.pendingRaw);
    const nextTotal = BigInt(total.totalRaw) + BigInt(wallet.totalRaw);
    if (nextClaimed > MAX_UINT256 || nextPending > MAX_UINT256 || nextTotal > MAX_UINT256) {
      throw new Error(`Legacy snapshot ${wallet.network} aggregate exceeds uint256.`);
    }
    total.wallets += 1;
    total.claimedRaw = nextClaimed.toString();
    total.pendingRaw = nextPending.toString();
    total.totalRaw = nextTotal.toString();
    total.tokens += wallet.tokenIds.length;
    if (total.tokens > MAX_GLOBAL_TOKENS) throw new Error('Legacy snapshot global token limit exceeded.');
  }

  for (const item of coverage) {
    const discoveredCount = [...discoveredWalletKeys].filter((key) => key.startsWith(`${item.network}\u0000`)).length;
    const observedCount = [...observationGroups.keys()].filter((key) => key.startsWith(`${item.network}\u0000`)).length;
    if (item.wallets.recordCount !== discoveredCount) {
      addCoverageMismatch(issues, item.network, item.wallets.sourceId, 'discovered count');
    }
    if (item.claimed.recordCount !== observedCount || item.pending.recordCount !== observedCount) {
      addCoverageMismatch(issues, item.network, item.claimed.sourceId, 'observed count');
    }
    if (item.claimed.aggregateRaw !== totals[item.network].claimedRaw) {
      addCoverageMismatch(issues, item.network, item.claimed.sourceId, 'claimed aggregate');
    }
    if (item.pending.aggregateRaw !== totals[item.network].pendingRaw) {
      addCoverageMismatch(issues, item.network, item.pending.sourceId, 'pending aggregate');
    }
  }

  const normalizedIssues = sortByPrecomputedKey(issues, issueKey);
  const result = {
    previewOnly: true,
    cutoverAuthorized: false,
    complete: normalizedIssues.length === 0,
    coverage,
    wallets: normalizedWallets,
    totals,
    issues: normalizedIssues,
  } as const;
  return { ...result, integritySha256: computeLegacySnapshotIntegrity(result) };
}
