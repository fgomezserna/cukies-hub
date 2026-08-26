import 'server-only';

import type { Db, Document, Filter } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import type {
  CompetitionConfig,
  CompetitionDisqualificationEvidence,
  CompetitionStakingSnapshot,
} from '..';
import type { CompetitionStakingSource } from './models';

const STAKING_EVENTS = ['Staked', 'Unstaked'] as const;
const PENDING_STATUSES = ['ingested', 'projecting', 'failed'] as const;
const DEFAULT_MAX_INDEXER_AGE_MS = 5 * 60 * 1_000;
const UINT_RAW_PATTERN = /^(0|[1-9][0-9]*)$/;

type StakingSourceEnvironment = Partial<Record<string, string | undefined>>;

function exactAddressFilter(address: string) {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: `^${escaped}$`, $options: 'i' };
}

function validRaw(value: unknown): value is string {
  return typeof value === 'string' && UINT_RAW_PATTERN.test(value);
}

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function optionalPositiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function eventEvidence(event: Document | null): CompetitionDisqualificationEvidence | null {
  if (!event) return null;
  const timestampMs = Number(event.timestampMs);
  const amountRaw = event.normalized?.amountRaw;
  if (
    typeof event._id !== 'string' ||
    typeof event.txHash !== 'string' ||
    !Number.isSafeInteger(event.blockNumber) ||
    !Number.isSafeInteger(timestampMs) ||
    !validRaw(amountRaw)
  ) return null;
  const timestamp = new Date(timestampMs);
  if (Number.isNaN(timestamp.getTime())) return null;
  return {
    eventId: event._id,
    txHash: event.txHash,
    blockNumber: Number(event.blockNumber),
    timestamp: timestamp.toISOString(),
    amountRaw,
  };
}

function closedWindowEnd(campaign: CompetitionConfig, now: Date) {
  return Math.min(now.getTime(), Date.parse(campaign.endsAt));
}

export async function readTotalStakedAt(input: {
  db: Db;
  stakingContractAddress: string;
  stakingChainId: number;
  through: Date;
}) {
  if (!Number.isFinite(input.through.getTime())) {
    throw new TypeError('Staking total cutoff must be a valid date');
  }
  const event = await input.db.collection<Document & { _id: string }>('chain_events').findOne({
    chain: 'BSC',
    chainId: input.stakingChainId,
    contractAlias: 'UKI_STAKING',
    contractAddress: exactAddressFilter(input.stakingContractAddress),
    eventName: { $in: [...STAKING_EVENTS] },
    status: 'projected',
    timestampMs: { $lte: input.through.getTime() },
  }, {
    sort: { blockNumber: -1, logIndex: -1, _id: -1 },
    projection: {
      _id: 1,
      blockNumber: 1,
      blockHash: 1,
      'normalized.totalStakedRaw': 1,
    },
    maxTimeMS: 2_000,
  });
  if (!event) {
    return {
      totalStakedUkiRaw: '0',
      sourceBlock: null,
      sourceBlockHash: null,
      sourceEventId: null,
    } as const;
  }
  const totalStakedUkiRaw = event.normalized?.totalStakedRaw;
  if (
    !validRaw(totalStakedUkiRaw) ||
    !Number.isSafeInteger(event.blockNumber) ||
    typeof event.blockHash !== 'string' ||
    !/^0x[0-9a-f]{64}$/i.test(event.blockHash)
  ) {
    throw new Error('Staking total cutoff event is invalid');
  }
  return {
    totalStakedUkiRaw,
    sourceBlock: Number(event.blockNumber),
    sourceBlockHash: event.blockHash.toLowerCase(),
    sourceEventId: event._id,
  } as const;
}

export class MongoCompetitionStakingSource implements CompetitionStakingSource {
  constructor(
    private readonly getDb: () => Promise<Db> = getIndexerDb,
    private readonly environment: StakingSourceEnvironment = process.env,
    private readonly maxIndexerAgeMs = optionalPositiveInteger(
      process.env.TREASURE_HUNT_COMPETITION_INDEXER_MAX_AGE_MS,
    ) ?? DEFAULT_MAX_INDEXER_AGE_MS,
  ) {}

  private eventScope(campaign: CompetitionConfig): Filter<Document> {
    if (
      campaign.eligibilityKind !== 'uki_staking' ||
      !campaign.stakingContractAddress ||
      !campaign.stakingChainId
    ) {
      throw new Error('Staking eligibility requires a configured staking campaign');
    }
    return {
      chain: 'BSC',
      chainId: campaign.stakingChainId,
      contractAlias: 'UKI_STAKING',
      contractAddress: exactAddressFilter(campaign.stakingContractAddress),
    };
  }

