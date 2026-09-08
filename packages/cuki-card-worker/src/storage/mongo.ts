import { Db, MongoClient, type Filter } from 'mongodb';

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

  private renderableMetadataFilter(): Filter<CukiDocument> {
    return {
      $and: [
        { $or: [{ type: { $exists: true, $ne: null } }, { rarity: { $exists: true, $ne: null } }] },
        {
          $or: [
            { 'skills.generation': { $exists: true, $ne: null } },
            { generation: { $exists: true, $ne: null } },
          ],
        },
      ],
    };
  }

  private claimFilter(tokenId?: string): Filter<CukiDocument> {
    const metadataFilter = this.renderableMetadataFilter();

    return {
      ...(tokenId ? { _id: tokenId } : {}),
      $and: [
        ...(metadataFilter.$and ?? []),
        {
          $or: [
            { cardImageAttempts: { $exists: false } },
            { cardImageAttempts: { $lt: this.config.maxAttempts } },
          ],
        },
        {
          $or: [
            { cardImageStatus: { $ne: 'processing' } },
            {
              cardImageStatus: 'processing',
              cardImageLockedAt: { $lt: new Date(Date.now() - this.config.staleLockMs) },
            },
          ],
        },
      ],
    };
  }

  async claimNextCuki() {
    return this.cukies().findOneAndUpdate(
      {
        $and: [
          this.renderableMetadataFilter(),
          {
            $or: [
              { needsImage: true },
              { cardImageStatus: 'pending' },
              { cardImageStatus: 'failed', cardImageAttempts: { $lt: this.config.maxAttempts } },
              {
                cardImageStatus: 'processing',
                cardImageLockedAt: { $lt: new Date(Date.now() - this.config.staleLockMs) },
              },
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

  async claimCukiById(tokenId: string) {
    return this.cukies().findOneAndUpdate(
      this.claimFilter(tokenId),
      {
        $set: {
          cardImageStatus: 'processing',
          cardImageLockedAt: new Date(),
          cardImageLastError: null,
          updatedAt: new Date(),
        },
        $inc: { cardImageAttempts: 1 },
      },
      { returnDocument: 'after' },
    );
  }

  async listBackfillCukies() {
    return this.cukies()
      .find(this.renderableMetadataFilter())
      .project({
        _id: 1,
        tokenId: 1,
        network: 1,
        chainId: 1,
        collectionAddressNormalized: 1,
        img: 1,
        type: 1,
        rarity: 1,
        generation: 1,
        skills: 1,
      })
      .sort({ _id: 1 })
      .toArray();
  }

  async markGenerated(tokenId: string, result: GenerationResult) {
    const updated = await this.cukies().updateOne(
      { _id: tokenId, cardImageStatus: 'processing' },
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

    if (updated.matchedCount !== 1) {
      throw new Error(`No se pudo confirmar la publicación de la card ${tokenId}: el lock ya no es válido.`);
    }

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
    const metadataFilter = this.renderableMetadataFilter();
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
          $and: [
            ...(metadataFilter.$and ?? []),
            { $or: [{ img: { $exists: false } }, { img: null }, { img: '' }, { needsImage: true }] },
          ],
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
