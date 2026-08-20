#!/usr/bin/env node

import { MongoClient } from 'mongodb';
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bscTestnet } from 'viem/chains';

import { stableRewardPublicationHash } from './lib/reward-batch-publication.mjs';

const DISTRIBUTOR_ABI = parseAbi([
  'function batches(bytes32 batchId) view returns (bytes32 merkleRoot, bytes32 inputHash, bytes32 metadataHash, uint256 totalAllocated, uint256 totalClaimed, uint64 startsAt, uint64 expiresAt, bool closed)',
  'function claimed(bytes32 batchId, address account) view returns (bool)',
  'function claim(bytes32 batchId, uint256 amount, bytes32[] proof)',
]);
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

const mode = process.argv[2];
if (mode !== 'seed' && mode !== 'claim') {
  throw new Error('Uso: reward-batch-publisher-canary.mjs <seed|claim>.');
}
if (
  process.env.APP_ENV !== 'staging'
  || process.env.STAGING_ONLY_GUARD !== 'true'
  || process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID !== '97'
) throw new Error('El canary solo admite staging BSC Testnet 97.');

const mongoUrl = process.env.CHAIN_INDEXER_MONGO_URL;
const databaseName = process.env.CHAIN_INDEXER_DB_NAME;
const rpcUrl = process.env.CHAIN_INDEXER_BSC_RPC_URL;
const tokenAddress = getAddress(process.env.NEXT_PUBLIC_UKI_TOKEN_ADDRESS);
const distributorAddress = getAddress(process.env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS);
const privateKey = process.env.REWARD_BATCH_PUBLISHER_PRIVATE_KEY;
if (!mongoUrl || !databaseName || !rpcUrl || !privateKey) {
  throw new Error('El canary requiere Mongo, RPC y clave de testnet.');
}
const account = privateKeyToAccount(privateKey);
const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 10_000 });
await mongo.connect();
try {
  const db = mongo.db(databaseName);
  if (mode === 'seed') await seed(db);
  else await claim(db);
} finally {
  await mongo.close();
}

async function seed(db) {
  const now = new Date();
  const accountingId = `reward-daily:canary:${distributorAddress.toLowerCase()}`;
  const allocationId = `reward-canary-allocation:${distributorAddress.toLowerCase()}`;
  const amountRaw = parseEther('10').toString(10);
  const ruleVersion = `rewards-canary:${distributorAddress.toLowerCase()}`;
  const destinations = {
    treasury: '0x3333333333333333333333333333333333333333',
    marketingDevelopment: '0x4444444444444444444444444444444444444444',
    supplyReduction: '0x5555555555555555555555555555555555555555',
  };
  const rule = {
    _id: `reward_allocations:${ruleVersion}`,
    scope: 'reward_allocations',
    version: ruleVersion,
    active: true,
    activeFrom: new Date(now.getTime() - 60_000),
    configHash: stableRewardPublicationHash({ ruleVersion, destinations }),
    destinations,
    createdAt: now,
    updatedAt: now,
  };
  const accounting = {
    _id: accountingId,
    dayId: 'canary',
    ruleVersion,
    payloadHash: stableRewardPublicationHash({ kind: 'reward-canary-accounting', accountingId }),
    status: 'sealed',
    sealedAt: now,
  };
  const immutable = {
    accountingId,
    accountingKind: 'daily',
    periodId: 'canary',
    allocationId,
    walletNormalized: account.address.toLowerCase(),
    category: 'player',
    amountRaw,
    fundingMode: 'daily_emission',
    sourceIds: ['reward-canary-source'],
    availableAt: new Date(now.getTime() - 1_000),
    status: 'allocated_offchain',
    createdAt: now,
  };
  const allocation = {
    _id: allocationId,
    ...immutable,
    payloadHash: stableRewardPublicationHash({
      kind: 'reward-accounting-allocation-document',
      ...immutable,
    }),
  };
  await db.collection('economy_schema_metadata').updateOne(
    { _id: 'uki-economy' },
    { $set: { schemaVersion: 3, migratedAt: now, updatedAt: now } },
    { upsert: true },
  );
  await db.collection('economy_rule_versions').insertOne(rule);
  await db.collection('reward_daily_accounting').insertOne(accounting);
  await db.collection('reward_accounting_allocations').insertOne(allocation);
  console.log(JSON.stringify({ event: 'reward_canary_seeded', accountingId, amountRaw }));
}

async function claim(db) {
  const publicClient = createPublicClient({
    chain: bscTestnet,
    transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }),
  });
  const walletClient = createWalletClient({
    account,
    chain: bscTestnet,
    transport: http(rpcUrl, { timeout: 20_000, retryCount: 2 }),
  });
  if (await publicClient.getChainId() !== 97) throw new Error('El RPC canary no es BSC97.');
  const plan = await db.collection('reward_publication_plans').findOne({
    distributorAddress: distributorAddress.toLowerCase(),
  });
  if (!plan?.batchId) throw new Error('El worker no materializo un batch canary.');
  const [batch, proof] = await Promise.all([
    db.collection('reward_claim_batches').findOne({ batchId: plan.batchId }),
    db.collection('reward_claim_proofs').findOne({
      batchId: plan.batchId,
      walletNormalized: account.address.toLowerCase(),
    }),
  ]);
  if (!batch || !proof) throw new Error('El batch canary no tiene draft/proof.');
  const onChain = await publicClient.readContract({
    address: distributorAddress,
    abi: DISTRIBUTOR_ABI,
    functionName: 'batches',
    args: [plan.batchId],
  });
  if (
    onChain[0].toLowerCase() !== batch.merkleRoot.toLowerCase()
    || onChain[1].toLowerCase() !== batch.canonicalInputHash.toLowerCase()
    || onChain[3] !== BigInt(batch.totalAllocatedRaw)
  ) throw new Error('El batch canary on-chain no coincide con Mongo.');
  const before = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  });
  const hash = await walletClient.writeContract({
    address: distributorAddress,
    abi: DISTRIBUTOR_ABI,
    functionName: 'claim',
    args: [plan.batchId, BigInt(proof.amountRaw), proof.proof],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  const [after, claimed] = await Promise.all([
    publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    }),
    publicClient.readContract({
      address: distributorAddress,
      abi: DISTRIBUTOR_ABI,
      functionName: 'claimed',
      args: [plan.batchId, account.address],
    }),
  ]);
  if (receipt.status !== 'success' || !claimed || after - before !== BigInt(proof.amountRaw)) {
    throw new Error('El claim canary no acredito el saldo exacto.');
  }
  console.log(JSON.stringify({
    event: 'reward_canary_claimed',
    batchId: plan.batchId,
    publishTransactionHash: plan.operations.find(({ kind }) => kind === 'publish_batch')
      ?.transactionHash,
    claimTransactionHash: hash,
    amountRaw: proof.amountRaw,
  }));
}
