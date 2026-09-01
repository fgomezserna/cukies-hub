import 'server-only';

import type { Db, Filter } from 'mongodb';

import { ukiNftVaults, type UkiNftVaultPublicConfig } from '@/lib/contracts/uki-nft-vaults';
import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import { normalizeLegacyMarketplaceNftImageUrl } from '@/lib/legacy-marketplace/config';
import {
  buildCukiesAssetId,
  normalizeCukiesInventoryDocument,
  walletLookupCandidates,
  type CukiesInventoryDocument,
  type NftAssetLockDocument,
} from '@/lib/nft-inventory';
import { DomainValidationError, SchemaNotReadyError } from '@/lib/uki-economy/errors';
import { normalizeWalletAddress } from '@/lib/wallet-address';

import type {
  MyCukieCollectionData,
  MyCukieCollectionItem,
} from './my-collection-types';

const MAX_COLLECTION_ROWS = 500;
const DECIMAL_TOKEN_ID = /^(0|[1-9][0-9]*)$/;

type CanonicalCukieDocument = CukiesInventoryDocument & {
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
};

type OpenVaultPosition = {
  assetId?: unknown;
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
  tokenId?: unknown;
  beneficiaryNormalized?: unknown;
  lifecycle?: unknown;
  lifecycleOpen?: unknown;
  activationAt?: unknown;
  withdrawableAt?: unknown;
};

function requiredConfig(config: UkiNftVaultPublicConfig) {
  if (
    (config.chainId !== 56 && config.chainId !== 97)
    || config.collectionAddresses.length === 0
    || config.collectionConfigInvalid
  ) {
    throw new SchemaNotReadyError('La colección canónica de Cukies no está configurada.');
  }
  return {
    chainId: config.chainId,
    collections: config.collectionAddresses.map((address) => address.toLowerCase()),
  };
}

function tokenId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return null;
  }
  const normalized = String(value);
  return DECIMAL_TOKEN_ID.test(normalized) ? normalized : null;
}

function tokenIdCandidates(value: unknown) {
  const normalized = tokenId(value);
  if (!normalized) return [];
  const numeric = Number(normalized);
  return Number.isSafeInteger(numeric) && String(numeric) === normalized
    ? [normalized, numeric]
    : [normalized];
}

function positionIdentity(position: OpenVaultPosition, chainId: number, collections: string[]) {
  const collection = typeof position.collectionAddressNormalized === 'string'
    ? position.collectionAddressNormalized.toLowerCase()
    : null;
  const id = tokenId(position.tokenId);
  if (
    position.chainId !== chainId
    || !collection
    || !collections.includes(collection)
    || !id
    || position.lifecycleOpen !== true
  ) return null;
  const assetId = `${chainId}:${collection}:${id}`;
  return position.assetId === assetId ? assetId : null;
}

function timestampReached(value: unknown, now: Date) {
  if (typeof value !== 'string' || !DECIMAL_TOKEN_ID.test(value)) return false;
  return BigInt(value) <= BigInt(Math.floor(now.getTime() / 1_000));
}

function poolStatus(position: OpenVaultPosition, now: Date): MyCukieCollectionItem['poolStatus'] {
  if (position.lifecycle === 'pending_activation') {
    return timestampReached(position.activationAt, now) ? 'active' : 'pending';
  }
  if (position.lifecycle === 'active') return 'active';
  if (position.lifecycle === 'exit_requested') {
    return timestampReached(position.withdrawableAt, now) ? 'withdrawable' : 'exit_requested';
  }
  if (position.lifecycle === 'withdrawable') return 'withdrawable';
  return null;
}

