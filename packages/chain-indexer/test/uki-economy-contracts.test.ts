import assert from 'node:assert/strict';
import test from 'node:test';

import { getContractEventConfigs } from '../src/config/contracts.js';
import { normalizeDomainEvent } from '../src/normalize.js';
import {
  projectRewardsDistributorEvent,
  projectUkiStakingPosition,
} from '../src/projectors/index.js';
import type { ChainEvent } from '../src/types.js';

const STAKING = `0x${'1'.repeat(40)}`;
const REWARDS = `0x${'2'.repeat(40)}`;
const WALLET = `0x${'a'.repeat(40)}`;
const BATCH_ID = `0x${'b'.repeat(64)}`;

class MemoryCollection {
  readonly documents = new Map<string, Record<string, unknown>>();

  async findOne(filter: Record<string, unknown>) {
    return [...this.documents.values()].find((document) => (
      Object.entries(filter).every(([key, value]) => document[key] === value)
    )) ?? null;
  }

  async updateOne(
    filter: Record<string, unknown>,
    update: Record<string, Record<string, unknown>>,
    options: { upsert?: boolean } = {},
  ) {
    const byId = typeof filter._id === 'string' ? this.documents.get(filter._id) : undefined;
    const existing = byId ?? await this.findOne(
      Object.fromEntries(Object.entries(filter).filter(([key]) => !key.startsWith('$'))),
    );
    const set = update.$set ?? {};
    const setOnInsert = update.$setOnInsert ?? {};

    if (existing) {
      if ('lastBlockNumber' in set) {
        const incoming = [Number(set.lastBlockNumber), Number(set.lastLogIndex)];
        const current = [Number(existing.lastBlockNumber ?? -1), Number(existing.lastLogIndex ?? -1)];
        if (incoming[0] < current[0] || (incoming[0] === current[0] && incoming[1] < current[1])) {
          return { matchedCount: 0, upsertedCount: 0 };
        }
      }
      Object.assign(existing, set);
      return { matchedCount: 1, upsertedCount: 0 };
    }

    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };
    const id = String(setOnInsert._id ?? filter._id ?? filter.batchId);
    this.documents.set(id, { ...setOnInsert, ...set });
    return { matchedCount: 0, upsertedCount: 1 };
  }

  async insertOne(document: Record<string, unknown>) {
    const id = String(document._id);
    if (this.documents.has(id)) throw Object.assign(new Error('duplicate'), { code: 11000 });
    this.documents.set(id, { ...document });
    return { acknowledged: true };
  }
}

function fakeStore() {
  const collections = new Map<string, MemoryCollection>();
  return {
    collections,
    store: {
      db: {
        collection(name: string) {
          const existing = collections.get(name);
          if (existing) return existing;
          const created = new MemoryCollection();
          collections.set(name, created);
          return created;
        },
      },
    },
  };
}

function event(
  eventName: ChainEvent['eventName'],
  normalized: ChainEvent['normalized'],
  blockNumber: number,
): ChainEvent {
  return {
    _id: `BSC:test:${eventName}:${blockNumber}`,
    chain: 'BSC',
    contractAlias: eventName === 'Staked' || eventName === 'Unstaked'
      ? 'UKI_STAKING'
      : 'REWARDS_DISTRIBUTOR',
    contractAddress: eventName === 'Staked' || eventName === 'Unstaked' ? STAKING : REWARDS,
    eventName,
    txHash: `0x${String(blockNumber).padStart(64, '0')}`,
    logIndex: 0,
    blockNumber,
    blockHash: `0x${String(blockNumber + 100).padStart(64, '0')}`,
    timestampMs: blockNumber * 1_000,
    args: {},
    normalized,
    raw: {},
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(blockNumber * 1_000),
    updatedAt: new Date(blockNumber * 1_000),
  };
}

