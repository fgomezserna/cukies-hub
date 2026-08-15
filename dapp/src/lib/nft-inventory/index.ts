import type { ClientSession, Db } from 'mongodb';

import { normalizeWalletAddress } from '@/lib/wallet-address';

import {
  CUKIE_MASTER_ORIGINAL_RARITY_POINTS,
  calculateCukieMasterSlots,
} from '@/lib/uki-economy/rules';

export type NftAssetNetwork = 'bsc' | 'tron' | 'unknown';

export type NftAssetRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary'
  | 'goat'
  | 'unknown';

export type NftAssetGeneration = 'original' | 'second_generation' | 'unknown';

export type NftCanonicalState =
  | 'available'
  | 'listed'
  | 'bridging'
  | 'soft_staked'
  | 'in_pool'
  | 'assigned_to_game'
  | 'invalidated'
  | 'unknown';

export type NftInventoryBlocker =
  | 'asset_not_found'
  | 'owner_mismatch'
  | 'unknown_owner'
  | 'unknown_network'
  | 'unsupported_network'
  | 'missing_token_id'
  | 'missing_rarity'
  | 'missing_generation'
  | 'second_generation'
  | 'listed'
  | 'bridging'
  | 'already_locked'
  | 'in_pool'
  | 'assigned_to_game'
  | 'invalidated'
  | 'unknown_state'
  | 'soft_stake_required';

export type NftAssetSourceRef = {
  source: 'cukies' | 'nft_asset_locks' | 'cukie_master_nft_positions';
  collection: string;
  documentId: string | null;
  tokenId?: string | null;
  observedAt: string | null;
};

export type NftAssetActiveLock = {
  lockId: string | null;
  assetId: string | null;
  ownerNormalized: string | null;
  reason: string | null;
  state: NftCanonicalState;
  retainsSoftStakeEntitlement?: true;
};

export type NormalizedNftAsset = {
  assetId: string;
  tokenId: string | null;
  network: NftAssetNetwork;
  ownerWallet: string | null;
  ownerNormalized: string | null;
  rarity: NftAssetRarity;
  generation: NftAssetGeneration;
  canonicalState: NftCanonicalState;
  blockers: NftInventoryBlocker[];
  activeLocks: NftAssetActiveLock[];
  sourceRefs: NftAssetSourceRef[];
};

export type CukiesInventoryDocument = {
  _id?: unknown;
  tokenId?: unknown;
  owner?: unknown;
  user?: unknown;
  wallet?: unknown;
  ownerNormalized?: unknown;
  network?: unknown;
  state?: unknown;
  type?: unknown;
  rarity?: unknown;
  origin?: unknown;
  birthNetwork?: unknown;
  generation?: unknown;
  skills?: unknown;
  metadata?: unknown;
  attributes?: unknown;
  img?: unknown;
  timeStamp?: unknown;
  updatedAt?: unknown;
  /** Ultimo evento que cambio la tenencia, no el ultimo cambio de estado/listing. */
  ownershipEventId?: unknown;
};

export type NftAssetLockDocument = {
  _id?: unknown;
  assetId?: unknown;
  status?: unknown;
  reason?: unknown;
  lockReason?: unknown;
  type?: unknown;
  ownerNormalized?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  expiresAt?: unknown;
  retainsSoftStakeEntitlement?: unknown;
};

export type CukieMasterEligibleNftAsset = NormalizedNftAsset & {
  rarityPoints: number;
};

export type RejectedCukieMasterNftAsset = {
  asset: NormalizedNftAsset;
  blockers: NftInventoryBlocker[];
};

export type CukieMasterNftRouteSummary = {
  walletAddress: string;
  walletNormalized: string;
  originalCukiePoints: number;
  nftAssetIds: string[];
  eligibleAssets: CukieMasterEligibleNftAsset[];
  rejectedAssets: RejectedCukieMasterNftAsset[];
  slotPreview: ReturnType<typeof calculateCukieMasterSlots>;
};

