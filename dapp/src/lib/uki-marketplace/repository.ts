import 'server-only';

import type { Collection } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import {
  normalizeCukiesInventoryDocument,
  type CukiesInventoryDocument,
} from '@/lib/nft-inventory';

import type {
  IndexedUkiMarketplaceOrder,
  UkiMarketplaceAssetIdentity,
  UkiMarketplaceAssetMetadata,
} from './types';

const CANONICAL_TOKEN_ID = /^(0|[1-9][0-9]*)$/;
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);
const MAX_METADATA_IDENTITIES = 200;

type InventoryDocumentWithCardImage = CukiesInventoryDocument & {
  /** URL inmutable escrita por cuki-card-worker (MinIO/S3). */
  cardImageUrl?: unknown;
};

function canonicalTokenId(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint') {
    return null;
  }
  const tokenId = String(value);
  if (!CANONICAL_TOKEN_ID.test(tokenId)) return null;
  try {
    return BigInt(tokenId) <= MAX_UINT256 ? tokenId : null;
  } catch {
    return null;
  }
}

function tokenIdQueryCandidates(tokenId: string) {
  const numeric = Number(tokenId);
  return Number.isSafeInteger(numeric) && String(numeric) === tokenId
    ? [tokenId, numeric]
    : [tokenId];
}

function canonicalCollection(value: unknown) {
  if (typeof value !== 'string') return null;
  const collection = value.trim().toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(collection) && !/^0x0{40}$/.test(collection)
    ? collection as `0x${string}`
    : null;
}

export function ukiMarketplaceAssetIdentityKey(input: UkiMarketplaceAssetIdentity) {
  return `${input.chainId}:${input.collectionAddress.toLowerCase()}:${input.tokenId}`;
}

function canonicalAssetIdentity(
  document: InventoryDocumentWithCardImage,
): UkiMarketplaceAssetIdentity | null {
  const chainId = document.chainId === 56 || document.chainId === 97
    ? document.chainId
    : null;
  const collectionAddress = canonicalCollection(document.collectionAddressNormalized);
  const tokenId = canonicalTokenId(document.tokenId);
  if (!chainId || !collectionAddress || !tokenId) return null;
  return { chainId, collectionAddress, tokenId };
}

export interface UkiMarketplaceRepository {
  listPublicCandidates(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    now: Date;
    limit: number;
    after?: { listedAt: Date; id: string };
    search?: string;
  }): Promise<IndexedUkiMarketplaceOrder[]>;
  listSellerOrders(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    sellerNormalized: `0x${string}`;
    limit: number;
  }): Promise<IndexedUkiMarketplaceOrder[]>;
  /**
   * Lee metadata en lote por identidad completa.  Es opcional para conservar
   * compatibilidad con repositorios de lectura antiguos y dobles de test.
   */
  listAssetMetadata?(input: {
    identities: UkiMarketplaceAssetIdentity[];
  }): Promise<UkiMarketplaceAssetMetadata[]>;
}

async function ordersCollection() {
  const db = await getIndexerDb();
  return db.collection<IndexedUkiMarketplaceOrder>('uki_marketplace_orders');
}

async function assetsCollection() {
  const db = await getIndexerDb();
  return db.collection<InventoryDocumentWithCardImage>('cukies');
}

export class MongoUkiMarketplaceRepository implements UkiMarketplaceRepository {
  private readonly collectionFactory: () => Promise<
    Collection<IndexedUkiMarketplaceOrder>
  >;
  private readonly assetCollectionFactory: () => Promise<
    Collection<InventoryDocumentWithCardImage>
  >;

  constructor(
    collectionFactory: () => Promise<
      Collection<IndexedUkiMarketplaceOrder>
    > = ordersCollection,
    assetCollectionFactory: () => Promise<
      Collection<InventoryDocumentWithCardImage>
    > = assetsCollection,
  ) {
    this.collectionFactory = collectionFactory;
    this.assetCollectionFactory = assetCollectionFactory;
  }