  async getSnapshot(input: {
    campaign: CompetitionConfig;
    walletAddress: string;
    now: Date;
  }): Promise<CompetitionStakingSnapshot> {
    const { campaign, now } = input;
    const walletAddress = input.walletAddress.toLowerCase();
    const db = await this.getDb();
    const scope = this.eventScope(campaign);
    const contractAddress = campaign.stakingContractAddress!.toLowerCase();
    const expectedDeploymentBlock = optionalPositiveInteger(
      this.environment.CHAIN_INDEXER_UKI_STAKING_DEPLOYMENT_BSC_BLOCK,
    );
    const expectedRuntimeCodeHash = this.environment
      .CHAIN_INDEXER_UKI_STAKING_RUNTIME_CODE_HASH?.trim().toLowerCase() ?? null;
    const options = { maxTimeMS: 2_000 } as const;

    const [position, state, cursors, checkpoint, deadLetter, incident, pendingEvent, unstakeEvent] =
      await Promise.all([
        db.collection('uki_staking_positions').findOne(
          { walletNormalized: walletAddress },
          options,
        ),
        db.collection<Document & { _id: string }>('uki_staking_state')
          .findOne({ _id: contractAddress }, options),
        db.collection('chain_cursors').find({
          chain: 'BSC',
          contractAlias: 'UKI_STAKING',
          contractAddress: exactAddressFilter(contractAddress),
          eventName: { $in: [...STAKING_EVENTS] },
        }, options).limit(3).toArray(),
        db.collection<Document & { _id: string }>('chain_bsc_checkpoints')
          .findOne({ _id: 'canonical-safe' }, options),
        db.collection('chain_dead_letters').findOne(
          { chain: 'BSC', contractAlias: 'UKI_STAKING' },
          { ...options, projection: { _id: 1 } },
        ),
        db.collection('chain_integrity_incidents').findOne({
          status: 'open',
          $or: [
            { chain: 'BSC', contractAlias: 'UKI_STAKING' },
            {
              chain: 'BSC',
              type: { $in: [
                'canonical_checkpoint_mismatch',
                'canonical_range_mismatch',
                'canonical_progress_conflict',
                'economy_progress_conflict',
                'economy_transaction_failure',
              ] },
            },
          ],
        }, { ...options, projection: { _id: 1 } }),
        db.collection('chain_events').findOne({
          ...scope,
          status: { $in: [...PENDING_STATUSES] },
          'normalized.accountNormalized': walletAddress,
        }, { ...options, projection: { _id: 1 } }),
        db.collection('chain_events').findOne({
          ...scope,
          eventName: 'Unstaked',
          status: 'projected',
          'normalized.accountNormalized': walletAddress,
          timestampMs: {
            $gte: Date.parse(campaign.startsAt),
            $lte: closedWindowEnd(campaign, now),
          },
        }, { ...options, sort: { timestampMs: 1, blockNumber: 1, logIndex: 1 } }),
      ]);

    const issues: string[] = [];
    const indexedAt = validDate(checkpoint?.checkedAt) ? checkpoint.checkedAt : null;
    const safeBlock = Number(checkpoint?.safeBlockNumber);
    if (!indexedAt || !Number.isSafeInteger(safeBlock)) {
      issues.push('STAKING_CHECKPOINT_MISSING');
    } else if (now.getTime() - indexedAt.getTime() > this.maxIndexerAgeMs) {
      issues.push('STAKING_INDEXER_STALE');
    }
    if (cursors.length !== STAKING_EVENTS.length) {
      issues.push('STAKING_CURSORS_MISSING');
    }
    for (const eventName of STAKING_EVENTS) {
      const cursor = cursors.find((candidate) => candidate.eventName === eventName);
      if (
        !cursor ||
        cursor.bootstrapStatus !== 'verified' ||
        cursor.verifiedChainId !== campaign.stakingChainId ||
        !Number.isSafeInteger(cursor.safeBlock) ||
        typeof cursor.contractAddress !== 'string' ||
        cursor.contractAddress.toLowerCase() !== contractAddress ||
        (expectedDeploymentBlock !== null &&
          cursor.contractDeploymentBlock !== expectedDeploymentBlock) ||
        (expectedRuntimeCodeHash !== null &&
          String(cursor.contractCodeHash).toLowerCase() !== expectedRuntimeCodeHash)
      ) {
        issues.push(`STAKING_CURSOR_${eventName.toUpperCase()}_INVALID`);
      }
    }
    if (
      !state ||
      state.bootstrapStatus !== 'verified' ||
      state.verifiedChainId !== campaign.stakingChainId ||
      state.materializationStatus !== 'consistent' ||
      !validRaw(state.totalStakedRaw)
    ) {
      issues.push('STAKING_STATE_INVALID');
    }
    if (position && !validRaw(position.accountBalanceRaw)) {
      issues.push('STAKING_POSITION_INVALID');
    }
    if (deadLetter) issues.push('STAKING_DEAD_LETTER_OPEN');
    if (incident) issues.push('STAKING_INTEGRITY_INCIDENT_OPEN');
    if (pendingEvent) issues.push('STAKING_WALLET_EVENT_PENDING');

    const disqualificationEvidence = eventEvidence(unstakeEvent);
    if (unstakeEvent && !disqualificationEvidence) {
      issues.push('STAKING_UNSTAKE_EVIDENCE_INVALID');
    }
    return {
      ready: issues.length === 0,
      stakedUkiRaw: validRaw(position?.accountBalanceRaw) ? position.accountBalanceRaw : '0',
      totalStakedUkiRaw: validRaw(state?.totalStakedRaw) ? state.totalStakedRaw : '0',
      indexedThroughBlock: Number.isSafeInteger(safeBlock) ? safeBlock : null,
      indexedAt: indexedAt?.toISOString() ?? null,
      disqualified: Boolean(disqualificationEvidence),
      disqualificationEvidence,
      issues,
    };
  }

  async listDisqualifiedWallets(input: {
    campaign: CompetitionConfig;
    now: Date;
  }): Promise<ReadonlySet<string>> {
    const scope = this.eventScope(input.campaign);
    const db = await this.getDb();
    const wallets = await db.collection('chain_events').distinct(
      'normalized.accountNormalized',
      {
        ...scope,
        eventName: 'Unstaked',
        status: 'projected',
        timestampMs: {
          $gte: Date.parse(input.campaign.startsAt),
          $lte: closedWindowEnd(input.campaign, input.now),
        },
      },
      { maxTimeMS: 5_000 },
    );
    return new Set(
      wallets.filter((wallet): wallet is string => (
        typeof wallet === 'string' && /^0x[0-9a-f]{40}$/i.test(wallet)
      )).map((wallet) => wallet.toLowerCase()),
    );
  }
}
