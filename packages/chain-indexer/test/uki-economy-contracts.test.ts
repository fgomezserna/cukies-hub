import assert from 'node:assert/strict';
import test from 'node:test';

import { getContractEventConfigs } from '../src/config/contracts.js';
import { normalizeDomainEvent } from '../src/normalize.js';
import {
  projectEvent,
  projectRewardsDistributorEvent,
  projectUkiStakingPosition,
  projectUkiVestingPosition,
} from '../src/projectors/index.js';
import type { ChainEvent } from '../src/types.js';

const STAKING = `0x${'1'.repeat(40)}`;
const REWARDS = `0x${'2'.repeat(40)}`;
const VESTING = `0x${'3'.repeat(40)}`;
const TOKEN = `0x${'4'.repeat(40)}`;
const TOKEN_V2 = `0x${'7'.repeat(40)}`;
const MARKETPLACE = `0x${'5'.repeat(40)}`;
const BRIDGE = `0x${'6'.repeat(40)}`;
const WALLET = `0x${'a'.repeat(40)}`;
const BATCH_ID = `0x${'b'.repeat(64)}`;

class MemoryCollection {
  readonly documents = new Map<string, Record<string, unknown>>();

  async findOne(filter: Record<string, unknown>) {
    return [...this.documents.values()].find((document) => (
      Object.entries(filter).every(([key, value]) => document[key] === value)
    )) ?? null;
  }

  find(filter: Record<string, unknown>) {
    let values = [...this.documents.values()].filter((document) => (
      Object.entries(filter).every(([key, value]) => document[key] === value)
    ));
    const cursor = {
      sort(sort: Record<string, number>) {
        values = values.sort((left, right) => {
          for (const [key, direction] of Object.entries(sort)) {
            if (left[key] === right[key]) continue;
            return (left[key]! < right[key]! ? -1 : 1) * direction;
          }
          return 0;
        });
        return cursor;
      },
      async toArray() {
        return values.map((value) => ({ ...value }));
      },
    };
    return cursor;
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
      cursors() {
        return {
          findOne: async (filter: Record<string, unknown>) => ({
            contractAddress: filter.contractAddress,
            bootstrapStatus: 'verified',
            bootstrapStartBlock: 1,
            bootstrapVerifiedAt: new Date(0),
            verifiedChainId: 97,
            contractCodeHash: `0x${'1'.repeat(64)}`,
            contractDeploymentBlock: 1,
            contractDeploymentTxHash: `0x${'2'.repeat(64)}`,
            contractConfigHash: `0x${'3'.repeat(64)}`,
          }),
        };
      },
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
    chainId: 97,
    contractAlias: eventName === 'Staked' || eventName === 'Unstaked'
      ? 'UKI_STAKING'
      : eventName === 'VestingCreated' || eventName === 'TokensReleased'
        ? 'VESTING_VAULT'
        : 'REWARDS_DISTRIBUTOR',
    contractAddress: eventName === 'Staked' || eventName === 'Unstaked'
      ? STAKING
      : eventName === 'VestingCreated' || eventName === 'TokensReleased'
        ? VESTING
        : REWARDS,
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

test('registers staking, vesting and rewards only when their BSC addresses are explicit', () => {
  const configs = getContractEventConfigs(['BSC'], {
    ukiStakingAddress: STAKING,
    vestingVaultAddress: VESTING,
    rewardsDistributorAddress: REWARDS,
    contractAliases: ['UKI_STAKING', 'VESTING_VAULT', 'REWARDS_DISTRIBUTOR'],
  });
  assert.deepEqual(
    configs.map(({ contractAlias, eventName }) => `${contractAlias}:${eventName}`),
    [
      'UKI_STAKING:Staked',
      'UKI_STAKING:Unstaked',
      'VESTING_VAULT:VestingCreated',
      'VESTING_VAULT:TokensReleased',
      'REWARDS_DISTRIBUTOR:BatchPublished',
      'REWARDS_DISTRIBUTOR:RewardClaimed',
      'REWARDS_DISTRIBUTOR:BatchClosed',
    ],
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], { contractAliases: ['UKI_STAKING'] }),
    /sin una address BSC configurada/,
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], { contractAliases: ['VESTING_VAULT'] }),
    /sin una address BSC configurada/,
  );
});

