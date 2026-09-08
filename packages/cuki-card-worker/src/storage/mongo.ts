import crypto from 'node:crypto';

import { Db, MongoClient, type Filter } from 'mongodb';

import type {
  AssetIdentityContext,
  CardImageLease,
  CardWorkerConfig,
  ClaimedCuki,
  CukiDocument,
  GenerationResult,
} from '../types.js';
import { canonicalAssetIdentity, validateAssetIdentityContext } from '../identity.js';

const validTypeValues = [1, 2, 3, 4, 5, 6, '1', '2', '3', '4', '5', '6'];
const validGenerationValues = [1, 2, '1', '2'];

export function buildRenderableMetadataFilter(): Filter<CukiDocument> {
  return {
    $and: [
      { $or: [{ type: { $in: validTypeValues } }, { type: { $exists: false }, rarity: { $in: validTypeValues } }] },
      {
        $or: [
          { 'skills.generation': { $in: validGenerationValues } },
          { 'skills.generation': { $exists: false }, generation: { $in: validGenerationValues } },
        ],
      },
    ],
  };
}

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

  private async findCukiByTokenId(tokenId: string, context?: AssetIdentityContext) {
    if (context) validateAssetIdentityContext(context);
    const candidates = await this.cukies().find({ $or: [{ tokenId }, { _id: tokenId }] }).toArray();
    const matching = candidates.filter((candidate) => {
      if (candidate.tokenId && candidate.tokenId !== tokenId) return false;
      const identity = canonicalAssetIdentity(
        context && !candidate.tokenId ? { ...candidate, tokenId } : candidate,
        context,
      );
      if (!identity) return false;
      if (!context) return true;
      const expected = canonicalAssetIdentity({
        _id: candidate._id,
        tokenId,
        ...context,
      });
      return identity === expected;
    });
    if (matching.length > 1) {
      throw new Error(`El token ${tokenId} es ambiguo: exige red, chainId y colección.`);
    }
    return matching[0] ?? null;
  }

  async getCukiByTokenId(tokenId: string, context?: AssetIdentityContext) {
    return this.findCukiByTokenId(tokenId, context);
  }

  private renderableMetadataFilter(): Filter<CukiDocument> {
    return buildRenderableMetadataFilter();
  }

  private canonicalIdentityFilter(): Filter<CukiDocument> {
    return {
      $and: [
        { tokenId: { $type: 'string', $ne: '' } },
        { collectionAddressNormalized: { $type: 'string', $ne: '' } },
        {
          $or: [
            {
              $and: [
                { $or: [{ network: 'BSC' }, { network: 'bsc' }, { chain: 'BSC' }, { chain: 'bsc' }] },
                { $or: [{ chainId: { $type: 'int' } }, { chainId: { $type: 'long' } }, { chainId: { $type: 'double' } }] },
              ],
            },
            {
              $and: [
                { $or: [{ network: 'TRON' }, { network: 'tron' }, { chain: 'TRON' }, { chain: 'tron' }] },
                { chainId: { $exists: false } },
              ],
            },
          ],
        },
      ],
    };
  }

  private claimFilter(tokenId?: string, legacyContext?: AssetIdentityContext): Filter<CukiDocument> {
    const metadataFilter = this.renderableMetadataFilter();

    return {
      ...(tokenId ? { _id: tokenId } : {}),
      $and: [
        ...(legacyContext ? [] : (this.canonicalIdentityFilter().$and ?? [])),
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

  async claimNextCuki(context?: AssetIdentityContext) {
    const candidateFilter: Filter<CukiDocument> = {
      $and: [
        this.claimFilter(undefined, context),
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
    if (!context) return this.claim(candidateFilter, { timeStamp: 1, _id: 1 });
    validateAssetIdentityContext(context);
    const candidates = await this.cukies().find(candidateFilter).sort({ timeStamp: 1, _id: 1 }).toArray();
    for (const candidate of candidates) {
      if (!canonicalAssetIdentity(candidate, context)) continue;
      const claimed = await this.claimCukiByDocumentId(candidate._id, context);
      if (claimed) return claimed;
    }
    return null;
  }

  async claimCukiByDocumentId(documentId: string, legacyContext?: AssetIdentityContext) {
    if (legacyContext) validateAssetIdentityContext(legacyContext);
    if (legacyContext) {
      const current = await this.getCuki(documentId);
      if (!current || !canonicalAssetIdentity(current, legacyContext)) return null;
    }
    return this.claim(this.claimFilter(documentId, legacyContext));
  }

  async claimCukiByTokenId(tokenId: string, context?: AssetIdentityContext) {
    const candidate = await this.findCukiByTokenId(tokenId, context);
    return candidate ? this.claimCukiByDocumentId(candidate._id, context) : null;
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
