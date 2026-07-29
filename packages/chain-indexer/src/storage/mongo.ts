import {
  type Collection,
  type Db,
  type Document,
  MongoClient,
  type OptionalUnlessRequiredId,
} from 'mongodb';

import type { ChainCursor, ChainEvent, ContractEventConfig, IndexerConfig } from '../types.js';
import { now } from '../utils/json.js';

export class IndexerStore {
  private client: MongoClient;
  readonly db: Db;

  constructor(config: IndexerConfig) {
    this.client = new MongoClient(config.mongoUrl);
    this.db = this.client.db(config.dbName);
  }

  async connect() {
    await this.client.connect();
    return this;
  }

  async close() {
    await this.client.close();
  }

  events(): Collection<ChainEvent> {
    return this.db.collection<ChainEvent>('chain_events');
  }

  cursors(): Collection<ChainCursor> {
    return this.db.collection<ChainCursor>('chain_cursors');
  }

  async ensureIndexes() {
    await Promise.all([
      this.events().createIndex({
        chain: 1,
        contractAlias: 1,
        contractAddress: 1,
        eventName: 1,
        blockNumber: 1,
      }),
      this.events().createIndex({ status: 1, timestampMs: 1, blockNumber: 1, logIndex: 1 }),
      this.events().createIndex({ txHash: 1 }),
      this.events().createIndex({ eventName: 1, 'normalized.tokenId': 1, timestampMs: -1 }),
      this.cursors().createIndex({ chain: 1, contractAlias: 1, eventName: 1 }),
      this.db.collection('tx_nfts').createIndex({ eventId: 1 }, { unique: true, sparse: true }),
      this.db
        .collection('point_transactions')
        .createIndex({ eventId: 1 }, { unique: true, sparse: true }),
      this.db.collection('point_balances').createIndex({ addressNormalized: 1 }, { unique: true }),
      this.db.collection('marketplace_listings').createIndex({ tokenId: 1 }, { unique: true }),
      this.db.collection('bridge_transfers').createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('presale_purchases').createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('presale_purchases').createIndex({ txHash: 1, logIndex: 1 }, { unique: true }),
      this.db.collection('presale_purchases').createIndex({ buyerNormalized: 1, confirmedAt: -1 }),
      this.db.collection('presale_purchases').createIndex({ contractAddress: 1, confirmedAt: 1 }),
      this.db.collection('presale_participants').createIndex({ normalizedWalletAddress: 1 }, { unique: true }),
      this.db.collection('presale_participants').createIndex({ referralCode: 1 }, { unique: true, sparse: true }),
      this.db.collection('presale_referral_contributions').createIndex({ eventId: 1, level: 1 }, { unique: true }),
      this.db.collection('presale_referral_contributions').createIndex({ sponsorWalletNormalized: 1, level: 1, confirmedAt: -1 }),
      this.db.collection('presale_referral_campaign_config').createIndex({ active: 1 }),
      this.db.collection('chain_dead_letters').createIndex({ eventId: 1 }, { unique: true }),
      this.db.collection('chain_indexer_runs').createIndex({ startedAt: -1 }),
      this.db.collection('cukies').createIndex({ state: 1, network: 1, ownerNormalized: 1, timeStamp: -1 }),
      this.db.collection('cukies').createIndex({ ownerNormalized: 1, state: 1, network: 1 }),
      this.db.collection('tx_nfts').createIndex({ tokenId: 1, timestampMs: -1 }),
      this.db.collection('point_transactions').createIndex({ addressNormalized: 1, chain: 1, type: 1, timestampMs: -1 }),
      this.db.collection('point_transactions').createIndex({ chain: 1, type: 1, timestampMs: -1 }),
      this.db.collection('marketplace_listings').createIndex({ status: 1, chain: 1, updatedAt: -1 }),
      this.db.collection('bridge_transfers').createIndex({ tokenId: 1, timestampMs: -1 }),
    ]);
  }

  cursorId(config: ContractEventConfig) {
    return `${config.chain}:${config.contractAlias}:${config.eventName}`;
  }

