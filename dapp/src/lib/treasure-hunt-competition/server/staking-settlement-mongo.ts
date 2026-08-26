import 'server-only';

import type { Db, Document } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import type { CompetitionConfig } from '..';
import {
  assertCompetitionCampaignMatches,
  CompetitionCampaignDriftError,
} from './mongo-repository';
import { CompetitionSettlementCloseError } from './settlement-close';
import { MongoCompetitionSettlementSource } from './settlement-mongo';
import { MongoCompetitionStakingSource, readTotalStakedAt } from './staking-eligibility';
import type {
  CompetitionStakingSettlementCloseSource,
  CompetitionStakingSettlementSnapshot,
  CompetitionStakingSettlementSnapshotRepository,
} from './staking-settlement-close';

const CAMPAIGNS_COLLECTION = 'presale_game_campaigns';
const ATTEMPTS_COLLECTION = 'presale_game_attempts';
const SETTLEMENTS_COLLECTION = 'staking_game_settlements';
const UNIQUE_INDEX = 'uniq_staking_game_settlement_campaign_rules';
const STAKING_EVENTS = ['Staked', 'Unstaked'] as const;
const HEALTH_WALLET = `0x${'0'.repeat(39)}1`;

type GetDb = () => Promise<Db>;

function exactAddressFilter(address: string) {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: `^${escaped}$`, $options: 'i' } as const;
}

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function withoutMongoId(
  row: (CompetitionStakingSettlementSnapshot & { _id?: unknown }) | null,
) {
  if (!row) return null;
  const { _id: _ignored, ...snapshot } = row;
  return snapshot as CompetitionStakingSettlementSnapshot;
}

