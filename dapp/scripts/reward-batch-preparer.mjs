#!/usr/bin/env node

import { MongoClient } from 'mongodb';

import { prepareNextRewardPublicationPlan } from './lib/reward-publication-preparer.mjs';
import {
  loadRewardBatchPreparerConfig,
  publicRewardBatchPreparerConfig,
} from './reward-batch-publisher-policy.mjs';

const config = loadRewardBatchPreparerConfig(process.env);
console.log(JSON.stringify({
  event: 'reward_batch_preparer_started',
  config: publicRewardBatchPreparerConfig(config),
}));

const mongo = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 10_000 });
try {
  await mongo.connect();
  const db = mongo.db(config.databaseName);
  const prepared = await prepareNextRewardPublicationPlan({
    db,
    mongoClient: mongo,
    chainId: config.chainId,
    tokenAddress: config.tokenAddress,
    distributorAddress: config.distributorAddress,
    maxCandidates: config.maxCandidates,
    now: new Date(),
  });
  console.log(JSON.stringify(prepared ? {
    event: 'reward_batch_preparer_completed',
    status: prepared.replayed ? 'replayed' : 'prepared',
    accountingId: prepared.plan.accountingId,
    planId: prepared.plan.planId,
    batchId: prepared.plan.batchId,
    claimableTotalRaw: prepared.plan.claimableTotalRaw,
    totalRaw: prepared.plan.totalRaw,
    planStatus: prepared.plan.status,
  } : {
    event: 'reward_batch_preparer_completed',
    status: 'idle',
  }));
} finally {
  await mongo.close();
}