  async getCursor(config: ContractEventConfig) {
    const cursors = this.cursors();
    const cursor = await cursors.findOne({ _id: this.cursorId(config) });
    if (!cursor) return null;

    const storedAddress = cursor.contractAddress?.trim();
    const configuredAddress = config.contractAddress.trim();
    const matches = config.chain === 'BSC'
      ? storedAddress?.toLowerCase() === configuredAddress.toLowerCase()
      : storedAddress === configuredAddress;
    if (matches) return cursor;

    await cursors.deleteOne(cursor.contractAddress
      ? { _id: this.cursorId(config), contractAddress: cursor.contractAddress }
      : { _id: this.cursorId(config), contractAddress: { $exists: false } });
    return null;
  }

  async updateCursor(config: ContractEventConfig, update: Partial<ChainCursor>) {
    await this.cursors().updateOne(
      { _id: this.cursorId(config) },
      {
        $set: {
          chain: config.chain,
          contractAlias: config.contractAlias,
          contractAddress: config.contractAddress,
          eventName: config.eventName,
          ...update,
          updatedAt: now(),
        },
      },
      { upsert: true },
    );
  }

  async upsertEvents(events: ChainEvent[]) {
    if (events.length === 0) return { inserted: 0 };

    const result = await this.events().bulkWrite(
      events.map((event) => ({
        updateOne: {
          filter: { _id: event._id },
          update: {
            $setOnInsert: event,
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );

    return { inserted: result.upsertedCount };
  }

  async claimNextEvent() {
    const staleLock = new Date(Date.now() - 15 * 60 * 1000);

    const result = await this.events().findOneAndUpdate(
      {
        $or: [
          { status: 'ingested' },
          { status: 'failed', attempts: { $lt: 5 } },
          { status: 'projecting', lockedAt: { $lt: staleLock } },
        ],
      },
      {
        $set: {
          status: 'projecting',
          lockedAt: now(),
          updatedAt: now(),
        },
        $inc: { attempts: 1 },
      },
      {
        sort: { timestampMs: 1, blockNumber: 1, logIndex: 1 },
        returnDocument: 'after',
      },
    );

    return result;
  }

  async markProjected(eventId: string) {
    await this.events().updateOne(
      { _id: eventId },
      {
        $set: {
          status: 'projected',
          projectedAt: now(),
          updatedAt: now(),
        },
        $unset: { lockedAt: '', lastError: '' },
      },
    );
  }

  async markIgnored(eventId: string, reason: string) {
    await this.events().updateOne(
      { _id: eventId },
      {
        $set: {
          status: 'ignored',
          lastError: reason,
          projectedAt: now(),
          updatedAt: now(),
        },
        $unset: { lockedAt: '' },
      },
    );
  }

  async markFailed(event: ChainEvent, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    await this.events().updateOne(
      { _id: event._id },
      {
        $set: {
          status: 'failed',
          lastError: message,
          updatedAt: now(),
        },
        $unset: { lockedAt: '' },
      },
    );

    if (event.attempts >= 4) {
      await this.db.collection('chain_dead_letters').updateOne(
        { eventId: event._id },
        {
          $set: {
            eventId: event._id,
            eventName: event.eventName,
            chain: event.chain,
            error: message,
            updatedAt: now(),
          },
          $setOnInsert: {
            createdAt: now(),
          },
        },
        { upsert: true },
      );
    }
  }

  async recordRun<T extends Document>(document: OptionalUnlessRequiredId<T>) {
    await this.db.collection<T>('chain_indexer_runs').insertOne(document);
  }

  async summary() {
    const [
      eventCounts,
      cursorCount,
      cukiCount,
      txCount,
      pointTxCount,
      listingCount,
      deadLetterCount,
    ] = await Promise.all([
      this.events()
        .aggregate<{ _id: string; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      this.cursors().countDocuments(),
      this.db.collection('cukies').countDocuments(),
      this.db.collection('tx_nfts').countDocuments(),
      this.db.collection('point_transactions').countDocuments(),
      this.db.collection('marketplace_listings').countDocuments(),
      this.db.collection('chain_dead_letters').countDocuments(),
    ]);

    return {
      eventCounts,
      cursorCount,
      cukiCount,
      txCount,
      pointTxCount,
      listingCount,
      deadLetterCount,
    };
  }
}
