#!/usr/bin/env tsx

import 'dotenv/config';

import { randomUUID } from 'node:crypto';

import { type Document, MongoClient } from 'mongodb';

import {
  STAGING_ECONOMY_DATABASE,
  STAGING_STAKING_RESET_AUDITS_COLLECTION,
  STAGING_STAKING_RESETS_COLLECTION,
  stagingStakingResetId,
} from '../src/lib/treasure-hunt-competition/server/staging-staking-reset';

const APPLY_CONFIRMATION = 'RESET_STAKING_COMPETITION_WALLET_STAGING';
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

function argumentValue(argv: readonly string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArguments(argv: readonly string[]) {
  const wallet = argumentValue(argv, '--wallet')?.trim().toLowerCase();
  const campaignId = argumentValue(argv, '--campaign')?.trim();
  const apply = argv.includes('--apply');
  const dryRun = argv.includes('--dry-run');
  if (!wallet || !ADDRESS_PATTERN.test(wallet)) throw new Error('--wallet must be a valid EVM address');
  if (!campaignId) throw new Error('--campaign is required');
  if (apply === dryRun) throw new Error('Use exactly one of --dry-run or --apply');
  if (apply && argumentValue(argv, '--confirm') !== APPLY_CONFIRMATION) {
    throw new Error(`--apply requires --confirm ${APPLY_CONFIRMATION}`);
  }
  return { wallet, campaignId, apply };
}

function requireStagingEnvironment(environment: NodeJS.ProcessEnv) {
  if (environment.APP_ENV !== 'staging' || environment.STAGING_ONLY_GUARD !== 'true') {
    throw new Error('Reset is staging-only and requires APP_ENV=staging and STAGING_ONLY_GUARD=true');
  }
  if (environment.CHAIN_INDEXER_DB_NAME !== STAGING_ECONOMY_DATABASE) {
    throw new Error(`CHAIN_INDEXER_DB_NAME must equal ${STAGING_ECONOMY_DATABASE}`);
  }
  const mongoUrl = environment.CHAIN_INDEXER_MONGO_URL?.trim();
  if (!mongoUrl) throw new Error('CHAIN_INDEXER_MONGO_URL is required');
  const parsed = new URL(mongoUrl);
  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('CHAIN_INDEXER_MONGO_URL must be a MongoDB URL');
  }
  const urlDatabase = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (urlDatabase !== STAGING_ECONOMY_DATABASE) {
    throw new Error(`CHAIN_INDEXER_MONGO_URL must explicitly target ${STAGING_ECONOMY_DATABASE}`);
  }
  return mongoUrl;
}