  async listPublicCandidates(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    now: Date;
    limit: number;
    after?: { listedAt: Date; id: string };
    search?: string;
  }) {
    const collection = await this.collectionFactory();
    const filter: Record<string, unknown> = {
      chainId: input.chainId,
      marketplaceAddressNormalized: input.marketplaceAddress,
      status: 'active',
      expiresAt: { $gt: input.now },
    };
    if (input.after) {
      filter.$or = [
        { listedAt: { $lt: input.after.listedAt } },
        { listedAt: input.after.listedAt, _id: { $lt: input.after.id } },
      ];
    }
    const search = input.search?.trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$and = [
        {
          $or: [
            { tokenId: { $regex: escaped, $options: 'i' } },
            {
              sellerNormalized: {
                $regex: escaped.toLowerCase(),
                $options: 'i',
              },
            },
            {
              collectionAddressNormalized: {
                $regex: escaped.toLowerCase(),
                $options: 'i',
              },
            },
          ],
        },
      ];
    }
    return collection
      .find(filter)
      .sort({ listedAt: -1, _id: -1 })
      .limit(input.limit)
      .toArray();
  }

  async listSellerOrders(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    sellerNormalized: `0x${string}`;
    limit: number;
  }) {
    const collection = await this.collectionFactory();
    return collection
      .find({
        chainId: input.chainId,
        marketplaceAddressNormalized: input.marketplaceAddress,
        sellerNormalized: input.sellerNormalized,
      })
      .sort({ listedAt: -1, _id: -1 })
      .limit(input.limit)
      .toArray();
  }

  async listAssetMetadata(input: {
    identities: UkiMarketplaceAssetIdentity[];
  }): Promise<UkiMarketplaceAssetMetadata[]> {
    const identities = [...new Map(
      input.identities.flatMap((identity) => {
        const collectionAddress = canonicalCollection(identity.collectionAddress);
        const tokenId = canonicalTokenId(identity.tokenId);
        if (
          (identity.chainId !== 56 && identity.chainId !== 97)
          || !collectionAddress
          || !tokenId
        ) return [];
        const canonical = {
          chainId: identity.chainId,
          collectionAddress,
          tokenId,
        } satisfies UkiMarketplaceAssetIdentity;
        return [[ukiMarketplaceAssetIdentityKey(canonical), canonical] as const];
      }),
    ).values()].slice(0, MAX_METADATA_IDENTITIES);
    if (identities.length === 0) return [];

    // Cada cláusula ata cadena, colección y tokenId. Tres `$in` separados
    // permitirían cruzar accidentalmente una colección de otra red con el
    // token de un anuncio distinto.
    const filter = {
      $or: identities.map((identity) => ({
        chainId: identity.chainId,
        collectionAddressNormalized: identity.collectionAddress,
        tokenId: { $in: tokenIdQueryCandidates(identity.tokenId) },
      })),
    };
    const documents = await (await this.assetCollectionFactory())
      .find(filter)
      .limit(MAX_METADATA_IDENTITIES * 2)
      .toArray();
    const requested = new Set(identities.map(ukiMarketplaceAssetIdentityKey));
    const matches = new Map<string, UkiMarketplaceAssetMetadata[]>();
    for (const document of documents) {
      const identity = canonicalAssetIdentity(document);
      if (!identity) continue;
      const key = ukiMarketplaceAssetIdentityKey(identity);
      if (!requested.has(key)) continue;
      const normalized = normalizeCukiesInventoryDocument(document);
      const cardImageUrl = typeof document.cardImageUrl === 'string'
        ? document.cardImageUrl.trim() || null
        : null;
      const metadata: UkiMarketplaceAssetMetadata = {
        ...identity,
        imageUrl: cardImageUrl ?? normalized.imageUrl ?? null,
        rarity: normalized.rarity === 'unknown' ? null : normalized.rarity,
        generation: normalized.generation === 'unknown' ? null : normalized.generation,
      };
      matches.set(key, [...(matches.get(key) ?? []), metadata]);
    }

    // La identidad debe ser única también en Mongo. Ante duplicados no
    // elegimos arbitrariamente una imagen o rareza de otra fila.
    return identities.flatMap((identity) => {
      const rows = matches.get(ukiMarketplaceAssetIdentityKey(identity));
      return rows?.length === 1 ? rows : [];
    });
  }
}