function compareTokenIds(left: string, right: string) {
  const leftId = BigInt(left);
  const rightId = BigInt(right);
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export async function listMyCukieCollectionFromDb(input: {
  db: Db;
  walletAddress: string;
  now?: Date;
  config?: UkiNftVaultPublicConfig;
}): Promise<MyCukieCollectionData> {
  const walletNormalized = normalizeWalletAddress(input.walletAddress)?.toLowerCase() ?? null;
  if (!walletNormalized) throw new DomainValidationError('walletAddress no es una dirección EVM válida.');
  const now = input.now ?? new Date();
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new DomainValidationError('now no es una fecha válida.');
  }
  const { chainId, collections } = requiredConfig(input.config ?? ukiNftVaults);
  const positionFilter = {
    chainId,
    collectionAddressNormalized: { $in: collections },
    beneficiaryNormalized: walletNormalized,
    lifecycleOpen: true,
  };
  const [poolPositions, masterPositions] = await Promise.all([
    input.db.collection<OpenVaultPosition>('cukie_pool_nft_vault_positions')
      .find(positionFilter).limit(MAX_COLLECTION_ROWS + 1).toArray(),
    input.db.collection<OpenVaultPosition>('cukie_master_nft_positions')
      .find(positionFilter).limit(MAX_COLLECTION_ROWS + 1).toArray(),
  ]);
  if (poolPositions.length > MAX_COLLECTION_ROWS || masterPositions.length > MAX_COLLECTION_ROWS) {
    throw new SchemaNotReadyError('La colección supera el límite seguro de posiciones abiertas.');
  }

  const allPositions = [...poolPositions, ...masterPositions];
  const positionAssets = allPositions.flatMap((position) => {
    const assetId = positionIdentity(position, chainId, collections);
    return assetId ? [{ assetId, position }] : [];
  });
  if (positionAssets.length !== allPositions.length) {
    throw new SchemaNotReadyError('Hay una posición NFT abierta con identidad no canónica.');
  }
  const positionAssetIds = new Set(positionAssets.map(({ assetId }) => assetId));
  if (positionAssetIds.size !== positionAssets.length) {
    throw new SchemaNotReadyError('Un Cukie figura en más de una posición abierta.');
  }

  const positionClauses = positionAssets.map(({ position }) => ({
    chainId,
    collectionAddressNormalized: String(position.collectionAddressNormalized).toLowerCase(),
    tokenId: { $in: tokenIdCandidates(position.tokenId) },
  }));
  const ownerClause = {
    ownerNormalized: { $in: walletLookupCandidates(input.walletAddress) },
    chainId,
    collectionAddressNormalized: { $in: collections },
  };
  const inventoryFilter = (positionClauses.length > 0
    ? { $or: [ownerClause, ...positionClauses] }
    : ownerClause) as Filter<CanonicalCukieDocument>;
  const documents = await input.db.collection<CanonicalCukieDocument>('cukies')
    .find(inventoryFilter).sort({ collectionAddressNormalized: 1, tokenId: 1, _id: 1 })
    .limit(MAX_COLLECTION_ROWS + 1).toArray();
  if (documents.length > MAX_COLLECTION_ROWS) {
    throw new SchemaNotReadyError('La colección supera el límite seguro de Cukies.');
  }

  const canonical = documents.flatMap((document) => {
    const collection = typeof document.collectionAddressNormalized === 'string'
      ? document.collectionAddressNormalized.toLowerCase()
      : null;
    const id = tokenId(document.tokenId ?? document._id);
    if (document.chainId !== chainId || !collection || !collections.includes(collection) || !id) {
      return [];
    }
    return [{ document, collection, tokenId: id, assetId: `${chainId}:${collection}:${id}` }];
  });
  if (canonical.length !== documents.length) {
    throw new SchemaNotReadyError('El inventario contiene un Cukie sin identidad canónica.');
  }
  if (new Set(canonical.map(({ assetId }) => assetId)).size !== canonical.length) {
    throw new SchemaNotReadyError('El inventario contiene Cukies duplicados.');
  }
  const inventoryAssetIds = new Set(canonical.map(({ assetId }) => assetId));
  if ([...positionAssetIds].some((assetId) => !inventoryAssetIds.has(assetId))) {
    throw new SchemaNotReadyError('Falta la metadata de un Cukie depositado.');
  }

  const legacyAssetIds = canonical.map(({ document }) => buildCukiesAssetId(document));
  const locks = legacyAssetIds.length === 0 ? [] : await input.db
    .collection<NftAssetLockDocument>('nft_asset_locks')
    .find({ assetId: { $in: legacyAssetIds }, status: 'active' })
    .limit(MAX_COLLECTION_ROWS + 1).toArray();
  if (locks.length > MAX_COLLECTION_ROWS) {
    throw new SchemaNotReadyError('La colección supera el límite seguro de bloqueos activos.');
  }
  const locksByAsset = new Map<string, NftAssetLockDocument[]>();
  for (const lock of locks) {
    const assetId = String(lock.assetId);
    locksByAsset.set(assetId, [...(locksByAsset.get(assetId) ?? []), lock]);
  }
  const poolByAsset = new Map(positionAssets.slice(0, poolPositions.length)
    .map(({ assetId, position }) => [assetId, position]));
  const masterByAsset = new Map(positionAssets.slice(poolPositions.length)
    .map(({ assetId, position }) => [assetId, position]));

  const items = canonical.map(({ document, assetId, tokenId: id }) => {
    const normalized = normalizeCukiesInventoryDocument(
      document,
      locksByAsset.get(buildCukiesAssetId(document)) ?? [],
      now,
    );
    const pool = poolByAsset.get(assetId);
    const master = masterByAsset.get(assetId);
    return {
      assetId,
      tokenId: id,
      imageUrl: normalizeLegacyMarketplaceNftImageUrl(
        id,
        typeof document.img === 'string' ? document.img : null,
      ),
      generation: normalized.generation,
      rarity: normalized.rarity,
      state: master ? 'cukie_master' : pool ? 'in_pool' : normalized.canonicalState,
      custody: master ? 'cukie_master' : pool ? 'cukie_pool' : 'wallet',
      poolStatus: pool ? poolStatus(pool, now) : null,
    } satisfies MyCukieCollectionItem;
  }).sort((left, right) => compareTokenIds(left.tokenId, right.tokenId));

  const summary = {
    total: items.length,
    inWallet: items.filter((item) => item.custody === 'wallet').length,
    available: items.filter((item) => item.custody === 'wallet' && item.state === 'available').length,
    onSale: items.filter((item) => item.custody === 'wallet' && item.state === 'listed').length,
    inPool: items.filter((item) => item.custody === 'cukie_pool').length,
    inCukieMaster: items.filter((item) => item.custody === 'cukie_master').length,
    otherInUse: items.filter((item) => (
      item.custody === 'wallet' && !['available', 'listed'].includes(item.state)
    )).length,
  };
  return { walletNormalized, items, summary };
}

export async function listMyCukieCollection(walletAddress: string) {
  return listMyCukieCollectionFromDb({
    db: await getEconomyDb(),
    walletAddress,
  });
}
