#!/usr/bin/env node

import { hostname } from 'node:os';

import { MongoClient } from 'mongodb';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

import {
  assertRewardPublicationPlanIntegrity,
  authorizeRewardClaimBatch,
  buildRewardPublicationArtifacts,
} from './lib/reward-batch-publication.mjs';
import {
  loadRewardBatchPublisherConfig,
  publicRewardBatchPublisherConfig,
} from './reward-batch-publisher-policy.mjs';

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function burn(uint256 amount)',
  'function paused() view returns (bool)',
]);
const DISTRIBUTOR_ABI = parseAbi([
  'function owner() view returns (address)',
  'function ukiToken() view returns (address)',
  'function paused() view returns (bool)',
  'function freeBalance() view returns (uint256)',
  'function batches(bytes32 batchId) view returns (bytes32 merkleRoot, bytes32 inputHash, bytes32 metadataHash, uint256 totalAllocated, uint256 totalClaimed, uint64 startsAt, uint64 expiresAt, bool closed)',
  'function publishBatch(bytes32 batchId, bytes32 merkleRoot, bytes32 inputHash, bytes32 metadataHash, uint256 totalAllocated, uint64 startsAt, uint64 expiresAt)',
]);
const ZERO_BYTES32 = `0x${'0'.repeat(64)}`;
const OPERATION_ORDER = [
  'fund_distributor',
  'publish_batch',
  'transfer_treasury',
  'transfer_marketing_development',
  'burn_supply_reduction',
];

const config = loadRewardBatchPublisherConfig(process.env, hostname());
console.log(JSON.stringify({
  event: 'reward_batch_publisher_started',
  config: publicRewardBatchPublisherConfig(config),
}));

if (!config.enabled) {
  setInterval(() => undefined, config.intervalMs);
} else {
  await runEnabledPublisher(config);
}

async function runEnabledPublisher(runtime) {
  const account = privateKeyToAccount(runtime.privateKey);
  const transport = http(runtime.rpcUrl, { timeout: 20_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain: bscTestnet, transport });
  const walletClient = createWalletClient({ account, chain: bscTestnet, transport });
  const mongo = new MongoClient(runtime.mongoUrl, { serverSelectionTimeoutMS: 10_000 });
  await mongo.connect();
  const db = mongo.db(runtime.databaseName);
  await preflight({ runtime, publicClient, db });

  let stopping = false;
  const stop = async (signal) => {
    if (stopping) return;
    stopping = true;
    console.log(JSON.stringify({ event: 'reward_batch_publisher_stopping', signal }));
    await mongo.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));

  const tick = async () => {
    const startedAt = new Date();
    try {
      const result = await runTick({ runtime, db, mongo, publicClient, walletClient, account });
      await writeHeartbeat(db, runtime.schedulerId, 'success', startedAt, result);
      console.log(JSON.stringify({ event: 'reward_batch_publisher_tick', ...result }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await writeHeartbeat(db, runtime.schedulerId, 'failure', startedAt, { message })
        .catch(() => undefined);
      console.error(JSON.stringify({ event: 'reward_batch_publisher_error', message }));
    }
  };
  await tick();
  if (runtime.runOnce) {
    stopping = true;
    await mongo.close();
    return;
  }
  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, runtime.intervalMs));
    if (!stopping) await tick();
  }
}

async function preflight({ runtime, publicClient, db }) {
  const [chainId, distributorCode, tokenCode, owner, token, distributorPaused, tokenPaused, schema] =
    await Promise.all([
      publicClient.getChainId(),
      publicClient.getCode({ address: runtime.distributorAddress }),
      publicClient.getCode({ address: runtime.tokenAddress }),
      publicClient.readContract({
        address: runtime.distributorAddress,
        abi: DISTRIBUTOR_ABI,
        functionName: 'owner',
      }),
      publicClient.readContract({
        address: runtime.distributorAddress,
        abi: DISTRIBUTOR_ABI,
        functionName: 'ukiToken',
      }),
      publicClient.readContract({
        address: runtime.distributorAddress,
        abi: DISTRIBUTOR_ABI,
        functionName: 'paused',
      }),
      publicClient.readContract({
        address: runtime.tokenAddress,
        abi: ERC20_ABI,
        functionName: 'paused',
      }),
      db.collection('economy_schema_metadata').findOne({ _id: 'uki-economy' }),
    ]);
  if (
    chainId !== 97
    || !distributorCode || distributorCode === '0x'
    || !tokenCode || tokenCode === '0x'
    || getAddress(owner) !== runtime.signerAddress
    || getAddress(token) !== runtime.tokenAddress
    || distributorPaused
    || tokenPaused
    || schema?.schemaVersion !== 3
  ) {
    throw new Error('El preflight del publicador no coincide con staging BSC97/schema v3.');
  }
}