type AttributeLike = {
  trait_type?: unknown;
  traitType?: unknown;
  key?: unknown;
  name?: unknown;
  value?: unknown;
};

const STATE_PRECEDENCE: NftCanonicalState[] = [
  'invalidated',
  'unknown',
  'bridging',
  'assigned_to_game',
  'listed',
  'in_pool',
  'soft_staked',
  'available',
];

const STATE_BLOCKERS: Partial<Record<NftCanonicalState, NftInventoryBlocker>> = {
  listed: 'listed',
  bridging: 'bridging',
  in_pool: 'in_pool',
  assigned_to_game: 'assigned_to_game',
  invalidated: 'invalidated',
  unknown: 'unknown_state',
};

const RARITY_POINTS = CUKIE_MASTER_ORIGINAL_RARITY_POINTS as Record<
  Exclude<NftAssetRarity, 'unknown'>,
  number
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toStringOrNull(value: unknown) {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'bigint') return String(value);
  return null;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeKey(value: unknown) {
  const text = toStringOrNull(value);
  if (!text) return '';

  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKey(value: unknown) {
  return normalizeKey(value).replace(/\s+/g, '');
}

function normalizeObservedAt(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();

  const numeric = toNumberOrNull(value);
  if (numeric !== null) {
    const timestampMs = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    const date = new Date(timestampMs);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const text = toStringOrNull(value);
  if (!text) return null;

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function uniqueBlockers(blockers: NftInventoryBlocker[]) {
  return Array.from(new Set(blockers));
}

export function normalizeNftNetwork(value: unknown): NftAssetNetwork {
  const key = compactKey(value);

  if (['bsc', 'bnb', 'binance', 'binancesmartchain', 'smartchain'].includes(key)) {
    return 'bsc';
  }

  if (['tron', 'trx'].includes(key)) {
    return 'tron';
  }

  return 'unknown';
}

export function normalizeOwnerForNetwork(
  walletAddress: string | null,
  network: NftAssetNetwork,
) {
  if (!walletAddress) return null;
  if (network === 'tron') return walletAddress.toUpperCase();
  return normalizeWalletAddress(walletAddress);
}

function rarityFromValue(value: unknown): NftAssetRarity {
  const numeric = toNumberOrNull(value);
  if (numeric !== null) {
    if (numeric <= 1) return 'common';
    if (numeric === 2) return 'uncommon';
    if (numeric === 3) return 'rare';
    if (numeric === 4) return 'epic';
    if (numeric === 5) return 'legendary';
    if (numeric >= 6) return 'goat';
  }

  const key = compactKey(value);
  if (!key) return 'unknown';

  if (['uncommon', 'nocomun', 'nocommon', 'nocumun', 'infrecuente'].includes(key)) {
    return 'uncommon';
  }

  if (['common', 'comun', 'cumun', 'normal'].includes(key)) {
    return 'common';
  }

  if (['rare', 'raro', 'rara'].includes(key)) {
    return 'rare';
  }

  if (['epic', 'epico', 'epica'].includes(key)) {
    return 'epic';
  }

  if (['legendary', 'legendario', 'legendaria'].includes(key)) {
    return 'legendary';
  }

  if (key === 'goat') {
    return 'goat';
  }

  return 'unknown';
}

function attributeValues(attributes: unknown, wantedKeys: string[]) {
  const values: unknown[] = [];

  if (Array.isArray(attributes)) {
    for (const item of attributes) {
      const attribute = asRecord(item) as AttributeLike | null;
      if (!attribute) continue;

      const key = normalizeKey(
        attribute.trait_type ?? attribute.traitType ?? attribute.key ?? attribute.name,
      );
      if (wantedKeys.includes(key)) {
        values.push(attribute.value);
      }
    }

    return values;
  }

  const record = asRecord(attributes);
  if (!record) return values;

  for (const [key, value] of Object.entries(record)) {
    if (wantedKeys.includes(normalizeKey(key))) {
      values.push(value);
    }
  }

  return values;
}

export function resolveNftRarity(document: CukiesInventoryDocument): NftAssetRarity {
  const metadata = asRecord(document.metadata);
  const candidates = [
    document.rarity,
    document.type,
    metadata?.rarity,
    ...attributeValues(metadata?.attributes, ['rarity', 'rareza', 'type', 'tipo']),
    ...attributeValues(document.attributes, ['rarity', 'rareza', 'type', 'tipo']),
  ];

  for (const candidate of candidates) {
    const rarity = rarityFromValue(candidate);
    if (rarity !== 'unknown') return rarity;
  }

  return 'unknown';
}

function generationFromValue(value: unknown) {
  const numeric = toNumberOrNull(value);
  if (numeric !== null) {
    if (numeric <= 1) return 'original' satisfies NftAssetGeneration;
    if (numeric >= 2) return 'second_generation' satisfies NftAssetGeneration;
  }

  const key = compactKey(value);
  if (!key) return 'unknown' satisfies NftAssetGeneration;

  if (
    ['breed', 'breeding', 'bred', 'second', 'secondgeneration', 'segundageneracion'].includes(key)
  ) {
    return 'second_generation' satisfies NftAssetGeneration;
  }

  if (
    [
      'original',
      'first',
      'firstgeneration',
      'primerageneracion',
      'genesis',
      'mint',
    ].includes(key)
  ) {
    return 'original' satisfies NftAssetGeneration;
  }

  return 'unknown' satisfies NftAssetGeneration;
}

export function resolveNftGeneration(document: CukiesInventoryDocument): NftAssetGeneration {
  const skills = asRecord(document.skills);
  const metadata = asRecord(document.metadata);
  const candidates = [
    document.origin,
    document.birthNetwork,
    document.generation,
    skills?.generation,
    metadata?.generation,
  ];

  let sawOriginal = false;

  for (const candidate of candidates) {
    const generation = generationFromValue(candidate);
    if (generation === 'second_generation') return generation;
    if (generation === 'original') sawOriginal = true;
  }

  return sawOriginal ? 'original' : 'unknown';
}

function normalizeSourceState(value: unknown): NftCanonicalState {
  const key = compactKey(value);
  if (!key) return 'unknown';

  if (['available', 'free', 'owned'].includes(key)) return 'available';
  if (['onsale', 'listed', 'forsale', 'sale'].includes(key)) return 'listed';
  if (['inbridge', 'bridging', 'bridge', 'bridgepending', 'jumpinbridge'].includes(key)) {
    return 'bridging';
  }
  if (['invalidated', 'invalid', 'burned', 'burnt', 'deleted'].includes(key)) {
    return 'invalidated';
  }
  if (['unknown', 'stale', 'reconciliation'].includes(key)) return 'unknown';

  return 'unknown';
}

function isActiveLock(lock: NftAssetLockDocument, now: Date) {
  const status = normalizeKey(lock.status);
  if (status && status !== 'active') return false;

  const expiresAt = lock.expiresAt instanceof Date
    ? lock.expiresAt
    : toStringOrNull(lock.expiresAt)
      ? new Date(String(lock.expiresAt))
      : null;

  return !expiresAt || (
    !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() > now.getTime()
  );
}

function normalizeLockState(lock: NftAssetLockDocument): NftCanonicalState {
  const reason = compactKey(lock.reason ?? lock.lockReason ?? lock.type);

  if (reason === 'softstake') return 'soft_staked';
  if (reason === 'pooldeposit') return 'in_pool';
  if (reason === 'gameassignment') return 'assigned_to_game';
  if (reason === 'opshold') return 'invalidated';
  if (reason === 'reconciliation') return 'unknown';

  return 'unknown';
}

function normalizeActiveLock(lock: NftAssetLockDocument): NftAssetActiveLock {
  return {
    lockId: toStringOrNull(lock._id),
    assetId: toStringOrNull(lock.assetId),
    ownerNormalized: toStringOrNull(lock.ownerNormalized),
    reason: toStringOrNull(lock.reason ?? lock.lockReason ?? lock.type),
    state: normalizeLockState(lock),
    ...(lock.retainsSoftStakeEntitlement === true
      ? { retainsSoftStakeEntitlement: true as const }
      : {}),
  };
}

function highestPrecedenceState(states: NftCanonicalState[]) {
  for (const state of STATE_PRECEDENCE) {
    if (states.includes(state)) return state;
  }

  return 'unknown';
}

export function resolveNftCanonicalState(
  document: Pick<CukiesInventoryDocument, 'state'>,
  locks: NftAssetLockDocument[] = [],
  now = new Date(),
): NftCanonicalState {
  const states: NftCanonicalState[] = [normalizeSourceState(document.state)];

  for (const lock of locks) {
    if (isActiveLock(lock, now)) {
      states.push(normalizeLockState(lock));
    }
  }

  return highestPrecedenceState(states);
}

export function buildCukiesAssetId(document: CukiesInventoryDocument) {
  const documentId = toStringOrNull(document._id);
  if (documentId) return `cukies:${documentId}`;

  const tokenId = toStringOrNull(document.tokenId);
  const network = normalizeNftNetwork(document.network);
  if (tokenId) return `cukies:${network}:${tokenId}`;

  return 'cukies:unknown';
}

export function normalizeCukiesInventoryDocument(
  document: CukiesInventoryDocument,
  locks: NftAssetLockDocument[] = [],
  now = new Date(),
): NormalizedNftAsset {
  const network = normalizeNftNetwork(document.network);
  const tokenId = toStringOrNull(document.tokenId) ?? toStringOrNull(document._id);
  const ownerWallet = toStringOrNull(document.owner)
    ?? toStringOrNull(document.user)
    ?? toStringOrNull(document.wallet);
  const ownerNormalized = toStringOrNull(document.ownerNormalized)
    ?? normalizeOwnerForNetwork(ownerWallet, network);
  const rarity = resolveNftRarity(document);
  const generation = resolveNftGeneration(document);
  const canonicalState = resolveNftCanonicalState(document, locks, now);
  const sourceDocumentId = toStringOrNull(document._id);
  const activeLockDocuments = locks.filter((lock) => isActiveLock(lock, now));
  const activeLocks = activeLockDocuments.map(normalizeActiveLock);
  const blockers: NftInventoryBlocker[] = [];

  if (!sourceDocumentId && !tokenId) blockers.push('asset_not_found');
  if (!tokenId) blockers.push('missing_token_id');
  if (!ownerWallet || !ownerNormalized) blockers.push('unknown_owner');
  if (network === 'unknown') blockers.push('unknown_network');
  if (rarity === 'unknown') blockers.push('missing_rarity');
  if (generation === 'unknown') blockers.push('missing_generation');

  const stateBlocker = STATE_BLOCKERS[canonicalState];
  if (stateBlocker) blockers.push(stateBlocker);

  return {
    assetId: buildCukiesAssetId(document),
    tokenId,
    network,
    ownerWallet,
    ownerNormalized,
    rarity,
    generation,
    canonicalState,
    blockers: uniqueBlockers(blockers),
    activeLocks,
    sourceRefs: [
      {
        source: 'cukies',
        collection: 'cukies',
        documentId: sourceDocumentId,
        tokenId,
        observedAt: normalizeObservedAt(document.timeStamp ?? document.updatedAt),
      },
      ...activeLockDocuments.map((lock) => ({
        source: 'nft_asset_locks' as const,
        collection: 'nft_asset_locks',
        documentId: toStringOrNull(lock._id),
        observedAt: normalizeObservedAt(lock.updatedAt ?? lock.createdAt),
      })),
    ],
  };
}

function rarityPoints(rarity: NftAssetRarity) {
  if (rarity === 'unknown') return null;
  return RARITY_POINTS[rarity] ?? null;
}

function ownerMatches(asset: NormalizedNftAsset, walletNormalized: string) {
  if (!asset.ownerNormalized) return false;
  if (asset.network === 'tron') {
    return asset.ownerNormalized.toUpperCase() === walletNormalized.toUpperCase();
  }

  return asset.ownerNormalized.toLowerCase() === walletNormalized.toLowerCase();
}

function blockersForCukieMasterAsset(
  asset: NormalizedNftAsset,
  walletNormalized: string,
  options: { requireSoftStake?: boolean } = {},
): NftInventoryBlocker[] {
  const retainedSoftStakeLocks = asset.activeLocks.filter((lock) => (
    lock.reason === 'game_assignment'
    && lock.state === 'assigned_to_game'
    && lock.retainsSoftStakeEntitlement === true
    && lock.ownerNormalized?.toLowerCase() === walletNormalized.toLowerCase()
  ));
  const hasRetainedSoftStake = retainedSoftStakeLocks.length === 1
    && asset.activeLocks.length === 1;
  const blockers = asset.blockers.filter((blocker) => (
    blocker !== 'assigned_to_game' || !hasRetainedSoftStake
  ));

  if (!ownerMatches(asset, walletNormalized)) {
    blockers.push(asset.ownerNormalized ? 'owner_mismatch' : 'unknown_owner');
  }

  if (asset.network !== 'bsc') {
    blockers.push(asset.network === 'unknown' ? 'unknown_network' : 'unsupported_network');
  }

  if (asset.generation !== 'original') {
    blockers.push(asset.generation === 'second_generation' ? 'second_generation' : 'missing_generation');
  }

  if (asset.rarity === 'unknown') {
    blockers.push('missing_rarity');
  }

  if (!['available', 'soft_staked'].includes(asset.canonicalState) && !hasRetainedSoftStake) {
    const stateBlocker = STATE_BLOCKERS[asset.canonicalState] ?? 'already_locked';
    blockers.push(stateBlocker);
  }

  const softStakeLocks = asset.activeLocks.filter((lock) => (
    lock.state === 'soft_staked' && lock.reason === 'soft_stake'
  ));
  const hasCompatibleSoftStake = softStakeLocks.some((lock) => (
      Boolean(lock.ownerNormalized)
        && lock.ownerNormalized?.toLowerCase() === walletNormalized.toLowerCase()
  ));

  if (asset.canonicalState === 'soft_staked') {

    if (!hasCompatibleSoftStake) {
      blockers.push('already_locked');
    }
  }

  if (options.requireSoftStake && !hasCompatibleSoftStake && !hasRetainedSoftStake) {
    blockers.push('soft_stake_required');
  }

  return uniqueBlockers(blockers);
}

function summarizeCukieMasterNftRouteWithMode(input: {
  walletAddress: string;
  eligibleUki?: number;
  assets: NormalizedNftAsset[];
  requireSoftStake: boolean;
}): CukieMasterNftRouteSummary {
  const walletNormalized = normalizeWalletAddress(input.walletAddress);
  const eligibleAssets: CukieMasterEligibleNftAsset[] = [];
  const rejectedAssets: RejectedCukieMasterNftAsset[] = [];

  for (const asset of [...input.assets].sort((left, right) => (
    left.assetId.localeCompare(right.assetId)
  ))) {
    const blockers = blockersForCukieMasterAsset(asset, walletNormalized, {
      requireSoftStake: input.requireSoftStake,
    });
    const points = rarityPoints(asset.rarity);

    if (blockers.length === 0 && points !== null) {
      eligibleAssets.push({ ...asset, rarityPoints: points });
    } else {
      rejectedAssets.push({ asset, blockers });
    }
  }

  const originalCukiePoints = eligibleAssets.reduce(
    (total, asset) => total + asset.rarityPoints,
    0,
  );

  return {
    walletAddress: input.walletAddress,
    walletNormalized,
    originalCukiePoints,
    nftAssetIds: eligibleAssets.map((asset) => asset.assetId),
    eligibleAssets,
    rejectedAssets,
    slotPreview: calculateCukieMasterSlots({
      eligibleUki: input.eligibleUki ?? 0,
      originalCukiePoints,
    }),
  };
}

export function summarizeCukieMasterNftRoute(input: {
  walletAddress: string;
  eligibleUki?: number;
  assets: NormalizedNftAsset[];
}): CukieMasterNftRouteSummary {
  return summarizeCukieMasterNftRouteWithMode({ ...input, requireSoftStake: false });
}

export function summarizeCukieMasterNftEntitlement(input: {
  walletAddress: string;
  eligibleUki?: number;
  assets: NormalizedNftAsset[];
}): CukieMasterNftRouteSummary {
  return summarizeCukieMasterNftRouteWithMode({ ...input, requireSoftStake: true });
}

export function walletLookupCandidates(walletAddress: string) {
  const trimmed = walletAddress.trim();
  return Array.from(new Set([
    normalizeWalletAddress(trimmed),
    trimmed.toLowerCase(),
    trimmed.toUpperCase(),
  ].filter(Boolean)));
}

async function resolveIndexerDb(db?: Db) {
  if (db) return db;
  const { getIndexerDb } = await import('@/lib/indexer-db/mongodb');
  return getIndexerDb();
}

function locksByAssetId(locks: NftAssetLockDocument[]) {
  return locks.reduce<Record<string, NftAssetLockDocument[]>>((grouped, lock) => {
    const assetId = toStringOrNull(lock.assetId);
    if (!assetId) return grouped;

    grouped[assetId] = grouped[assetId] ?? [];
    grouped[assetId].push(lock);
    return grouped;
  }, {});
}

export async function getCukieMasterNftRouteSummaryFromDb(input: {
  walletAddress: string;
  eligibleUki?: number;
  db?: Db;
  now?: Date;
  session?: ClientSession;
  requireSoftStake?: boolean;
}) {
  const database = await resolveIndexerDb(input.db);
  const ownerCandidates = walletLookupCandidates(input.walletAddress);
  const cukieDocuments = await database.collection<CukiesInventoryDocument>('cukies')
    .find({ ownerNormalized: { $in: ownerCandidates } }, { session: input.session })
    .toArray();
  const firstPassAssets = cukieDocuments.map((document) => normalizeCukiesInventoryDocument(
    document,
    [],
    input.now,
  ));
  const assetIds = firstPassAssets.map((asset) => asset.assetId);
  const lockDocuments = assetIds.length > 0
    ? await database.collection<NftAssetLockDocument>('nft_asset_locks')
      .find(
        { assetId: { $in: assetIds }, status: 'active' },
        { session: input.session },
      )
      .toArray()
    : [];
  const locks = locksByAssetId(lockDocuments);
  const assets = cukieDocuments.map((document) => {
    const assetId = buildCukiesAssetId(document);
    return normalizeCukiesInventoryDocument(document, locks[assetId] ?? [], input.now);
  });

  const summarize = input.requireSoftStake
    ? summarizeCukieMasterNftEntitlement
    : summarizeCukieMasterNftRoute;

  return summarize({
    walletAddress: input.walletAddress,
    eligibleUki: input.eligibleUki,
    assets,
  });
}

export function getCukieMasterNftEntitlementFromDb(input: {
  walletAddress: string;
  eligibleUki?: number;
  db?: Db;
  now?: Date;
  session?: ClientSession;
}) {
  return getCukieMasterNftRouteSummaryFromDb({ ...input, requireSoftStake: true });
}
