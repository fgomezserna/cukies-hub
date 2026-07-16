import 'server-only';

import type { Db, Document } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';

import type { CompetitionAttemptStatus, CompetitionConfig } from '..';
import {
  assertCompetitionCampaignMatches,
  CompetitionCampaignDriftError,
} from './mongo-repository';
import type {
  CompetitionSettlementCloseSource,
  CompetitionSettlementSnapshot,
  CompetitionSettlementSnapshotRepository,
  SettlementAttemptRecord,
  SettlementParticipantRecord,
  SettlementPurchaseRecord,
} from './settlement-close';
import { CompetitionSettlementCloseError } from './settlement-close';

const CAMPAIGNS_COLLECTION = 'presale_game_campaigns';
const ATTEMPTS_COLLECTION = 'presale_game_attempts';
const COMPETITION_PARTICIPANTS_COLLECTION = 'presale_game_participants';
const PURCHASES_COLLECTION = 'presale_purchases';
const PARTICIPANTS_COLLECTION = 'presale_participants';
const SETTLEMENTS_COLLECTION = 'presale_game_settlements';
const CHAIN_CURSORS_COLLECTION = 'chain_cursors';
const CHAIN_EVENTS_COLLECTION = 'chain_events';
const SETTLEMENT_UNIQUE_INDEX = 'uniq_presale_game_settlement_campaign_rules';
const CANONICAL_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const NON_ZERO_EVM_WALLET_PATTERN = /^0x(?!0{40}$)[0-9a-f]{40}$/i;

type GetDb = () => Promise<Db>;

const ATTEMPT_PROJECTION = {
  _id: 0,
  attemptId: 1,
  campaignId: 1,
  rulesVersion: 1,
  gameId: 1,
  mode: 1,
  walletAddress: 1,
  playerAlias: 1,
  score: 1,
  gameTimeMs: 1,
  startedAt: 1,
  finishedAt: 1,
  status: 1,
} as const;

const PURCHASE_PROJECTION = {
  _id: 0,
  eventId: 1,
  buyerWalletAddress: 1,
  ukiAmountRaw: 1,
  confirmedAt: 1,
} as const;

const PARTICIPANT_PROJECTION = {
  _id: 0,
  normalizedWalletAddress: 1,
  lockedSponsorWalletAddress: 1,
} as const;

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function number(value: unknown) {
  return typeof value === 'number' ? value : Number.NaN;
}

function nullableText(value: unknown) {
  if (value === null || value === undefined) return null;
  return text(value);
}

function isoDate(value: unknown) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '';
  return text(value);
}

function queryBoundary(value: string, field: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError(`${field} must be a valid date`);
  }
  return date;
}

function contractAddressQuery(address: string) {
  return { $regex: `^${address}$`, $options: 'i' } as const;
}

function attemptFromDocument(row: Document): SettlementAttemptRecord {
  return {
    attemptId: text(row.attemptId),
    campaignId: text(row.campaignId),
    rulesVersion: text(row.rulesVersion),
    gameId: text(row.gameId),
    mode: text(row.mode),
    walletAddress: text(row.walletAddress),
    playerAlias: text(row.playerAlias),
    score: number(row.score),
    gameTimeMs: number(row.gameTimeMs),
    startedAt: text(row.startedAt),
    finishedAt: nullableText(row.finishedAt),
    status: text(row.status) as CompetitionAttemptStatus,
  };
}

function purchaseFromDocument(row: Document): SettlementPurchaseRecord {
  return {
    eventId: text(row.eventId),
    walletAddress: text(row.buyerWalletAddress),
    ukiPurchasedRaw: text(row.ukiAmountRaw),
    confirmedAt: isoDate(row.confirmedAt),
  };
}

function participantFromDocument(row: Document): SettlementParticipantRecord {
  return {
    walletAddress: text(row.normalizedWalletAddress),
    lockedSponsorWalletAddress: nullableText(row.lockedSponsorWalletAddress),
  };
}

function withoutMongoId(
  document: (CompetitionSettlementSnapshot & { _id?: unknown }) | null,
) {
  if (!document) return null;
  const { _id: _ignored, ...snapshot } = document;
  return snapshot as CompetitionSettlementSnapshot;
}

