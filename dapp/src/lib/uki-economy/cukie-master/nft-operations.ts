import 'server-only';

import type { ClientSession, Db } from 'mongodb';

import {
  buildCukiesAssetId,
  getCukieMasterNftRouteSummaryFromDb,
  normalizeCukiesInventoryDocument,
  summarizeCukieMasterNftRoute,
  walletLookupCandidates,
  type CukiesInventoryDocument,
  type NftInventoryBlocker,
  type NormalizedNftAsset,
} from '@/lib/nft-inventory';
import { createMongoNftAssetLockRepository } from '@/lib/nft-inventory/lock-repository';
import { createNftAssetLockService } from '@/lib/nft-inventory/locks';
import type { NftAssetLockDocument } from '@/lib/nft-inventory/lock-types';
import { getLegacyMarketplaceNftImageUrl } from '@/lib/legacy-marketplace/config';
import {
  ukiNftVaults,
  type UkiNftVaultMode,
  type UkiNftVaultPublicConfig,
} from '@/lib/contracts/uki-nft-vaults';
import { normalizeWalletAddress } from '@/lib/wallet-address';

import {
  DomainConflictError,
  DomainNotFoundError,
  DomainValidationError,
  SchemaNotReadyError,
} from '../errors';
import { CUKIE_MASTER_ORIGINAL_RARITY_POINTS } from '../rules';
import { listCanonicalCukieMasterNftPositions } from './nft-vault-source';
import { createMongoCukieMasterRepository } from './repository';
import { createCukieMasterService } from './service';

export type CukieMasterNftOperation = 'soft_stake' | 'unstake';

export type CukieMasterNftInventoryItem = {
  assetId: string;
  canonicalAssetId: string | null;
  collectionAddress: string | null;
  tokenId: string | null;
  imageUrl: string | null;
  rarity: string;
  rarityPoints: number | null;
  contributesToCukieMaster: boolean;
  contributionPoints: number;
  state: string;
  custody: 'wallet' | 'cukie_master_nft_vault';
  custodyMode: UkiNftVaultMode;
  depositEpoch: string | null;
  blockers: NftInventoryBlocker[];
  lock: null | { lockId: string; fencingToken: number };
  canDeposit: boolean;
  canWithdraw: boolean;
  canSoftStake: boolean;
  canUnstake: boolean;
};

export type CukieMasterNftOperationInput = {
  walletAddress: string;
  operation: CukieMasterNftOperation;
  assetId: string;
  lockId?: string;
  expectedFencingToken?: number;
  idempotencyKey: string;
  now?: Date;
};

type CustodialCukiesInventoryDocument = CukiesInventoryDocument & {
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
};

type OpenNftVaultPositionDocument = {
  assetId?: unknown;
  lifecycleOpen?: unknown;
};

type CustodialInventoryConfig = {
  chainId: 56 | 97;
  collectionAddresses: string[];
};

type CanonicalCustodialCandidate = {
  document: CustodialCukiesInventoryDocument;
  assetId: string;
  collectionAddress: string;
  tokenId: string;
  lockAssetIds: string[];
};

const MAX_CUSTODIAL_INVENTORY_ROWS = 1_000;
const BSC_ADDRESS = /^0x[0-9a-f]{40}$/;
const BSC_ZERO_ADDRESS = /^0x0{40}$/;
const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

function pointsForRarity(rarity: string) {
  return Object.prototype.hasOwnProperty.call(CUKIE_MASTER_ORIGINAL_RARITY_POINTS, rarity)
    ? CUKIE_MASTER_ORIGINAL_RARITY_POINTS[
      rarity as keyof typeof CUKIE_MASTER_ORIGINAL_RARITY_POINTS
    ]
    : null;
}

function requiredText(value: unknown, label: string, maximum = 256) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum) {
    throw new DomainValidationError(`${label} no es valido.`);
  }
  return value.trim();
}

