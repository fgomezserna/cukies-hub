import { Db, MongoClient } from 'mongodb';

import type { CardWorkerConfig, CukiDocument, GenerationResult } from '../types.js';

export class CardWorkerStore {
  private client: MongoClient;
  readonly db: Db;
  private config: CardWorkerConfig;

  constructor(config: CardWorkerConfig) {
    this.config = config;
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

  cukies() {
    return this.db.collection<CukiDocument>('cukies');
  }

  jobs() {
    return this.db.collection('card_generation_jobs');
  }

  async ensureIndexes() {
    await Promise.all([
      this.cukies().createIndex({ cardImageStatus: 1, cardImageLockedAt: 1 }),
      this.cukies().createIndex({ needsImage: 1, cardImageAttempts: 1 }),
      this.cukies().createIndex({ img: 1 }),
      this.cukies().createIndex({ type: 1, 'skills.generation': 1 }),
      this.jobs().createIndex({ tokenId: 1, createdAt: -1 }),
      this.jobs().createIndex({ status: 1, createdAt: -1 }),
    ]);
  }

  async getCuki(tokenId: string) {
    return this.cukies().findOne({ _id: tokenId });
  }

  async claimNextCuki() {
    const staleLock = new Date(Date.now() - this.config.staleLockMs);

    return this.cukies().findOneAndUpdate(
      {
        $and: [
          { type: { $exists: true, $ne: null } },
          { 'skills.generation': { $exists: true, $ne: null } },
          {
            $or: [
              { needsImage: true },
              { cardImageStatus: 'pending' },
              { cardImageStatus: 'failed', cardImageAttempts: { $lt: this.config.maxAttempts } },
              { cardImageStatus: 'processing', cardImageLockedAt: { $lt: staleLock } },
              { img: { $exists: false } },
              { img: null },
              { img: '' },
            ],
          },
        ],
      },
      {
        $set: {
          cardImageStatus: 'processing',
          cardImageLockedAt: new Date(),
          cardImageLastError: null,
          updatedAt: new Date(),
        },
        $inc: {
          cardImageAttempts: 1,
        },
      },
      {
        sort: { timeStamp: 1, _id: 1 },
        returnDocument: 'after',
      },
    );
  }

  async markGenerated(tokenId: string, result: GenerationResult) {
    await this.cukies().updateOne(
      { _id: tokenId },
      {
        $set: {
          img: result.imageUrl,
          cardImageUrl: result.imageUrl,
          cardImageStatus: 'generated',
          cardGeneratedAt: new Date(),
          needsImage: false,
          updatedAt: new Date(),
        },
        $unset: {
          cardImageLockedAt: '',
          cardImageLastError: '',
        },
      },
    );

    await this.recordJob(tokenId, 'generated', result);
  }

  async markFailed(tokenId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    await this.cukies().updateOne(
      { _id: tokenId },
      {
        $set: {
          cardImageStatus: 'failed',
          cardImageLastError: message,
          updatedAt: new Date(),
        },
        $unset: {
          cardImageLockedAt: '',
        },
      },
    );

    await this.recordJob(tokenId, 'failed', { error: message });
  }

  async recordJob(tokenId: string, status: string, payload: Record<string, unknown>) {
    await this.jobs().insertOne({
      tokenId,
      status,
      ...payload,
      createdAt: new Date(),
    });
  }

  async summary() {
    const [cukiCount, statusCounts, missingImageCount, readyMissingImageCount, jobCounts] =
      await Promise.all([
        this.cukies().countDocuments(),
        this.cukies()
          .aggregate<{ _id: string | null; count: number }>([
            { $group: { _id: '$cardImageStatus', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ])
          .toArray(),
        this.cukies().countDocuments({
          $or: [{ img: { $exists: false } }, { img: null }, { img: '' }],
        }),
        this.cukies().countDocuments({
          type: { $exists: true, $ne: null },
          'skills.generation': { $exists: true, $ne: null },
          $or: [{ img: { $exists: false } }, { img: null }, { img: '' }, { needsImage: true }],
        }),
        this.jobs()
          .aggregate<{ _id: string | null; count: number }>([
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ])
          .toArray(),
      ]);

    return {
      cukiCount,
      statusCounts,
      missingImageCount,
      readyMissingImageCount,
      jobCounts,
    };
  }
}