async function writeHeartbeat(db, schedulerId, status, startedAt, detail) {
  const now = new Date();
  const id = `scheduler-heartbeat:${schedulerId}`;
  const previous = await db.collection('scheduler_heartbeats').findOne({ _id: id });
  await db.collection('scheduler_heartbeats').updateOne(
    { _id: id },
    {
      $set: {
        schedulerId,
        schedulerKind: 'reward_batch_publisher',
        status,
        lastAttemptAt: startedAt,
        ...(status === 'success'
          ? { lastSuccessAt: now, consecutiveFailures: 0, result: detail }
          : {
              lastFailureAt: now,
              consecutiveFailures: Number(previous?.consecutiveFailures ?? 0) + 1,
              error: detail,
            }),
        updatedAt: now,
      },
      $setOnInsert: { _id: id, createdAt: now },
    },
    { upsert: true },
  );
}

async function runTick(context) {
  const now = new Date();
  let plan = await acquirePlan(context.db, context.runtime, now);
  if (!plan) {
    const prepared = await prepareNextPlan(context.db, context.mongo, context.runtime, now);
    if (!prepared) return { status: 'idle', completedAt: now.toISOString() };
    plan = await acquirePlan(context.db, context.runtime, new Date());
  }
  if (!plan) return { status: 'contended', completedAt: now.toISOString() };
  try {
    assertRewardPublicationPlanIntegrity(plan);
    plan = await ensureAuthorizedBatch(context.db, context.runtime, plan);
    for (const kind of OPERATION_ORDER) {
      plan = await executeOperation(context, plan, kind);
    }
    const batch = plan.batchId
      ? await context.db.collection('reward_claim_batches').findOne({ batchId: plan.batchId })
      : null;
    const publishOperation = plan.operations.find(({ kind }) => kind === 'publish_batch');
    if (
      !plan.batchId
      || (
        batch?.status === 'published'
        && batch.publicationTransactionHash === publishOperation?.transactionHash
      )
    ) {
      plan = await replacePlan(context.db, plan, (current) => ({
        ...current,
        status: 'completed',
        completedAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
      }));
      return { status: 'completed', accountingId: plan.accountingId, planId: plan.planId };
    }
    plan = await replacePlan(context.db, plan, (current) => ({
      ...current,
      status: 'awaiting_projection',
      leaseOwner: null,
      leaseExpiresAt: null,
    }));
    return { status: 'awaiting_projection', accountingId: plan.accountingId, planId: plan.planId };
  } catch (error) {
    await releaseLease(context.db, plan).catch(() => undefined);
    throw error;
  }
}

async function acquirePlan(db, runtime, now) {
  const result = await db.collection('reward_publication_plans').findOneAndUpdate(
    {
      status: { $nin: ['completed', 'blocked'] },
      $or: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { $exists: false } },
        { leaseExpiresAt: { $lte: now } },
        { leaseOwner: runtime.schedulerId },
      ],
    },
    {
      $set: {
        leaseOwner: runtime.schedulerId,
        leaseExpiresAt: new Date(now.getTime() + runtime.leaseMs),
        updatedAt: now,
      },
      $inc: { revision: 1 },
    },
    { sort: { createdAt: 1, _id: 1 }, returnDocument: 'after' },
  );
  return result ?? null;
}