function validTimestamp(value = new Date()) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainValidationError('now debe ser una fecha valida.');
  }
  return new Date(value.getTime());
}

async function inventoryFromDb(
  db: Db,
  walletAddress: string,
  now: Date,
  session?: ClientSession,
): Promise<CukieMasterNftInventoryItem[]> {
  const summary = await getCukieMasterNftRouteSummaryFromDb({
    walletAddress,
    now,
    db,
    session,
    requireSoftStake: false,
  });
  const normalized = [
    ...summary.eligibleAssets.map((asset) => ({
      asset,
      rarityPoints: asset.rarityPoints,
      blockers: [] as NftInventoryBlocker[],
    })),
    ...summary.rejectedAssets.map(({ asset, blockers }) => ({
      asset,
      rarityPoints: null,
      blockers,
    })),
  ];
  const assetIds = normalized.map(({ asset }) => asset.assetId);
  const locks = assetIds.length === 0 ? [] : await db
    .collection<NftAssetLockDocument>('nft_asset_locks')
    .find({ assetId: { $in: assetIds }, status: 'active' }, { session })
    .toArray();
  const activeByAsset = new Map(locks.map((lock) => [lock.assetId, lock]));
  return normalized
    .map(({ asset, rarityPoints, blockers }) => {
      const lock = activeByAsset.get(asset.assetId);
      const compatible = lock?.reason === 'soft_stake'
        && lock.ownerNormalized === summary.walletNormalized;
      const retainedGameEntitlement = lock?.reason === 'game_assignment'
        && lock.ownerNormalized === summary.walletNormalized
        && lock.retainsSoftStakeEntitlement === true;
      const contributesToCukieMaster = compatible || retainedGameEntitlement;
      const potentialPoints = rarityPoints ?? pointsForRarity(asset.rarity);
      return {
        assetId: asset.assetId,
        canonicalAssetId: null,
        collectionAddress: null,
        tokenId: asset.tokenId,
        imageUrl: asset.tokenId ? getLegacyMarketplaceNftImageUrl(asset.tokenId) : null,
        rarity: asset.rarity,
        rarityPoints: potentialPoints,
        contributesToCukieMaster,
        contributionPoints: contributesToCukieMaster ? potentialPoints ?? 0 : 0,
        state: asset.canonicalState,
        custody: 'wallet',
        custodyMode: 'legacy',
        depositEpoch: null,
        blockers,
        lock: compatible && lock
          ? { lockId: lock.lockId, fencingToken: lock.fencingToken }
          : null,
        canDeposit: false,
        canWithdraw: false,
        canSoftStake: asset.canonicalState === 'available' && blockers.length === 0,
        canUnstake: asset.canonicalState === 'soft_staked' && compatible,
      } satisfies CukieMasterNftInventoryItem;
    })
    .sort((left, right) => left.assetId.localeCompare(right.assetId));
}

function custodialInventoryConfig(
  config: UkiNftVaultPublicConfig,
): CustodialInventoryConfig {
  if (
    config.mode.cukieMaster !== 'custodial'
    || (config.chainId !== 56 && config.chainId !== 97)
    || !config.cukieMasterNftVaultAddress
    || config.collectionAddresses.length === 0
  ) {
    throw new SchemaNotReadyError('La configuracion custodial NFT no esta completa.');
  }
  const collectionAddresses = config.collectionAddresses.map((value) => value.toLowerCase());
  if (
    collectionAddresses.some((value) => !BSC_ADDRESS.test(value) || BSC_ZERO_ADDRESS.test(value))
    || new Set(collectionAddresses).size !== collectionAddresses.length
  ) {
    throw new SchemaNotReadyError('Las colecciones custodiales NFT no son canonicas.');
  }
  return { chainId: config.chainId, collectionAddresses };
}