test('registers the explicit verified BSC NFT sources without mainnet address fallback', () => {
  const configs = getContractEventConfigs(['BSC'], {
    tokenAddress: TOKEN,
    marketplaceAddress: MARKETPLACE,
    bridgeAddress: BRIDGE,
    contractAliases: ['TOKEN', 'MARKETPLACE', 'BRIDGE'],
  });
  assert.deepEqual(
    configs.map(({ contractAlias, eventName, contractAddress }) => (
      `${contractAlias}:${eventName}:${contractAddress.toLowerCase()}`
    )),
    [
      `TOKEN:Transfer:${TOKEN}`,
      `TOKEN:CukieMetadataConfigured:${TOKEN}`,
      `MARKETPLACE:TokenOnSale:${MARKETPLACE}`,
      `MARKETPLACE:TokenBought:${MARKETPLACE}`,
      `MARKETPLACE:MarketTokenSaleCancelled:${MARKETPLACE}`,
      `MARKETPLACE:MarketTokenPriceChanged:${MARKETPLACE}`,
      `BRIDGE:JumpInBridge:${BRIDGE}`,
      `BRIDGE:JumpOutBridge:${BRIDGE}`,
    ],
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], { contractAliases: ['TOKEN'] }),
    /TOKEN fue solicitado sin una address BSC configurada/,
  );
});

test('registers TOKEN and TOKEN_V2 simultaneously without address fallback or TRON leakage', () => {
  const configs = getContractEventConfigs(['BSC'], {
    tokenAddress: TOKEN,
    tokenV2Address: TOKEN_V2,
    contractAliases: ['TOKEN', 'TOKEN_V2'],
  });
  assert.deepEqual(
    configs.map(({ contractAlias, eventName, contractAddress }) => (
      `${contractAlias}:${eventName}:${contractAddress.toLowerCase()}`
    )),
    [
      `TOKEN:Transfer:${TOKEN}`,
      `TOKEN:CukieMetadataConfigured:${TOKEN}`,
      `TOKEN_V2:Transfer:${TOKEN_V2}`,
      `TOKEN_V2:CukieMetadataConfigured:${TOKEN_V2}`,
    ],
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], {
      tokenAddress: TOKEN,
      contractAliases: ['TOKEN', 'TOKEN_V2'],
    }),
    /TOKEN_V2 fue solicitado sin una address BSC configurada/,
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], {
      tokenAddress: TOKEN,
      tokenV2Address: TOKEN,
      contractAliases: ['TOKEN', 'TOKEN_V2'],
    }),
    /TOKEN y TOKEN_V2 deben usar addresses BSC distintas/,
  );
  assert.throws(
    () => getContractEventConfigs(['BSC'], {
      tokenV2Address: `0x${'0'.repeat(40)}`,
      contractAliases: ['TOKEN_V2'],
    }),
    /TOKEN_V2 no tiene una address BSC valida/,
  );
  assert.throws(
    () => getContractEventConfigs(['TRON'], {
      tokenV2Address: TOKEN_V2,
      contractAliases: ['TOKEN_V2'],
    }),
    /solo se indexan con BSC habilitada/,
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
  assert.deepEqual(
    normalizeDomainEvent('BSC', 'VestingCreated', 'VESTING_VAULT', {
      beneficiary: WALLET,
      scheduleId: BATCH_ID,
      amount: 100n,
      start: 200n,
      cliff: 300n,
      duration: 400n,
    }),
    {
      beneficiary: WALLET,
      beneficiaryNormalized: WALLET.toLowerCase(),
      scheduleId: BATCH_ID,
      amountRaw: '100',
      allocatedAmountRaw: '100',
      releasedAmountRaw: '0',
      startRaw: '200',
      cliffRaw: '300',
      durationRaw: '400',
      txType: 'VestingCreated',
    },
  );
});

test('projects a verified BSC mint and its on-chain rarity metadata', async () => {
  const context = fakeStore();
  const mint = {
    ...event('Transfer', normalizeDomainEvent('BSC', 'Transfer', 'TOKEN', {
      from: `0x${'0'.repeat(40)}`,
      to: WALLET,
      tokenId: 97_000_001n,
    }), 10),
    contractAlias: 'TOKEN' as const,
    contractAddress: TOKEN,
  };
  const metadata = {
    ...event('CukieMetadataConfigured', normalizeDomainEvent(
      'BSC',
      'CukieMetadataConfigured',
      'TOKEN',
      { tokenId: 97_000_001n, rarity: 6, generation: 1 },
    ), 10),
    _id: 'BSC:test:CukieMetadataConfigured:10:1',
    contractAlias: 'TOKEN' as const,
    contractAddress: TOKEN,
    logIndex: 1,
  };

  assert.equal(await projectEvent(context.store as never, mint), null);
  assert.equal(await projectEvent(context.store as never, metadata), null);
  const projected = context.collections.get('cukies')?.documents.get('97000001');
  assert.equal(projected?.tokenId, '97000001');
  assert.equal(projected?.ownerNormalized, WALLET.toLowerCase());
  assert.equal(projected?.network, 'BSC');
  assert.equal(projected?.state, 'available');
  assert.equal(projected?.rarity, 6);
  assert.equal(projected?.generation, 1);
  assert.equal(projected?.metadataEventId, metadata._id);
});

