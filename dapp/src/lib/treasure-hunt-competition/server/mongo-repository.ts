import 'server-only';

import type { Collection, Db, Document } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';

import {
  generatePrivateCompetitionAlias,
  type CompetitionConfig,
} from '..';
import type {
  CompetitionAttemptRecord,
  CompetitionParticipantRecord,
  CompetitionRepository,
} from './models';
import {
  COMPETITION_ATTEMPT_INDEXES,
  COMPETITION_CAMPAIGN_INDEXES,
  COMPETITION_PARTICIPANT_INDEXES,
} from './mongo-indexes';
import { MAX_COMPETITION_EVIDENCE_POINTS } from './evidence';

const CAMPAIGNS_COLLECTION = 'presale_game_campaigns';
const PARTICIPANTS_COLLECTION = 'presale_game_participants';
const ATTEMPTS_COLLECTION = 'presale_game_attempts';
const DEFAULT_LOCAL_ALIAS_SECRET = 'cukies-treasure-hunt-local-alias-secret';
const MAX_ALIAS_COLLISION_RETRIES = 16;
const MAX_RANKED_ATTEMPTS_PER_WALLET = 5;

const indexesByDatabase = new WeakMap<Db, Promise<void>>();

function exhaustiveKeys<T>() {
  return <Keys extends readonly (keyof T)[]>(
    keys: Keys & ([Exclude<keyof T, Keys[number]>] extends [never] ? unknown : never),
  ) => keys;
}

const CAMPAIGN_CONFIG_KEYS = exhaustiveKeys<CompetitionConfig>()([
  'campaignId',
  'gameId',
  'mode',
  'rulesVersion',
  'presaleContractAddress',
  'startsAt',
  'endsAt',
  'poolBps',
  'playerRewardBps',
  'sponsorRewardBps',
  'maxWinningAttemptsPerWallet',
  'cliffMonths',
  'vestingMonths',
] as const);

function resolveAliasSecret(environment: NodeJS.ProcessEnv = process.env) {
  const dedicated = environment.TREASURE_HUNT_COMPETITION_ALIAS_SECRET?.trim();
  if (dedicated) {
    if (dedicated.length < 32) {
      throw new Error('Competition alias secret must contain at least 32 characters');
    }
    return dedicated;
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('TREASURE_HUNT_COMPETITION_ALIAS_SECRET is required in production');
  }
  const developmentFallback = environment.TREASURE_HUNT_COMPETITION_PROOF_SECRET?.trim()
    || environment.NEXTAUTH_SECRET?.trim()
    || environment.AUTH_SECRET?.trim();
  if (developmentFallback && developmentFallback.length >= 32) {
    return developmentFallback;
  }
  return DEFAULT_LOCAL_ALIAS_SECRET;
}

export class CompetitionCampaignDriftError extends Error {
  constructor(readonly fields: readonly (keyof CompetitionConfig)[]) {
    super(`Stored competition campaign differs in immutable fields: ${fields.join(', ')}`);
    this.name = 'CompetitionCampaignDriftError';
  }
}

export function assertCompetitionCampaignMatches(
  stored: Document | null,
  expected: CompetitionConfig,
) {
  if (!stored) throw new Error('Competition campaign could not be persisted');
  const differentFields = CAMPAIGN_CONFIG_KEYS.filter((key) => stored[key] !== expected[key]);
  if (differentFields.length > 0) throw new CompetitionCampaignDriftError(differentFields);
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && error.code === 11000,
  );
}

function withoutMongoId<T>(document: (T & { _id?: unknown }) | null): T | null {
  if (!document) return null;
  const { _id: _ignored, ...record } = document;
  return record as T;
}

export async function selectTopCompetitionAttempts(
  rows: AsyncIterable<CompetitionAttemptRecord>,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError('Competition attempt limit must be a positive safe integer');
  }

  const selected: CompetitionAttemptRecord[] = [];
  const attemptsByWallet = new Map<string, number>();
  for await (const row of rows) {
    const walletAddress = row.walletAddress.toLowerCase();
    const walletAttempts = attemptsByWallet.get(walletAddress) ?? 0;
    if (walletAttempts >= MAX_RANKED_ATTEMPTS_PER_WALLET) continue;

    attemptsByWallet.set(walletAddress, walletAttempts + 1);
    selected.push(row);
    if (selected.length >= limit) break;
  }
  return selected;
}

export class MongoCompetitionRepository implements CompetitionRepository {
  private resolvedAliasSecret: string | null = null;

  constructor(
    private readonly getDb: () => Promise<Db> = getIndexerDb,
    private readonly configuredAliasSecret?: string,
  ) {}

  private getAliasSecret() {
    if (this.resolvedAliasSecret) return this.resolvedAliasSecret;
    const aliasSecret = (this.configuredAliasSecret ?? resolveAliasSecret()).trim();
    if (aliasSecret.length < 32) {
      throw new Error('Competition alias secret must contain at least 32 characters');
    }
    this.resolvedAliasSecret = aliasSecret;
    return aliasSecret;
  }