function exactTokenId(value: unknown) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) return null;
  if (typeof value === 'bigint' && value < BigInt(0)) return null;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') return null;
  const tokenId = String(value);
  return CANONICAL_DECIMAL.test(tokenId) && BigInt(tokenId) <= MAX_UINT256 ? tokenId : null;
}

function tokenIdQueryCandidates(tokenId: string) {
  const numeric = Number(tokenId);
  return Number.isSafeInteger(numeric) && String(numeric) === tokenId
    ? [tokenId, numeric]
    : [tokenId];
}

function canonicalCustodialCandidate(
  document: CustodialCukiesInventoryDocument,
  config: CustodialInventoryConfig,
): CanonicalCustodialCandidate | null {
  const collectionAddress = typeof document.collectionAddressNormalized === 'string'
    ? document.collectionAddressNormalized.trim()
    : '';
  const tokenId = exactTokenId(document.tokenId);
  if (
    document.chainId !== config.chainId
    || !BSC_ADDRESS.test(collectionAddress)
    || BSC_ZERO_ADDRESS.test(collectionAddress)
    || document.collectionAddressNormalized !== collectionAddress
    || collectionAddress !== collectionAddress.toLowerCase()
    || !config.collectionAddresses.includes(collectionAddress)
    || tokenId === null
  ) return null;
  const assetId = `${config.chainId}:${collectionAddress}:${tokenId}`;
  return {
    document,
    assetId,
    collectionAddress,
    tokenId,
    lockAssetIds: [...new Set([assetId, buildCukiesAssetId(document)])],
  };
}