function exactAddressFilter(address: string) {
  const escaped = address.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: `^${escaped}$`, $options: 'i' };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const mongoUrl = requireStagingEnvironment(process.env);
  const client = new MongoClient(mongoUrl);
  try {
    await client.connect();
    const db = client.db(STAGING_ECONOMY_DATABASE);
    const campaign = await db.collection('presale_game_campaigns').findOne({
      campaignId: options.campaignId,
      eligibilityKind: 'uki_staking',
    });
    if (!campaign) throw new Error('Active UKI staking campaign not found');
    if (
      typeof campaign.startsAt !== 'string'
      || typeof campaign.endsAt !== 'string'
      || typeof campaign.stakingContractAddress !== 'string'
      || !Number.isSafeInteger(campaign.stakingChainId)
    ) throw new Error('Stored UKI staking campaign is invalid');

    const cutoffAt = Math.min(Date.now(), Date.parse(campaign.endsAt));
    const latestUnstake = await db.collection('chain_events').findOne({
      chain: 'BSC',
      chainId: campaign.stakingChainId,
      contractAlias: 'UKI_STAKING',
      contractAddress: exactAddressFilter(campaign.stakingContractAddress),
      eventName: 'Unstaked',
      status: 'projected',
      'normalized.accountNormalized': options.wallet,
      timestampMs: { $gte: Date.parse(campaign.startsAt), $lte: cutoffAt },
    }, { sort: { blockNumber: -1, logIndex: -1, _id: -1 } });
    if (
      !latestUnstake
      || typeof latestUnstake._id !== 'string'
      || !Number.isSafeInteger(latestUnstake.blockNumber)
      || !Number.isSafeInteger(latestUnstake.logIndex)
    ) throw new Error('No valid campaign Unstaked event exists for this wallet');

    const resetId = stagingStakingResetId(options.campaignId, options.wallet);
    const [participant, attempts, previousReset] = await Promise.all([
      db.collection('presale_game_participants').findOne({
        campaignId: options.campaignId,
        walletAddress: options.wallet,
      }),
      db.collection('presale_game_attempts').find({
        campaignId: options.campaignId,
        walletAddress: options.wallet,
      }).sort({ createdAt: 1 }).toArray(),
      db.collection<Document & { _id: string }>(STAGING_STAKING_RESETS_COLLECTION)
        .findOne({ _id: resetId }),
    ]);

    const summary = {
      campaignId: options.campaignId,
      walletAddress: options.wallet,
      ignoredThroughEventId: latestUnstake._id,
      ignoredThroughBlock: latestUnstake.blockNumber,
      ignoredThroughLogIndex: latestUnstake.logIndex,
      attemptsToArchive: attempts.length,
      participantToArchive: Boolean(participant),
      replacesPreviousReset: Boolean(previousReset),
    };
    if (!options.apply) {
      console.log(JSON.stringify({ valid: true, apply: false, ...summary }, null, 2));
      return;
    }

    const resetAt = new Date();
    const auditId = randomUUID();
    await Promise.all([
      db.collection<Document & { _id: string }>(STAGING_STAKING_RESETS_COLLECTION).createIndex(
        { campaignId: 1, walletAddress: 1 },
        { name: 'competition_staking_qa_reset_wallet', unique: true },
      ),
      db.collection<Document & { _id: string }>(STAGING_STAKING_RESET_AUDITS_COLLECTION)
        .createIndex(
        { campaignId: 1, walletAddress: 1, resetAt: -1 },
        { name: 'competition_staking_qa_reset_audit_wallet' },
        ),
    ]);
    const session = client.startSession();
    try {
      await session.withTransaction(async () => {
        await db.collection<Document & { _id: string }>(STAGING_STAKING_RESET_AUDITS_COLLECTION)
          .insertOne({
          _id: auditId,
          resetAt,
          resetBy: 'staging-cli',
          ...summary,
          participant,
          attempts,
          previousReset,
          }, { session });
        await db.collection<Document & { _id: string }>(STAGING_STAKING_RESETS_COLLECTION).updateOne(
          { _id: resetId },
          {
            $set: {
              campaignId: options.campaignId,
              walletAddress: options.wallet,
              ignoreUnstakesThroughEventId: latestUnstake._id,
              ignoreUnstakesThroughBlock: latestUnstake.blockNumber,
              ignoreUnstakesThroughLogIndex: latestUnstake.logIndex,
              resetAt,
              resetBy: 'staging-cli',
              auditId,
            },
          },
          { upsert: true, session },
        );
        await db.collection('presale_game_attempts').deleteMany({
          campaignId: options.campaignId,
          walletAddress: options.wallet,
        }, { session });
        await db.collection('presale_game_participants').deleteOne({
          campaignId: options.campaignId,
          walletAddress: options.wallet,
        }, { session });
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
    } finally {
      await session.endSession();
    }
    console.log(JSON.stringify({ success: true, apply: true, auditId, ...summary }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  const message = (error instanceof Error ? error.message : 'Unknown reset error')
    .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[REDACTED_MONGODB_URL]');
  console.error(`Staking competition wallet reset failed: ${message}`);
  process.exitCode = 1;
});