  assertReadyForParticipantWrites() {
    this.getAliasSecret();
  }

  private async campaigns(): Promise<Collection<Document>> {
    return (await this.getDb()).collection(CAMPAIGNS_COLLECTION);
  }

  private async participants(): Promise<Collection<CompetitionParticipantRecord>> {
    return (await this.getDb()).collection<CompetitionParticipantRecord>(PARTICIPANTS_COLLECTION);
  }

  private async attempts(): Promise<Collection<CompetitionAttemptRecord>> {
    return (await this.getDb()).collection<CompetitionAttemptRecord>(ATTEMPTS_COLLECTION);
  }

  async ensureIndexes() {
    const db = await this.getDb();
    let indexesPromise = indexesByDatabase.get(db);
    if (!indexesPromise) {
      indexesPromise = Promise.all([
        db.collection(CAMPAIGNS_COLLECTION).createIndexes([...COMPETITION_CAMPAIGN_INDEXES]),
        db.collection(PARTICIPANTS_COLLECTION).createIndexes([...COMPETITION_PARTICIPANT_INDEXES]),
        db.collection(ATTEMPTS_COLLECTION).createIndexes([...COMPETITION_ATTEMPT_INDEXES]),
      ]).then(() => undefined);
      indexesByDatabase.set(db, indexesPromise);
    }
    try {
      await indexesPromise;
    } catch (error) {
      indexesByDatabase.delete(db);
      throw error;
    }
  }

  async syncCampaign(campaign: CompetitionConfig, now: string) {
    const collection = await this.campaigns();
    await collection.updateOne(
      { campaignId: campaign.campaignId },
      {
        $setOnInsert: { ...campaign, createdAt: now, updatedAt: now },
      },
      { upsert: true },
    );
    assertCompetitionCampaignMatches(
      await collection.findOne({ campaignId: campaign.campaignId }),
      campaign,
    );
  }

  async getOrCreateParticipant(input: {
    campaignId: string;
    walletAddress: string;
    generatedAlias: string;
    now: string;
  }) {
    const aliasSecret = this.getAliasSecret();
    const collection = await this.participants();
    for (let collisionNonce = 0; collisionNonce < MAX_ALIAS_COLLISION_RETRIES; collisionNonce += 1) {
      const alias = generatePrivateCompetitionAlias({
        campaignId: input.campaignId,
        walletAddress: input.walletAddress,
        secret: aliasSecret,
        collisionNonce,
      });
      try {
        await collection.updateOne(
          { campaignId: input.campaignId, walletAddress: input.walletAddress },
          {
            $setOnInsert: {
              campaignId: input.campaignId,
              walletAddress: input.walletAddress,
              alias,
              canonicalAlias: alias.toLowerCase(),
              createdAt: input.now,
              updatedAt: input.now,
            },
          },
          { upsert: true },
        );
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        const participant = await collection.findOne({
          campaignId: input.campaignId,
          walletAddress: input.walletAddress,
        });
        if (participant) return withoutMongoId(participant) as CompetitionParticipantRecord;
        continue;
      }

      const participant = await collection.findOne({
        campaignId: input.campaignId,
        walletAddress: input.walletAddress,
      });
      if (participant) return withoutMongoId(participant) as CompetitionParticipantRecord;
    }
    throw new Error('Competition participant alias could not be allocated safely');
  }

  async findParticipant(campaignId: string, walletAddress: string) {
    return withoutMongoId(await (await this.participants()).findOne({ campaignId, walletAddress }));
  }

  async updateParticipantAlias(input: {
    campaignId: string;
    walletAddress: string;
    alias: string;
    canonicalAlias: string;
    now: string;
  }) {
    try {
      const participant = await (await this.participants()).findOneAndUpdate(
        { campaignId: input.campaignId, walletAddress: input.walletAddress },
        {
          $set: {
            alias: input.alias,
            canonicalAlias: input.canonicalAlias,
            aliasChangedAt: input.now,
            updatedAt: input.now,
          },
        },
        { returnDocument: 'after', includeResultMetadata: false },
      );
      return withoutMongoId(participant);
    } catch (error) {
      if (isDuplicateKeyError(error)) return null;
      throw error;
    }
  }

  async updateAttemptsAlias(input: {
    campaignId: string;
    walletAddress: string;
    alias: string;
    now: string;
  }) {
    await (await this.attempts()).updateMany(
      { campaignId: input.campaignId, walletAddress: input.walletAddress },
      { $set: { playerAlias: input.alias, updatedAt: input.now } },
    );
  }

  async findActiveAttempt(campaignId: string, walletAddress: string) {
    return withoutMongoId(await (await this.attempts()).findOne(
      { campaignId, walletAddress, status: 'active' },
      { sort: { createdAt: -1 } },
    ));
  }

  async abandonActiveAttempts(campaignId: string, walletAddress: string, now: string) {
    await (await this.attempts()).updateMany(
      {
        campaignId,
        walletAddress,
        status: 'active',
        finishPendingAuthority: { $ne: true },
      },
      { $set: { status: 'abandoned', finishedAt: now, updatedAt: now } },
    );
  }