export function buildCukieMasterCustodialDepositInventory(input: {
  walletAddress: string;
  now: Date;
  documents: CustodialCukiesInventoryDocument[];
  locks: NftAssetLockDocument[];
  openVaultPositions: OpenNftVaultPositionDocument[];
  config: UkiNftVaultPublicConfig;
}) {
  const config = custodialInventoryConfig(input.config);
  const grouped = new Map<string, CanonicalCustodialCandidate[]>();
  for (const document of input.documents) {
    const candidate = canonicalCustodialCandidate(document, config);
    if (!candidate) continue;
    const group = grouped.get(candidate.assetId) ?? [];
    group.push(candidate);
    grouped.set(candidate.assetId, group);
  }
  const openAssetIds = new Set(input.openVaultPositions.flatMap((position) => (
    position.lifecycleOpen === true && typeof position.assetId === 'string'
      ? [position.assetId]
      : []
  )));
  const activeLockAssetIds = new Set(input.locks.flatMap((lock) => (
    lock.status === 'active' && typeof lock.assetId === 'string' ? [lock.assetId] : []
  )));
  const candidates = [...grouped.values()].flatMap((matches) => {
    if (matches.length !== 1) return [];
    const candidate = matches[0];
    if (
      openAssetIds.has(candidate.assetId)
      || candidate.lockAssetIds.some((assetId) => activeLockAssetIds.has(assetId))
    ) return [];
    return [candidate];
  });
  const assets = candidates.map((candidate) => ({
    ...normalizeCukiesInventoryDocument(candidate.document, [], input.now),
    assetId: candidate.assetId,
    tokenId: candidate.tokenId,
  } satisfies NormalizedNftAsset));
  const summary = summarizeCukieMasterNftRoute({
    walletAddress: input.walletAddress,
    assets,
  });
  const walletNormalized = normalizeWalletAddress(input.walletAddress).toLowerCase();
  const assetsByAssetId = new Map(assets.map((asset) => [asset.assetId, asset]));
  const eligibleByAssetId = new Map(summary.eligibleAssets.map((asset) => [asset.assetId, asset]));
  const rejectedByAssetId = new Map(summary.rejectedAssets.map((item) => [
    item.asset.assetId,
    item,
  ]));
  return candidates.map((candidate) => {
    const normalizedAsset = assetsByAssetId.get(candidate.assetId);
    const ownerIdentityValid = Boolean(
      normalizedAsset?.ownerNormalized
      && normalizedAsset.ownerNormalized.toLowerCase() === walletNormalized
      && normalizedAsset.ownerWallet
      && normalizeWalletAddress(normalizedAsset.ownerWallet).toLowerCase() === walletNormalized
    );
    const metadataBlockers: NftInventoryBlocker[] = [
      ...(candidate.document.generation === 1
        ? []
        : [candidate.document.generation === 2
            ? 'second_generation' as const
            : 'missing_generation' as const]),
      ...(typeof candidate.document.rarity === 'number'
        && Number.isInteger(candidate.document.rarity)
        && candidate.document.rarity >= 1
        && candidate.document.rarity <= 6
        ? []
        : ['missing_rarity' as const]),
    ];
    const eligible = ownerIdentityValid && metadataBlockers.length === 0
      ? eligibleByAssetId.get(candidate.assetId)
      : undefined;
    const rejected = rejectedByAssetId.get(candidate.assetId);
    const asset = eligible ?? rejected?.asset ?? normalizedAsset;
    if (!asset) {
      throw new SchemaNotReadyError(`No se pudo normalizar ${candidate.assetId}.`);
    }
    const blockers = [...new Set<NftInventoryBlocker>([
      ...(rejected?.blockers ?? []),
      ...(!ownerIdentityValid
        ? [normalizedAsset?.ownerWallet ? 'owner_mismatch' : 'unknown_owner'] as const
        : []),
      ...metadataBlockers,
    ])];
    return {
      assetId: candidate.assetId,
      canonicalAssetId: candidate.assetId,
      collectionAddress: candidate.collectionAddress,
      tokenId: candidate.tokenId,
      imageUrl: getLegacyMarketplaceNftImageUrl(candidate.tokenId),
      rarity: asset.rarity,
      rarityPoints: eligible?.rarityPoints ?? null,
      contributesToCukieMaster: false,
      contributionPoints: 0,
      state: asset.canonicalState,
      custody: 'wallet' as const,
      custodyMode: 'custodial' as const,
      depositEpoch: null,
      blockers,
      lock: null,
      canDeposit: Boolean(
        eligible
        && asset.generation === 'original'
        && asset.canonicalState === 'available'
      ),
      canWithdraw: false,
      canSoftStake: false,
      canUnstake: false,
    } satisfies CukieMasterNftInventoryItem;
  }).sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export async function custodialInventoryFromDb(
  db: Db,
  walletAddress: string,
  now: Date,
  session?: ClientSession,
  publicConfig: UkiNftVaultPublicConfig = ukiNftVaults,
): Promise<CukieMasterNftInventoryItem[]> {
  const config = custodialInventoryConfig(publicConfig);
  const positions = await listCanonicalCukieMasterNftPositions({
    db,
    walletAddress,
    now,
    session,
    config: publicConfig,
  });
  const custodied = positions.map((position) => {
    const rarityPoints = position.asset.rarity === 'unknown'
      ? null
      : CUKIE_MASTER_ORIGINAL_RARITY_POINTS[position.asset.rarity];
    return {
      assetId: position.assetId,
      canonicalAssetId: position.assetId,
      collectionAddress: position.collectionAddress,
      tokenId: position.tokenId,
      imageUrl: getLegacyMarketplaceNftImageUrl(position.tokenId),
      rarity: position.asset.rarity,
      rarityPoints,
      contributesToCukieMaster: rarityPoints !== null,
      contributionPoints: rarityPoints ?? 0,
      state: 'custodied',
      custody: 'cukie_master_nft_vault' as const,
      custodyMode: 'custodial' as const,
      depositEpoch: position.depositEpoch,
      blockers: position.asset.blockers,
      lock: null,
      canDeposit: false,
      canWithdraw: true,
      canSoftStake: false,
      canUnstake: false,
    } satisfies CukieMasterNftInventoryItem;
  });
  const walletDocuments = await db.collection<CustodialCukiesInventoryDocument>('cukies').find({
    ownerNormalized: { $in: walletLookupCandidates(walletAddress) },
    chainId: config.chainId,
    collectionAddressNormalized: { $in: config.collectionAddresses },
  }, { session }).limit(MAX_CUSTODIAL_INVENTORY_ROWS + 1).toArray();
  if (walletDocuments.length > MAX_CUSTODIAL_INVENTORY_ROWS) return custodied;
  const walletCandidates = walletDocuments.flatMap((document) => {
    const candidate = canonicalCustodialCandidate(document, config);
    return candidate ? [candidate] : [];
  });
  const identities = [...new Map(walletCandidates.map((candidate) => [
    candidate.assetId,
    candidate,
  ])).values()];
  if (identities.length === 0) return custodied;
  const documents = await db.collection<CustodialCukiesInventoryDocument>('cukies').find({
    $or: identities.map((candidate) => ({
      chainId: config.chainId,
      collectionAddressNormalized: candidate.collectionAddress,
      tokenId: { $in: tokenIdQueryCandidates(candidate.tokenId) },
    })),
  }, { session }).limit((MAX_CUSTODIAL_INVENTORY_ROWS * 2) + 1).toArray();
  if (documents.length > MAX_CUSTODIAL_INVENTORY_ROWS * 2) return custodied;
  const inspected = documents.flatMap((document) => {
    const candidate = canonicalCustodialCandidate(document, config);
    return candidate ? [candidate] : [];
  });
  const assetIds = [...new Set(inspected.map((candidate) => candidate.assetId))];
  const lockAssetIds = [...new Set(inspected.flatMap((candidate) => candidate.lockAssetIds))];
  const [masterPositions, poolPositions, locks] = assetIds.length === 0
    ? [[], [], []]
    : await Promise.all([
      db.collection<OpenNftVaultPositionDocument>('cukie_master_nft_positions').find({
        assetId: { $in: assetIds },
        lifecycleOpen: true,
      }, { session }).toArray(),
      db.collection<OpenNftVaultPositionDocument>('cukie_pool_nft_vault_positions').find({
        assetId: { $in: assetIds },
        lifecycleOpen: true,
      }, { session }).toArray(),
      db.collection<NftAssetLockDocument>('nft_asset_locks').find({
        assetId: { $in: lockAssetIds },
        status: 'active',
      }, { session }).toArray(),
    ]);
  const available = buildCukieMasterCustodialDepositInventory({
    walletAddress,
    now,
    documents,
    locks,
    openVaultPositions: [...masterPositions, ...poolPositions],
    config: publicConfig,
  });
  return [...available, ...custodied].sort((left, right) => (
    (left.canonicalAssetId ?? left.assetId).localeCompare(right.canonicalAssetId ?? right.assetId)
  ));
}

export async function getCukieMasterNftInventory(
  walletAddress: string,
  now = new Date(),
) {
  const wallet = requiredText(walletAddress, 'walletAddress', 80);
  const timestamp = validTimestamp(now);
  const { getEconomyDb } = await import('@/lib/indexer-db/mongodb');
  const db = await getEconomyDb();
  if (ukiNftVaults.mode.cukieMaster === 'invalid') {
    throw new SchemaNotReadyError('La configuracion del vault NFT de Cukie Master es invalida.');
  }
  return ukiNftVaults.mode.cukieMaster === 'custodial'
    ? custodialInventoryFromDb(db, wallet, timestamp)
    : inventoryFromDb(db, wallet, timestamp);
}

export async function mutateCukieMasterNft(input: CukieMasterNftOperationInput) {
  if (ukiNftVaults.mode.cukieMaster !== 'legacy') {
    if (ukiNftVaults.mode.cukieMaster === 'invalid') {
      throw new SchemaNotReadyError('La configuracion del vault NFT de Cukie Master es invalida.');
    }
    throw new DomainConflictError(
      'El staking NFT custodial solo se ejecuta directamente contra el contrato.',
    );
  }
  const walletAddress = requiredText(input.walletAddress, 'walletAddress', 80);
  const walletNormalized = normalizeWalletAddress(walletAddress);
  if (!walletNormalized) throw new DomainValidationError('walletAddress no se pudo normalizar.');
  const assetId = requiredText(input.assetId, 'assetId');
  const idempotencyKey = requiredText(input.idempotencyKey, 'idempotencyKey');
  if (idempotencyKey.startsWith('system:nft-lock:')) {
    throw new DomainValidationError('idempotencyKey usa un namespace reservado.');
  }
  const now = validTimestamp(input.now);
  if (input.operation !== 'soft_stake' && input.operation !== 'unstake') {
    throw new DomainValidationError('operation no es valida.');
  }

  const { withEconomyTransaction } = await import('@/lib/indexer-db/mongodb');
  return withEconomyTransaction(async (db, session) => {
    const inventory = await inventoryFromDb(db, walletAddress, now, session);
    const asset = inventory.find((item) => item.assetId === assetId);
    if (!asset) throw new DomainNotFoundError('El NFT no pertenece al inventario autenticado.');

    const lockRepository = createMongoNftAssetLockRepository(db, session);
    const lockService = createNftAssetLockService(async (work) => work(lockRepository));
    let lock: NftAssetLockDocument;

    if (input.operation === 'soft_stake') {
      const active = await lockRepository.findActiveLockByAssetId(assetId);
      const isReplay = active?.reason === 'soft_stake'
        && active.ownerNormalized === walletNormalized
        && active.idempotencyKey === idempotencyKey;
      if (!asset.canSoftStake && !isReplay) {
        throw new DomainConflictError('El NFT no esta disponible para soft-stake.');
      }
      lock = await lockService.acquireNftAssetLock({
        assetId,
        ownerNormalized: walletNormalized,
        reason: 'soft_stake',
        createdBy: `wallet:${walletNormalized}`,
        idempotencyKey,
        now,
      });
    } else {
      const lockId = requiredText(input.lockId, 'lockId');
      const expectedFencingToken = input.expectedFencingToken;
      if (!Number.isSafeInteger(expectedFencingToken) || (expectedFencingToken ?? 0) < 1) {
        throw new DomainValidationError('expectedFencingToken no es valido.');
      }
      const active = await lockRepository.findLockById(lockId);
      const prior = await lockRepository.findEventByIdempotencyKey(idempotencyKey);
      const isReplay = prior?.operation === 'release'
        && prior.resultingLock.assetId === assetId
        && prior.resultingLock.ownerNormalized === walletNormalized;
      if (!isReplay && (
        !asset.canUnstake
        || !active
        || active.assetId !== assetId
        || active.ownerNormalized !== walletNormalized
        || active.reason !== 'soft_stake'
      )) {
        throw new DomainConflictError('El soft-stake NFT no pertenece a la wallet autenticada.');
      }
      lock = await lockService.releaseNftAssetLock({
        lockId,
        expectedFencingToken: expectedFencingToken!,
        actor: `wallet:${walletNormalized}`,
        releaseReason: 'wallet_soft_unstake',
        idempotencyKey,
        now,
      });
    }

    const masterRepository = createMongoCukieMasterRepository(db, session);
    const masterService = createCukieMasterService(async (work) => work(masterRepository));
    const recalculation = await masterService.recalculateCukieMasterWallet(
      walletAddress,
      now,
      `nft-operation:${idempotencyKey}`,
    );
    return {
      operation: input.operation,
      assetId,
      lock: {
        lockId: lock.lockId,
        status: lock.status,
        fencingToken: lock.fencingToken,
      },
      nftPosition: recalculation.positions.nft,
    };
  });
}