async function prepareNextPlan(db, mongo, runtime, now) {
  const candidates = await db.collection('reward_accounting_allocations').aggregate([
    { $match: { status: 'allocated_offchain', availableAt: { $lte: now } } },
    { $sort: { availableAt: 1, accountingId: 1, _id: 1 } },
    { $group: { _id: '$accountingId', accountingKind: { $first: '$accountingKind' } } },
    { $limit: 50 },
  ]).toArray();
  for (const candidate of candidates) {
    if (await db.collection('reward_publication_plans').findOne({ accountingId: candidate._id })) {
      continue;
    }
    const session = mongo.startSession();
    try {
      let prepared = null;
      await session.withTransaction(async () => {
        const existing = await db.collection('reward_publication_plans').findOne(
          { accountingId: candidate._id },
          { session },
        );
        if (existing) {
          prepared = existing;
          return;
        }
        const allocations = await db.collection('reward_accounting_allocations')
          .find({ accountingId: candidate._id }, { session })
          .sort({ _id: 1 })
          .toArray();
        const accountingCollection = candidate.accountingKind === 'daily'
          ? 'reward_daily_accounting'
          : 'reward_weekly_prize_accounting';
        const accounting = await db.collection(accountingCollection).findOne(
          { _id: candidate._id },
          { session },
        );
        if (!accounting) throw new Error(`No existe el cierre ${candidate._id}.`);
        const rule = await db.collection('economy_rule_versions').findOne({
          scope: 'reward_allocations',
          version: accounting.ruleVersion,
        }, { session });
        const artifacts = buildRewardPublicationArtifacts({
          accountingId: candidate._id,
          accounting,
          rule,
          allocations,
          chainId: runtime.chainId,
          tokenAddress: runtime.tokenAddress,
          distributorAddress: runtime.distributorAddress,
          createdAt: now,
        });
        if (artifacts.proofs.length > 0) {
          await db.collection('reward_claim_proofs').insertMany(artifacts.proofs, { session });
          await db.collection('reward_claim_batches').insertOne(artifacts.batch, { session });
        }
        await db.collection('reward_publication_plans').insertOne(artifacts.plan, { session });
        prepared = artifacts.plan;
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      return prepared;
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 11000) {
        return db.collection('reward_publication_plans').findOne({ accountingId: candidate._id });
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
  return null;
}

async function ensureAuthorizedBatch(db, runtime, plan) {
  if (!plan.batchId) return plan;
  const batches = db.collection('reward_claim_batches');
  const current = await batches.findOne({ batchId: plan.batchId });
  if (!current) throw new Error(`No existe el draft ${plan.batchId}.`);
  if (current.publishAuthorized === true && current.previewOnly === false) return plan;
  const authorized = authorizeRewardClaimBatch(current, new Date(), runtime.claimWindowSeconds);
  const updated = await batches.replaceOne(
    {
      _id: current._id,
      status: 'draft',
      publishAuthorized: false,
      previewOnly: true,
    },
    authorized,
  );
  if (updated.matchedCount !== 1) {
    const replay = await batches.findOne({ batchId: plan.batchId });
    if (replay?.publishAuthorized !== true || replay.previewOnly !== false) {
      throw new Error(`Se perdio el fence de autorizacion ${plan.batchId}.`);
    }
  }
  return replacePlan(db, plan, (document) => ({ ...document, status: 'processing' }));
}

async function executeOperation(context, plan, kind) {
  let operation = plan.operations.find((item) => item.kind === kind);
  if (!operation) throw new Error(`El plan no contiene la operacion ${kind}.`);
  if (operation.status === 'skipped' || operation.status === 'confirmed') return plan;

  const batch = plan.batchId
    ? await context.db.collection('reward_claim_batches').findOne({ batchId: plan.batchId })
    : null;
  if (kind === 'fund_distributor' && operation.status === 'pending') {
    const free = await context.publicClient.readContract({
      address: context.runtime.distributorAddress,
      abi: DISTRIBUTOR_ABI,
      functionName: 'freeBalance',
    });
    const required = BigInt(operation.amountRaw);
    if (free >= required) {
      return updateOperation(context.db, plan, kind, (current) => ({
        ...current,
        status: 'confirmed',
        executedAmountRaw: '0',
        satisfiedByExistingBalanceRaw: required.toString(10),
        confirmedAt: new Date(),
      }));
    }
    operation = { ...operation, executedAmountRaw: (required - free).toString(10) };
  }
  if (kind === 'publish_batch' && operation.status === 'pending') {
    if (!batch) throw new Error(`No existe el batch ${plan.batchId}.`);
    const onChain = await context.publicClient.readContract({
      address: context.runtime.distributorAddress,
      abi: DISTRIBUTOR_ABI,
      functionName: 'batches',
      args: [batch.batchId],
    });
    if (onChain[0] !== ZERO_BYTES32) {
      if (
        onChain[0].toLowerCase() !== batch.merkleRoot.toLowerCase()
        || onChain[1].toLowerCase() !== batch.canonicalInputHash.toLowerCase()
        || onChain[2].toLowerCase() !== batch.metadataHash.toLowerCase()
        || onChain[3] !== BigInt(batch.totalAllocatedRaw)
      ) throw new Error(`El batch on-chain ${batch.batchId} contradice el draft.`);
      return updateOperation(context.db, plan, kind, (current) => ({
        ...current,
        status: 'confirmed',
        satisfiedByExistingState: true,
        confirmedAt: new Date(),
      }));
    }
  }

  if (operation.status === 'pending') {
    const { to, data, executedAmountRaw } = transactionFor(
      context.runtime,
      plan,
      operation,
      batch,
    );
    const request = await context.walletClient.prepareTransactionRequest({
      account: context.account,
      to,
      data,
      value: 0n,
    });
    const signedRawTransaction = await context.walletClient.signTransaction(request);
    const transactionHash = keccak256(signedRawTransaction);
    plan = await updateOperation(context.db, plan, kind, (current) => ({
      ...current,
      status: 'signed',
      executedAmountRaw,
      transactionHash,
      signedRawTransaction,
      nonce: Number(request.nonce),
      signedAt: new Date(),
    }));
    operation = plan.operations.find((item) => item.kind === kind);
  }
  if (operation.status !== 'signed' || !operation.signedRawTransaction || !operation.transactionHash) {
    throw new Error(`La operacion ${kind} no tiene una transaccion durable.`);
  }
  try {
    await context.walletClient.sendRawTransaction({
      serializedTransaction: operation.signedRawTransaction,
    });
  } catch (error) {
    const existing = await context.publicClient.getTransaction({
      hash: operation.transactionHash,
    }).catch(() => null);
    if (!existing) throw error;
  }
  const receipt = await context.publicClient.waitForTransactionReceipt({
    hash: operation.transactionHash,
    confirmations: context.runtime.confirmations,
    timeout: 10 * 60 * 1_000,
  });
  if (receipt.status !== 'success') throw new Error(`La operacion ${kind} revirtio on-chain.`);
  return updateOperation(context.db, plan, kind, (current) => ({
    ...current,
    status: 'confirmed',
    signedRawTransaction: null,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash,
    confirmedAt: new Date(),
  }));
}

function transactionFor(runtime, plan, operation, batch) {
  const amount = BigInt(operation.executedAmountRaw ?? operation.amountRaw);
  if (operation.kind === 'fund_distributor') return {
    to: runtime.tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [runtime.distributorAddress, amount],
    }),
    executedAmountRaw: amount.toString(10),
  };
  if (operation.kind === 'publish_batch') {
    if (!batch?.publishAuthorized || batch.previewOnly) {
      throw new Error(`El batch ${plan.batchId} no esta autorizado.`);
    }
    return {
      to: runtime.distributorAddress,
      data: encodeFunctionData({
        abi: DISTRIBUTOR_ABI,
        functionName: 'publishBatch',
        args: [
          batch.batchId,
          batch.merkleRoot,
          batch.canonicalInputHash,
          batch.metadataHash,
          BigInt(batch.totalAllocatedRaw),
          BigInt(batch.startsAtRaw),
          BigInt(batch.expiresAtRaw),
        ],
      }),
      executedAmountRaw: amount.toString(10),
    };
  }
  if (operation.kind === 'burn_supply_reduction') return {
    to: runtime.tokenAddress,
    data: encodeFunctionData({ abi: ERC20_ABI, functionName: 'burn', args: [amount] }),
    executedAmountRaw: amount.toString(10),
  };
  if (!operation.to) throw new Error(`La operacion ${operation.kind} no tiene destinatario.`);
  return {
    to: runtime.tokenAddress,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [getAddress(operation.to), amount],
    }),
    executedAmountRaw: amount.toString(10),
  };
}

async function updateOperation(db, plan, kind, mutate) {
  return replacePlan(db, plan, (document) => ({
    ...document,
    operations: document.operations.map((operation) => (
      operation.kind === kind ? mutate(operation) : operation
    )),
  }));
}

async function replacePlan(db, plan, mutate) {
  const now = new Date();
  const replacement = {
    ...mutate(plan),
    revision: plan.revision + 1,
    updatedAt: now,
  };
  assertRewardPublicationPlanIntegrity(replacement);
  const result = await db.collection('reward_publication_plans').replaceOne(
    { _id: plan._id, revision: plan.revision, leaseOwner: plan.leaseOwner },
    replacement,
  );
  if (result.matchedCount !== 1) throw new Error(`Fence obsoleto del plan ${plan._id}.`);
  return replacement;
}

async function releaseLease(db, plan) {
  await db.collection('reward_publication_plans').updateOne(
    { _id: plan._id, leaseOwner: plan.leaseOwner },
    {
      $set: { leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date() },
      $inc: { revision: 1 },
    },
  );
}