  async listPendingFinishAttempts(campaignId: string, limit: number) {
    const rows = await (await this.attempts())
      .find({ campaignId, status: 'active', finishPendingAuthority: true })
      .sort({ updatedAt: 1, attemptId: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => withoutMongoId(row) as CompetitionAttemptRecord);
  }

  async createAttempt(attempt: CompetitionAttemptRecord) {
    await (await this.attempts()).insertOne(attempt);
    return attempt;
  }

  async findAttempt(attemptId: string) {
    return withoutMongoId(await (await this.attempts()).findOne({ attemptId }));
  }

  async appendEvidence(input: Parameters<CompetitionRepository['appendEvidence']>[0]) {
    if (input.expectedSequence >= MAX_COMPETITION_EVIDENCE_POINTS) return null;
    const set: Record<string, unknown> = {
      score: input.point.score,
      gameTimeMs: input.point.gameTimeMs,
      lastScore: input.point.score,
      lastGameTimeMs: input.point.gameTimeMs,
      lastDigest: input.point.digest,
      lastEvidenceAt: input.point.receivedAt,
      updatedAt: input.point.receivedAt,
    };
    if (input.finishPendingAuthority) {
      set.finishPendingAuthority = true;
      set.finishedAt = input.point.receivedAt;
    }

    const updated = await (await this.attempts()).findOneAndUpdate(
      {
        attemptId: input.attemptId,
        walletAddress: input.walletAddress,
        status: 'active',
        finishPendingAuthority: { $ne: true },
        nextSequence: input.expectedSequence,
        $expr: {
          $lt: [
            { $size: { $ifNull: ['$evidence', []] } },
            MAX_COMPETITION_EVIDENCE_POINTS,
          ],
        },
        lastDigest: input.expectedPreviousDigest,
      },
      {
        $set: set,
        $inc: { nextSequence: 1 },
        $push: { evidence: input.point },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return withoutMongoId(updated);
  }

  async finalizeAttemptForReview(
    input: Parameters<CompetitionRepository['finalizeAttemptForReview']>[0],
  ) {
    const updated = await (await this.attempts()).findOneAndUpdate(
      {
        attemptId: input.attemptId,
        walletAddress: input.walletAddress,
        status: 'active',
        finishPendingAuthority: true,
        nextSequence: input.expectedSequence,
        lastDigest: input.expectedPreviousDigest,
      },
      {
        $set: {
          status: 'review',
          finishPendingAuthority: false,
          reviewQueuedAt: input.now,
          updatedAt: input.now,
        },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return withoutMongoId(updated);
  }

  async listReviewAttempts(campaignId: string, limit: number) {
    const rows = await (await this.attempts())
      .find({ campaignId, status: 'review' })
      .sort({ finishedAt: 1, attemptId: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => withoutMongoId(row) as CompetitionAttemptRecord);
  }

  async adjudicateAttempt(input: Parameters<CompetitionRepository['adjudicateAttempt']>[0]) {
    const updated = await (await this.attempts()).findOneAndUpdate(
      {
        campaignId: input.campaignId,
        attemptId: input.attemptId,
        status: 'review',
        $or: [
          { reviewDecision: { $exists: false } },
          { reviewDecision: null },
        ],
      },
      {
        $set: {
          status: input.decision,
          reviewDecision: input.decision,
          reviewReason: input.reason,
          reviewedAt: input.reviewedAt,
          reviewer: input.reviewer,
          updatedAt: input.reviewedAt,
        },
      },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    return withoutMongoId(updated);
  }

  async listAttempts(campaignId: string, walletAddress: string, limit: number) {
    const rows = await (await this.attempts())
      .find({ campaignId, walletAddress })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => withoutMongoId(row) as CompetitionAttemptRecord);
  }

  async listValidAttempts(campaignId: string, limit: number) {
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new RangeError('Competition attempt limit must be a positive safe integer');
    }
    const cursor = (await this.attempts()).find({
      campaignId,
      status: { $in: ['review', 'valid'] },
    }).sort({ score: -1, gameTimeMs: 1, finishedAt: 1, attemptId: 1 });

    let rows: CompetitionAttemptRecord[];
    try {
      rows = await selectTopCompetitionAttempts(cursor, limit);
    } finally {
      await cursor.close();
    }

    const normalizedWallets = [...new Set(rows.map((row) => row.walletAddress.toLowerCase()))];
    const participants = normalizedWallets.length > 0
      ? await (await this.participants()).find({
        campaignId,
        walletAddress: { $in: normalizedWallets },
      }).project({ _id: 0, walletAddress: 1, alias: 1 }).toArray()
      : [];
    const aliasByWallet = new Map(
      participants.map((participant) => [participant.walletAddress.toLowerCase(), participant.alias]),
    );

    return rows.map((row) => withoutMongoId({
      ...row,
      playerAlias: aliasByWallet.get(row.walletAddress.toLowerCase()) ?? row.playerAlias,
    }) as CompetitionAttemptRecord);
  }
}