test('registers staking and rewards only when their BSC addresses are explicit', () => {
  const configs = getContractEventConfigs(['BSC'], {
    ukiStakingAddress: STAKING,
    rewardsDistributorAddress: REWARDS,
    contractAliases: ['UKI_STAKING', 'REWARDS_DISTRIBUTOR'],
  });
  assert.deepEqual(
    configs.map(({ contractAlias, eventName }) => `${contractAlias}:${eventName}`),
    [
      'UKI_STAKING:Staked',
      'UKI_STAKING:Unstaked',
      'REWARDS_DISTRIBUTOR:BatchPublished',
      'REWARDS_DISTRIBUTOR:RewardClaimed',
      'REWARDS_DISTRIBUTOR:BatchClosed',
    ],
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], { contractAliases: ['UKI_STAKING'] }),
    /sin una address BSC configurada/,
  );
});

test('normalizes all raw staking and rewards fields without lossy number conversion', () => {
  assert.deepEqual(
    normalizeDomainEvent('BSC', 'Staked', 'UKI_STAKING', {
      account: WALLET,
      amount: 10n,
      accountBalance: 20n,
      totalStaked: 30n,
    }),
    {
      account: WALLET,
      accountNormalized: WALLET.toLowerCase(),
      amountRaw: '10',
      accountBalanceRaw: '20',
      totalStakedRaw: '30',
      txType: 'Staked',
    },
  );
  const published = normalizeDomainEvent('BSC', 'BatchPublished', 'REWARDS_DISTRIBUTOR', {
    batchId: BATCH_ID,
    merkleRoot: `0x${'c'.repeat(64)}`,
    inputHash: `0x${'d'.repeat(64)}`,
    metadataHash: `0x${'e'.repeat(64)}`,
    totalAllocated: 100n,
    startsAt: 200n,
    expiresAt: 300n,
  });
  assert.equal(published.totalAllocatedRaw, '100');
  assert.equal(published.expiresAtRaw, '300');
});

test('staking projector keeps absolute latest balances and rejects stale overwrite', async () => {
  const context = fakeStore();
  const latest = event('Staked', {
    account: WALLET,
    accountNormalized: WALLET.toLowerCase(),
    amountRaw: '10',
    accountBalanceRaw: '10',
    totalStakedRaw: '10',
  }, 20);
  await projectUkiStakingPosition(context.store as never, latest);
  await projectUkiStakingPosition(context.store as never, event('Unstaked', {
    ...latest.normalized,
    accountBalanceRaw: '0',
    totalStakedRaw: '0',
  }, 19));
  assert.equal(
    context.collections.get('uki_staking_positions')?.documents.get(WALLET.toLowerCase())
      ?.accountBalanceRaw,
    '10',
  );
});

test('rewards projector materializes publish, claim and close idempotently', async () => {
  const context = fakeStore();
  const publish = event('BatchPublished', {
    batchId: BATCH_ID,
    merkleRoot: `0x${'c'.repeat(64)}`,
    inputHash: `0x${'d'.repeat(64)}`,
    metadataHash: `0x${'e'.repeat(64)}`,
    totalAllocatedRaw: '100',
    startsAtRaw: '200',
    expiresAtRaw: '300',
  }, 10);
  const claim = event('RewardClaimed', {
    batchId: BATCH_ID,
    account: WALLET,
    accountNormalized: WALLET.toLowerCase(),
    amountRaw: '100',
  }, 11);
  const close = event('BatchClosed', { batchId: BATCH_ID, unclaimedAmountRaw: '0' }, 12);

  await projectRewardsDistributorEvent(context.store as never, publish);
  await projectRewardsDistributorEvent(context.store as never, publish);
  await projectRewardsDistributorEvent(context.store as never, claim);
  await projectRewardsDistributorEvent(context.store as never, claim);
  await projectRewardsDistributorEvent(context.store as never, close);

  assert.equal(context.collections.get('reward_claim_batches')?.documents.size, 1);
  assert.equal(context.collections.get('reward_claims')?.documents.size, 1);
  assert.equal(
    [...context.collections.get('reward_claim_batches')!.documents.values()][0].status,
    'closed',
  );
});