export class MongoCompetitionStakingSettlementSource
implements CompetitionStakingSettlementCloseSource {
  private readonly attemptSource: MongoCompetitionSettlementSource;
  private readonly stakingSource: MongoCompetitionStakingSource;

  constructor(private readonly getDb: GetDb = getIndexerDb) {
    this.attemptSource = new MongoCompetitionSettlementSource(getDb);
    this.stakingSource = new MongoCompetitionStakingSource(getDb);
  }

  async assertReady(campaign: CompetitionConfig, now: Date) {
    if (
      campaign.eligibilityKind !== 'uki_staking' ||
      !campaign.stakingContractAddress ||
      !campaign.stakingChainId
    ) {
      throw new CompetitionSettlementCloseError(
        'invalid_settlement_input',
        'Staking settlement requires a staking campaign',
      );
    }
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

    const snapshot = await this.stakingSource.getSnapshot({
      campaign,
      walletAddress: HEALTH_WALLET,
      now,
    });
    if (!snapshot.ready) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        `Staking indexer is not healthy: ${snapshot.issues.join(',')}`,
      );
    }
    const address = campaign.stakingContractAddress;
    const cursorRows = await db.collection('chain_cursors').find({
      chain: 'BSC',
      contractAlias: 'UKI_STAKING',
      contractAddress: exactAddressFilter(address),
      eventName: { $in: [...STAKING_EVENTS] },
    }, { maxTimeMS: 2_000 }).toArray();
    if (cursorRows.length !== STAKING_EVENTS.length || cursorRows.some((cursor) => (
      !Number.isSafeInteger(cursor.processedFromTimestampMs) ||
      Number(cursor.processedFromTimestampMs) > Date.parse(campaign.startsAt) ||
      !Number.isSafeInteger(cursor.processedThroughTimestampMs) ||
      Number(cursor.processedThroughTimestampMs) <= Date.parse(campaign.endsAt)
    ))) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'The staking indexer does not cover the full campaign window',
      );
    }
    const unresolvedEvent = await db.collection('chain_events').findOne({
      chain: 'BSC',
      chainId: campaign.stakingChainId,
      contractAlias: 'UKI_STAKING',
      contractAddress: exactAddressFilter(address),
      eventName: { $in: [...STAKING_EVENTS] },
      timestampMs: {
        $gte: Date.parse(campaign.startsAt),
        $lte: Date.parse(campaign.endsAt),
      },
      status: { $ne: 'projected' },
    }, { projection: { _id: 1 }, maxTimeMS: 2_000 });
    if (unresolvedEvent) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'A staking event in the campaign window is not projected',
      );
    }

    const fencedAt = now.toISOString();
    await db.collection(ATTEMPTS_COLLECTION).updateMany(
      {
        campaignId: campaign.campaignId,
        status: 'active',
        finishPendingAuthority: { $ne: true },
      },
      { $set: { status: 'abandoned', finishedAt: fencedAt, updatedAt: fencedAt } },
    );
    const pendingFinish = await db.collection(ATTEMPTS_COLLECTION).findOne({
      campaignId: campaign.campaignId,
      status: 'active',
      finishPendingAuthority: true,
    }, { projection: { _id: 1 }, maxTimeMS: 2_000 });
    if (pendingFinish) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'A competition finish is still awaiting GameSession authority',
      );
    }
  }

  listAttempts(input: Parameters<CompetitionStakingSettlementCloseSource['listAttempts']>[0]) {
    return this.attemptSource.listAttempts(input);
  }

  async getCloseState(campaign: CompetitionConfig, now: Date) {
    const snapshot = await this.stakingSource.getSnapshot({
      campaign,
      walletAddress: HEALTH_WALLET,
      now,
    });
    if (
      !snapshot.ready ||
      snapshot.indexedThroughBlock === null ||
      snapshot.indexedAt === null
    ) {
      throw new CompetitionSettlementCloseError(
        'settlement_source_not_ready',
        'The staking close snapshot is not ready',
      );
    }
    const db = await this.getDb();
    const totalAtClose = await readTotalStakedAt({
      db,
      stakingContractAddress: campaign.stakingContractAddress as string,
      stakingChainId: campaign.stakingChainId as number,
      through: new Date(campaign.endsAt),
    });
    const wallets = await db.collection('chain_events').distinct(
      'normalized.accountNormalized',
      {
        chain: 'BSC',
        chainId: campaign.stakingChainId,
        contractAlias: 'UKI_STAKING',
        contractAddress: exactAddressFilter(campaign.stakingContractAddress as string),
        eventName: 'Unstaked',
        status: 'projected',
        timestampMs: {
          $gte: Date.parse(campaign.startsAt),
          $lte: Date.parse(campaign.endsAt),
        },
      },
      { maxTimeMS: 5_000 },
    );
    return {
      totalStakedUkiRaw: totalAtClose.totalStakedUkiRaw,
      totalStakedSourceBlock: totalAtClose.sourceBlock,
      totalStakedSourceBlockHash: totalAtClose.sourceBlockHash,
      totalStakedSourceEventId: totalAtClose.sourceEventId,
      indexedThroughBlock: snapshot.indexedThroughBlock,
      indexedAt: snapshot.indexedAt,
      disqualifiedWalletAddresses: wallets.filter((wallet): wallet is string => (
        typeof wallet === 'string' && /^0x[0-9a-f]{40}$/i.test(wallet)
      )).map((wallet) => wallet.toLowerCase()).sort((left, right) => left.localeCompare(right, 'en')),
    };
  }
}

export class MongoCompetitionStakingSettlementRepository
implements CompetitionStakingSettlementSnapshotRepository {
  constructor(private readonly getDb: GetDb = getIndexerDb) {}

  private async collection() {
    return (await this.getDb()).collection<CompetitionStakingSettlementSnapshot & Document>(
      SETTLEMENTS_COLLECTION,
    );
  }

  async find(campaignId: string, rulesVersion: string) {
    return withoutMongoId(await (await this.collection()).findOne({ campaignId, rulesVersion }));
  }

  async saveIfAbsent(snapshot: CompetitionStakingSettlementSnapshot) {
    const collection = await this.collection();
    await collection.createIndex(
      { campaignId: 1, rulesVersion: 1 },
      { unique: true, name: UNIQUE_INDEX },
    );
    try {
      await collection.insertOne(snapshot as CompetitionStakingSettlementSnapshot & Document);
      return { created: true, snapshot };
    } catch (error) {
      if (!duplicateKey(error)) throw error;
      const existing = await this.find(snapshot.campaignId, snapshot.rulesVersion);
      if (!existing) throw new Error('Staking settlement duplicate was not readable after insert race');
      return { created: false, snapshot: existing };
    }
  }
}