test('materializes TOKEN_V2 under collection identity and rejects TOKEN cursor substitution', async () => {
  const context = fakeStore();
  const args = {
    from: `0x${'0'.repeat(40)}`,
    to: WALLET,
    tokenId: 97_000_001n,
  };
  const mint = {
    ...event('Transfer', normalizeDomainEvent('BSC', 'Transfer', 'TOKEN_V2', args), 30),
    contractAlias: 'TOKEN_V2' as const,
    contractAddress: TOKEN_V2,
  };
  const metadata = {
    ...event('CukieMetadataConfigured', normalizeDomainEvent(
      'BSC',
      'CukieMetadataConfigured',
      'TOKEN_V2',
      { tokenId: args.tokenId, rarity: 5, generation: 2 },
    ), 30),
    _id: 'BSC:TOKEN_V2:CukieMetadataConfigured:30:1',
    contractAlias: 'TOKEN_V2' as const,
    contractAddress: TOKEN_V2,
    logIndex: 1,
  };

  assert.equal(await projectEvent(context.store as never, mint), null);
  assert.equal(await projectEvent(context.store as never, metadata), null);
  const documentId = `97:${TOKEN_V2.toLowerCase()}:97000001`;
  const projected = context.collections.get('cukies')?.documents.get(documentId);
  assert.equal(projected?.chainId, 97);
  assert.equal(projected?.collectionAddressNormalized, TOKEN_V2.toLowerCase());
  assert.equal(projected?.rarity, 5);

  await assert.rejects(
    () => projectEvent(context.store as never, {
      ...metadata,
      _id: 'BSC:TOKEN:CukieMetadataConfigured:30:2',
      contractAlias: 'TOKEN',
      logIndex: 2,
    }),
    /no tiene Transfer mint proyectado/,
  );
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
  const stakingState = context.collections.get('uki_staking_state')?.documents.get(
    STAKING.toLowerCase(),
  );
  assert.deepEqual({
    totalStakedRaw: stakingState?.totalStakedRaw,
    materializationStatus: stakingState?.materializationStatus,
    materializedTotalRaw: stakingState?.materializedTotalRaw,
    materializedThroughEventId: stakingState?.materializedThroughEventId,
    materializedThroughBlockNumber: stakingState?.materializedThroughBlockNumber,
    materializedThroughLogIndex: stakingState?.materializedThroughLogIndex,
    bootstrapStatus: stakingState?.bootstrapStatus,
    verifiedChainId: stakingState?.verifiedChainId,
    contractAddressNormalized: stakingState?.contractAddressNormalized,
  }, {
    totalStakedRaw: '10',
    materializationStatus: 'consistent',
    materializedTotalRaw: '10',
    materializedThroughEventId: latest._id,
    materializedThroughBlockNumber: 20,
    materializedThroughLogIndex: 0,
    bootstrapStatus: 'verified',
    verifiedChainId: 97,
    contractAddressNormalized: STAKING.toLowerCase(),
  });
  const jobs = [...(context.collections.get('cukie_master_recalculation_jobs')?.documents.values() ?? [])];
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((job) => (
    job.walletNormalized === WALLET.toLowerCase()
    && job.route === 'uki'
    && job.status === 'pending'
  )));
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

test('vesting projector rebuilds an idempotent ledger-backed position', async () => {
  const context = fakeStore();
  const created = event('VestingCreated', {
    beneficiary: WALLET,
    beneficiaryNormalized: WALLET.toLowerCase(),
    scheduleId: BATCH_ID,
    allocatedAmountRaw: '100',
    releasedAmountRaw: '0',
    startRaw: '200',
    cliffRaw: '300',
    durationRaw: '400',
  }, 10);
  const released = event('TokensReleased', {
    beneficiary: WALLET,
    beneficiaryNormalized: WALLET.toLowerCase(),
    scheduleId: BATCH_ID,
    allocatedAmountRaw: '0',
    releasedAmountRaw: '40',
  }, 11);
  await projectUkiVestingPosition(context.store as never, created);
  await projectUkiVestingPosition(context.store as never, created);
  await projectUkiVestingPosition(context.store as never, released);
  await projectUkiVestingPosition(context.store as never, released);

  assert.equal(context.collections.get('uki_vesting_events')?.documents.size, 2);
  const position = context.collections.get('uki_vesting_positions')?.documents
    .get(`${WALLET.toLowerCase()}:${BATCH_ID}`);
  assert.equal(position?.totalAllocatedRaw, '100');
  assert.equal(position?.releasedRaw, '40');
  assert.equal(position?.lockedRaw, '60');
  assert.equal(position?.ledgerEventCount, 2);
  assert.equal(position?.lastEventId, released._id);
  const jobs = [...(context.collections.get('cukie_master_recalculation_jobs')?.documents.values() ?? [])];
  assert.equal(jobs.length, 2);
  assert.ok(jobs.every((job) => (
    job.walletNormalized === WALLET.toLowerCase()
    && job.route === 'uki'
    && job.status === 'pending'
  )));
});
