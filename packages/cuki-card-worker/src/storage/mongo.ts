import crypto from 'node:crypto';

import { Db, MongoClient, type Filter } from 'mongodb';

import type { CardImageLease, CardWorkerConfig, ClaimedCuki, CukiDocument, GenerationResult } from '../types.js';

export function buildCardImageLeaseFilter(documentId: string, lease: CardImageLease): Filter<CukiDocument> {
  return {
    _id: documentId,
    cardImageStatus: 'processing',
    cardImageLockId: lease.lockId,
    cardImageLeaseVersion: lease.leaseVersion,
    updatedAt: lease.claimedAt,
    cardImageLeaseSourceRevision: lease.sourceRevision,
  };
}

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
      this.cukies().createIndex({ cardImageLockId: 1, cardImageLeaseVersion: 1 }),
      this.cukies().createIndex({ needsImage: 1, cardImageAttempts: 1 }),
      this.cukies().createIndex({ img: 1 }),
      this.cukies().createIndex({ type: 1, 'skills.generation': 1 }),
      this.jobs().createIndex({ tokenId: 1, createdAt: -1 }),
      this.jobs().createIndex({ status: 1, createdAt: -1 }),
    ]);
  }

  async getCuki(documentId: string) {
    return this.cukies().findOne({ _id: documentId });
  }

  async getCukiByTokenId(tokenId: string) {
    return this.cukies().findOne({ $or: [{ tokenId }, { _id: tokenId }] });
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

  private async claim(filter: Filter<CukiDocument>, sort?: Record<string, 1 | -1>) {
    const now = new Date();
    const lockId = crypto.randomUUID();
    const updated = await this.cukies().findOneAndUpdate(
      filter,
      [
        {
          $set: {
            cardImageStatus: 'processing',
            cardImageLockedAt: now,
            cardImageLockId: lockId,
            cardImageLastError: null,
            cardImageLeaseVersion: { $add: [{ $ifNull: ['$cardImageLeaseVersion', 0] }, 1] },
            cardImageLeaseSourceRevision: { $ifNull: ['$updatedAt', null] },
            updatedAt: now,
          },
        },
        {
          $set: {
            cardImageAttempts: { $add: [{ $ifNull: ['$cardImageAttempts', 0] }, 1] },
          },
        },
      ] as any,
      { returnDocument: 'after', ...(sort ? { sort } : {}) },
    );

    if (!updated) return null;

    const lease: CardImageLease = {
      lockId,
      leaseVersion: updated.cardImageLeaseVersion ?? 1,
      claimedAt: updated.updatedAt ?? now,
      sourceRevision: updated.cardImageLeaseSourceRevision ?? null,
    };

    return { ...updated, lease } satisfies ClaimedCuki;
  }

  async claimNextCuki() {
    const candidateFilter: Filter<CukiDocument> = {
      $and: [
        this.claimFilter(),
        {
          $or: [
            { needsImage: true },
            { cardImageStatus: 'pending' },
            { cardImageStatus: 'failed', cardImageAttempts: { $lt: this.config.maxAttempts } },
            { cardImageStatus: 'processing', cardImageLockedAt: { $lt: new Date(Date.now() - this.config.staleLockMs) } },
            { img: { $exists: false } },
            { img: null },
            { img: '' },
          ],
        },
      ],
    };
    return this.claim(candidateFilter, { timeStamp: 1, _id: 1 });
  }

  async claimCukiByDocumentId(documentId: string) {
    return this.claim(this.claimFilter(documentId));
  }

  async claimCukiByTokenId(tokenId: string) {
    const base = this.claimFilter();
    return this.claim({
      ...base,
      $and: [
        ...(base.$and ?? []),
        { $or: [{ tokenId }, { _id: tokenId }] },
      ],
    });
  }

  async claimCukiById(documentId: string) {
    return this.claimCukiByDocumentId(documentId);
  }

  async listBackfillCukies() {
    return this.cukies()
      .find({})
      .project<CukiDocument>({
        _id: 1,
        tokenId: 1,
        chain: 1,
        network: 1,
        chainId: 1,
        collectionAddressNormalized: 1,
        img: 1,
        type: 1,
        rarity: 1,
        generation: 1,
        skills: 1,
        needsImage: 1,
        cardImageStatus: 1,
        cardImageAttempts: 1,
        cardImageLockedAt: 1,
        updatedAt: 1,
      })
      .sort({ _id: 1 })
      .toArray();
  }

  private leaseFilter(claimed: ClaimedCuki): Filter<CukiDocument> {
    return buildCardImageLeaseFilter(claimed._id, claimed.lease);
  }

  async markGenerated(claimed: ClaimedCuki, result: GenerationResult) {
    const updated = await this.cukies().updateOne(
      this.leaseFilter(claimed),
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
      throw new Error(`No se pudo confirmar la publicación de la card ${claimed._id}: el lease ya no es válido o el documento cambió.`);
    }

    await this.recordJob(claimed._id, 'generated', result);
  }

  async markFailed(claimed: ClaimedCuki, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    const updated = await this.cukies().updateOne(
      this.leaseFilter(claimed),
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

    if (updated.matchedCount !== 1) {
      throw new Error(`No se pudo registrar el fallo de la card ${claimed._id}: el lease ya no es válido.`);
    }

    await this.recordJob(claimed._id, 'failed', { error: message });
  }

  async recordJob(documentId: string, status: string, payload: Record<string, unknown>) {
    await this.jobs().insertOne({
      documentId,
      tokenId: payload.tokenId ?? documentId,
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