function cloneSnapshot(snapshot: CompetitionSettlementSnapshot) {
  return JSON.parse(JSON.stringify(snapshot)) as CompetitionSettlementSnapshot;
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

/**
 * Authoritative close input backed by the same indexer database that owns the
 * confirmed presale purchase and locked sponsor records.
 */
export class MongoCompetitionSettlementSource implements CompetitionSettlementCloseSource {
  constructor(private readonly getDb: GetDb = getIndexerDb) {}

  async assertReady(campaign: CompetitionConfig) {
    const db = await this.getDb();
    const storedCampaign = await db.collection(CAMPAIGNS_COLLECTION).findOne({
      campaignId: campaign.campaignId,
    });
    if (!storedCampaign) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        `Stored campaign ${campaign.campaignId} is missing`,
      );
    }
    try {
      assertCompetitionCampaignMatches(storedCampaign, campaign);
    } catch (error) {
      if (error instanceof CompetitionCampaignDriftError) {
        throw new CompetitionSettlementCloseError(
          'settlement_input_conflict',
          `Stored campaign drift detected for ${campaign.campaignId}`,
        );
      }
      throw error;
    }

    const cursor = await db.collection(CHAIN_CURSORS_COLLECTION).findOne({
      chain: 'BSC',
      contractAlias: 'PRESALE',
      contractAddress: contractAddressQuery(campaign.presaleContractAddress),
      eventName: 'Purchased',
    });
    const processedFromBlock = cursor?.processedFromBlock;
    const processedFromTimestampMs = cursor?.processedFromTimestampMs;
    const processedThroughBlock = cursor?.processedThroughBlock;
    const processedThroughTimestampMs = cursor?.processedThroughTimestampMs;
    if (
      !Number.isSafeInteger(processedFromBlock) ||
      Number(processedFromBlock) < 0 ||
      !Number.isSafeInteger(processedFromTimestampMs) ||
      Number(processedFromTimestampMs) < 0 ||
      Number(processedFromTimestampMs) > Date.parse(campaign.startsAt) ||
      !Number.isSafeInteger(processedThroughBlock) ||
      Number(processedThroughBlock) < 0 ||
      Number(processedFromBlock) > Number(processedThroughBlock) ||
      !Number.isSafeInteger(processedThroughTimestampMs) ||
      Number(processedThroughTimestampMs) <= Date.parse(campaign.endsAt)
    ) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'The BSC presale indexer does not cover the full campaign window',
      );
    }

    const unresolvedPurchase = await db.collection(CHAIN_EVENTS_COLLECTION).findOne(
      {
        chain: 'BSC',
        contractAlias: 'PRESALE',
        contractAddress: contractAddressQuery(campaign.presaleContractAddress),
        eventName: 'Purchased',
        timestampMs: {
          $gte: Date.parse(campaign.startsAt),
          $lte: Date.parse(campaign.endsAt),
        },
        status: { $ne: 'projected' },
      },
      { projection: { _id: 1 } },
    );
    if (unresolvedPurchase) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'A presale purchase in the campaign window is not projected',
      );
    }

    const validAttemptShape = {
      campaignId: campaign.campaignId,
      rulesVersion: campaign.rulesVersion,
      gameId: campaign.gameId,
      mode: campaign.mode,
      attemptId: { $type: 'string', $regex: /\S/ },
      walletAddress: { $type: 'string', $regex: NON_ZERO_EVM_WALLET_PATTERN },
      playerAlias: { $type: 'string', $regex: /\S/ },
      score: { $type: 'number', $gte: 0, $lte: Number.MAX_SAFE_INTEGER },
      gameTimeMs: { $type: 'number', $gte: 0, $lte: Number.MAX_SAFE_INTEGER },
      startedAt: {
        $type: 'string',
        $regex: CANONICAL_UTC_PATTERN,
        $gte: campaign.startsAt,
        $lte: campaign.endsAt,
      },
      finishedAt: {
        $type: 'string',
        $regex: CANONICAL_UTC_PATTERN,
        $lte: campaign.endsAt,
      },
      $expr: {
        $and: [
          {
            $eq: [
              '$score',
              { $convert: { input: '$score', to: 'long', onError: null, onNull: null } },
            ],
          },
          {
            $eq: [
              '$gameTimeMs',
              { $convert: { input: '$gameTimeMs', to: 'long', onError: null, onNull: null } },
            ],
          },
          {
            $eq: [
              {
                $dateToString: {
                  date: {
                    $convert: { input: '$startedAt', to: 'date', onError: null, onNull: null },
                  },
                  format: '%Y-%m-%dT%H:%M:%S.%LZ',
                  timezone: 'UTC',
                  onNull: null,
                },
              },
              '$startedAt',
            ],
          },
          {
            $eq: [
              {
                $dateToString: {
                  date: {
                    $convert: { input: '$finishedAt', to: 'date', onError: null, onNull: null },
                  },
                  format: '%Y-%m-%dT%H:%M:%S.%LZ',
                  timezone: 'UTC',
                  onNull: null,
                },
              },
              '$finishedAt',
            ],
          },
          { $gte: ['$finishedAt', '$startedAt'] },
        ],
      },
    };
    const malformedAttempt = await db.collection(ATTEMPTS_COLLECTION).findOne(
      {
        campaignId: campaign.campaignId,
        status: { $in: ['review', 'valid'] },
        $nor: [validAttemptShape],
      },
      { projection: { _id: 0, attemptId: 1 } },
    );
    if (malformedAttempt) {
      throw new CompetitionSettlementCloseError(
        'invalid_settlement_input',
        `Malformed adjudicated attempt: ${text(malformedAttempt.attemptId) || 'unknown'}`,
      );
    }

    // Fence gameplay before taking the create-once snapshot. A finish already
    // durably appended is preserved for the recovery saga; every other active
    // attempt becomes abandoned, so an in-flight append loses its exact CAS.
    const fencedAt = new Date().toISOString();
    await db.collection(ATTEMPTS_COLLECTION).updateMany(
      {
        campaignId: campaign.campaignId,
        status: 'active',
        finishPendingAuthority: { $ne: true },
      },
      {
        $set: {
          status: 'abandoned',
          finishedAt: fencedAt,
          updatedAt: fencedAt,
        },
      },
    );
    const pendingFinish = await db.collection(ATTEMPTS_COLLECTION).findOne(
      {
        campaignId: campaign.campaignId,
        status: 'active',
        finishPendingAuthority: true,
      },
      { projection: { _id: 1 } },
    );
    if (pendingFinish) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'A competition finish is still awaiting GameSession authority',
      );
    }
  }

  async listAttempts(input: {
    campaignId: string;
    rulesVersion: string;
    gameId: string;
    mode: string;
    startsAt: string;
    endsAt: string;
    maxWinningAttemptsPerWallet: number;
  }) {
    const rows = await (await this.getDb())
      .collection(ATTEMPTS_COLLECTION)
      .aggregate([
        {
          $match: {
            campaignId: input.campaignId,
            rulesVersion: input.rulesVersion,
            gameId: input.gameId,
            mode: input.mode,
            status: { $in: ['review', 'valid'] },
            walletAddress: { $type: 'string' },
            score: { $type: 'number', $gte: 0, $lte: Number.MAX_SAFE_INTEGER },
            gameTimeMs: { $type: 'number', $gte: 0, $lte: Number.MAX_SAFE_INTEGER },
            startedAt: { $type: 'string', $gte: input.startsAt, $lte: input.endsAt },
            finishedAt: { $type: 'string', $lte: input.endsAt },
            $expr: {
              $and: [
                { $eq: ['$score', { $trunc: '$score' }] },
                { $eq: ['$gameTimeMs', { $trunc: '$gameTimeMs' }] },
              ],
            },
          },
        },
        { $set: { __normalizedWallet: { $toLower: '$walletAddress' } } },
        {
          $setWindowFields: {
            partitionBy: '$__normalizedWallet',
            sortBy: { score: -1, gameTimeMs: 1, finishedAt: 1, attemptId: 1 },
            output: { __walletRank: { $documentNumber: {} } },
          },
        },
        { $match: { __walletRank: { $lte: input.maxWinningAttemptsPerWallet } } },
        { $sort: { score: -1, gameTimeMs: 1, finishedAt: 1, attemptId: 1 } },
        {
          $lookup: {
            from: COMPETITION_PARTICIPANTS_COLLECTION,
            let: {
              attemptCampaignId: '$campaignId',
              attemptWalletAddress: '$__normalizedWallet',
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ['$campaignId', '$$attemptCampaignId'] },
                      { $eq: ['$walletAddress', '$$attemptWalletAddress'] },
                    ],
                  },
                },
              },
              { $project: { _id: 0, alias: 1 } },
              { $limit: 1 },
            ],
            as: '__participant',
          },
        },
        {
          $set: {
            playerAlias: {
              $ifNull: [{ $arrayElemAt: ['$__participant.alias', 0] }, '$playerAlias'],
            },
          },
        },
        { $project: ATTEMPT_PROJECTION },
      ], { allowDiskUse: true })
      .toArray();

    return rows.map(attemptFromDocument);
  }

  async listPurchases(input: {
    presaleContractAddress: string;
    startsAt: string;
    endsAt: string;
  }) {
    const startsAt = queryBoundary(input.startsAt, 'startsAt');
    const endsAt = queryBoundary(input.endsAt, 'endsAt');
    const rows = await (await this.getDb())
      .collection(PURCHASES_COLLECTION)
      .find({
        contractAddress: contractAddressQuery(input.presaleContractAddress),
        confirmedAt: { $gte: startsAt, $lte: endsAt },
      })
      .project(PURCHASE_PROJECTION)
      .toArray();

    return rows.map(purchaseFromDocument);
  }

  async listParticipants(input: { walletAddresses: readonly string[] }) {
    const normalizedWalletAddresses = [...new Set(
      input.walletAddresses.map((walletAddress) => walletAddress.trim().toLowerCase()),
    )];
    if (normalizedWalletAddresses.length === 0) return [];

    const rows = await (await this.getDb())
      .collection(PARTICIPANTS_COLLECTION)
      .find({ normalizedWalletAddress: { $in: normalizedWalletAddresses } })
      .project(PARTICIPANT_PROJECTION)
      .toArray();

    return rows.map(participantFromDocument);
  }
}

