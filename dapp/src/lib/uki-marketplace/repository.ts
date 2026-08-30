import 'server-only';

import type { Collection } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';

import type { IndexedUkiMarketplaceOrder } from './types';

export interface UkiMarketplaceRepository {
  listPublicCandidates(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    now: Date;
    limit: number;
  }): Promise<IndexedUkiMarketplaceOrder[]>;
  listSellerOrders(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    sellerNormalized: `0x${string}`;
    limit: number;
  }): Promise<IndexedUkiMarketplaceOrder[]>;
}

async function ordersCollection() {
  const db = await getIndexerDb();
  return db.collection<IndexedUkiMarketplaceOrder>('uki_marketplace_orders');
}

export class MongoUkiMarketplaceRepository implements UkiMarketplaceRepository {
  private readonly collectionFactory: () => Promise<Collection<IndexedUkiMarketplaceOrder>>;

  constructor(
    collectionFactory: () => Promise<Collection<IndexedUkiMarketplaceOrder>> = ordersCollection,
  ) {
    this.collectionFactory = collectionFactory;
  }

  async listPublicCandidates(input: {
    chainId: 56 | 97;
    marketplaceAddress: `0x${string}`;
    now: Date;
    limit: number;
  }) {
    const collection = await this.collectionFactory();
    return collection
      .find({
        chainId: input.chainId,
        marketplaceAddressNormalized: input.marketplaceAddress,
        status: 'active',
        expiresAt: { $gt: input.now },
      })
      .sort({ listedAt: -1, _id: -1 })
      .limit(Math.min(input.limit * 3, 150))
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
}