/** Durable create-once store for the auditable settlement snapshot. */
export class MongoCompetitionSettlementRepository
implements CompetitionSettlementSnapshotRepository {
  private indexesPromise: Promise<void> | null = null;

  constructor(private readonly getDb: GetDb = getIndexerDb) {}

  private async collection() {
    return (await this.getDb()).collection<CompetitionSettlementSnapshot>(SETTLEMENTS_COLLECTION);
  }

  private async ensureIndexes() {
    if (!this.indexesPromise) {
      this.indexesPromise = this.collection()
        .then((collection) => collection.createIndex(
          { campaignId: 1, rulesVersion: 1 },
          { unique: true, name: SETTLEMENT_UNIQUE_INDEX },
        ))
        .then(() => undefined);
    }

    try {
      await this.indexesPromise;
    } catch (error) {
      this.indexesPromise = null;
      throw error;
    }
  }

  async find(campaignId: string, rulesVersion: string) {
    await this.ensureIndexes();
    return withoutMongoId(await (await this.collection()).findOne(
      { campaignId, rulesVersion },
      { projection: { _id: 0 } },
    ));
  }

  async saveIfAbsent(snapshot: CompetitionSettlementSnapshot) {
    await this.ensureIndexes();
    const collection = await this.collection();
    const candidate = cloneSnapshot(snapshot);

    try {
      await collection.insertOne(candidate);
      return { created: true, snapshot: cloneSnapshot(snapshot) };
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;

      const existing = withoutMongoId(await collection.findOne(
        { campaignId: snapshot.campaignId, rulesVersion: snapshot.rulesVersion },
        { projection: { _id: 0 } },
      ));
      if (!existing) {
        throw new Error('Competition settlement duplicate was not readable after insert race');
      }
      return { created: false, snapshot: existing };
    }
  }
}
