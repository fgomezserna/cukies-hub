import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, ContractAlias, EventName } from '../types.js';
import {
  deriveCukiePoolVaultLifecycle,
  NftVaultProjectionError,
  projectNftVaultEvent,
} from './nft-vaults.js';

type Document = { _id: string; [key: string]: any };

function matches(document: Document, filter: Record<string, any>) {
  return Object.entries(filter).every(([key, expected]) => {
    const actual = document[key];
    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
    }
    return actual === expected;
  });
}

class MemoryCollection {
  readonly documents = new Map<string, Document>();

  async findOne(filter: Record<string, any>) {
    return [...this.documents.values()].find((document) => matches(document, filter)) ?? null;
  }

  async insertOne(document: Document) {
    if (this.documents.has(document._id)) {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    }
    this.documents.set(document._id, structuredClone(document));
    return { acknowledged: true };
  }

  async updateOne(
    filter: Record<string, any>,
    update: { $set?: Record<string, any>; $setOnInsert?: Record<string, any> },
    options: { upsert?: boolean } = {},
  ) {
    const existing = [...this.documents.values()].find((document) => matches(document, filter));
    if (existing) {
      Object.assign(existing, structuredClone(update.$set ?? {}));
      return { matchedCount: 1, upsertedCount: 0 };
    }
    if (!options.upsert) return { matchedCount: 0, upsertedCount: 0 };
    const id = String(filter._id ?? update.$setOnInsert?._id);
    const inserted = {
      _id: id,
      ...structuredClone(update.$setOnInsert ?? {}),
      ...structuredClone(update.$set ?? {}),
    };
    this.documents.set(id, inserted);
    return { matchedCount: 0, upsertedCount: 1 };
  }
}

function memoryStore() {
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

const masterVault = '0x0000000000000000000000000000000000000101';
const poolVault = '0x0000000000000000000000000000000000000102';
const collectionA = '0x0000000000000000000000000000000000000201';
const collectionB = '0x0000000000000000000000000000000000000202';
const beneficiary = '0x00000000000000000000000000000000000000AA';

function vaultEvent(input: {
  alias: ContractAlias;
  eventName: EventName;
  args: Record<string, unknown>;
  blockNumber: number;
  logIndex?: number;
}): ChainEvent {
  const contractAddress = input.alias === 'CUKIE_MASTER_NFT_VAULT' ? masterVault : poolVault;
  const logIndex = input.logIndex ?? 0;
  return {
    _id: `BSC:${input.alias}:${input.eventName}:${input.blockNumber}:${logIndex}`,
    chain: 'BSC',
    chainId: 97,
    contractAlias: input.alias,
    contractAddress,
    eventName: input.eventName,
    txHash: `0x${input.blockNumber.toString(16).padStart(64, '0')}`,
    logIndex,
    blockNumber: input.blockNumber,
    blockHash: `0x${(input.blockNumber + 1).toString(16).padStart(64, '0')}`,
    timestampMs: input.blockNumber * 1_000,
    args: input.args as never,
    normalized: normalizeDomainEvent('BSC', input.eventName, input.alias, input.args),
    raw: {},
    status: 'projecting',
    attempts: 1,
    schemaVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function masterDeposit(tokenId = 1n, collection = collectionA, blockNumber = 10) {
  return vaultEvent({
    alias: 'CUKIE_MASTER_NFT_VAULT',
    eventName: 'CukieMasterDeposited',
    blockNumber,
    args: { collection, tokenId, beneficiary, depositEpoch: 1n, depositedAt: 100n },
  });
}

function poolDeposit(blockNumber = 20) {
  return vaultEvent({
    alias: 'CUKIE_POOL_NFT_VAULT',
    eventName: 'CukiePoolDeposited',
    blockNumber,
    args: {
      collection: collectionA,
      tokenId: 2n,
      beneficiary,
      depositEpoch: 1n,
      depositedAt: 100n,
      depositPeriodId: 7n,
      activationAt: 200n,
      activationPeriodId: 8n,
      calendarVersion: 1n,
    },
  });
}

describe('NFT vault projectors', () => {
  it('projects master custody and immediate withdrawal idempotently', async () => {
    const context = memoryStore();
    const deposit = masterDeposit();
    await projectNftVaultEvent(context.store as never, deposit);
    const jobs = context.collections.get('cukie_master_recalculation_jobs')!;
    assert.equal(jobs.documents.size, 1);
    jobs.documents.clear();
    await projectNftVaultEvent(context.store as never, deposit);
    assert.equal(jobs.documents.size, 1, 'el replay reconstruye el outbox si faltaba');

    const withdrawal = vaultEvent({
      alias: 'CUKIE_MASTER_NFT_VAULT',
      eventName: 'CukieMasterWithdrawn',
      blockNumber: 11,
      args: {
        collection: collectionA,
        tokenId: 1n,
        beneficiary,
        depositEpoch: 1n,
        withdrawnAt: 110n,
      },
    });
    await projectNftVaultEvent(context.store as never, withdrawal);
    jobs.documents.clear();
    await projectNftVaultEvent(context.store as never, withdrawal);
    assert.equal(jobs.documents.size, 1, 'el replay de retirada reconstruye el outbox');
    assert.equal([...jobs.documents.values()][0].route, 'nft');

    const positions = context.collections.get('cukie_master_nft_positions')!;
    assert.equal(positions.documents.size, 1);
    const position = [...positions.documents.values()][0];
    assert.equal(position.assetId, `97:${collectionA.toLowerCase()}:1`);
    assert.equal(position.lifecycle, 'withdrawn');
    assert.equal(position.lifecycleOpen, false);
    assert.equal(position.custody, 'wallet');
  });

  it('does not collide when two collections reuse the same tokenId', async () => {
    const context = memoryStore();
    await projectNftVaultEvent(context.store as never, masterDeposit(1n, collectionA, 10));
    await projectNftVaultEvent(context.store as never, masterDeposit(1n, collectionB, 11));
    const positions = context.collections.get('cukie_master_nft_positions')!;
    assert.equal(positions.documents.size, 2);
    assert.deepEqual(
      [...positions.documents.values()].map((item) => item.assetId).sort(),
      [
        `97:${collectionA.toLowerCase()}:1`,
        `97:${collectionB.toLowerCase()}:1`,
      ],
    );
  });

  it('projects the full pool exit lifecycle and derives time boundaries', async () => {
    const context = memoryStore();
    await projectNftVaultEvent(context.store as never, poolDeposit());
    const positions = context.collections.get('cukie_pool_nft_vault_positions')!;
    const id = `97:${collectionA.toLowerCase()}:2:epoch:1`;
    let position = positions.documents.get(id)!;
    assert.equal(deriveCukiePoolVaultLifecycle(position as never, 199n), 'pending_activation');
    assert.equal(deriveCukiePoolVaultLifecycle(position as never, 200n), 'active');

    const exit = vaultEvent({
      alias: 'CUKIE_POOL_NFT_VAULT',
      eventName: 'CukiePoolExitRequested',
      blockNumber: 21,
      args: {
        collection: collectionA,
        tokenId: 2n,
        beneficiary,
        depositEpoch: 1n,
        requestedAt: 250n,
        exitPeriodId: 8n,
        withdrawableAt: 300n,
        calendarVersion: 1n,
      },
    });
    await projectNftVaultEvent(context.store as never, exit);
    position = positions.documents.get(id)!;
    assert.equal(position.ownerRewardEligible, false);
    assert.equal(deriveCukiePoolVaultLifecycle(position as never, 299n), 'exit_requested');
    assert.equal(deriveCukiePoolVaultLifecycle(position as never, 300n), 'withdrawable');

    const advance = vaultEvent({
      alias: 'CUKIE_POOL_NFT_VAULT',
      eventName: 'CukiePoolWithdrawableAtAdvanced',
      blockNumber: 22,
      args: {
        collection: collectionA,
        tokenId: 2n,
        beneficiary,
        depositEpoch: 1n,
        previousWithdrawableAt: 300n,
        newWithdrawableAt: 280n,
      },
    });
    await projectNftVaultEvent(context.store as never, advance);
    position = positions.documents.get(id)!;
    assert.equal(position.withdrawableAt, '280');
    assert.equal(deriveCukiePoolVaultLifecycle(position as never, 280n), 'withdrawable');

    const withdrawal = vaultEvent({
      alias: 'CUKIE_POOL_NFT_VAULT',
      eventName: 'CukiePoolWithdrawn',
      blockNumber: 23,
      args: {
        collection: collectionA,
        tokenId: 2n,
        beneficiary,
        depositEpoch: 1n,
        withdrawnAt: 281n,
      },
    });
    await projectNftVaultEvent(context.store as never, withdrawal);
    position = positions.documents.get(id)!;
    assert.equal(deriveCukiePoolVaultLifecycle(position as never, 999n), 'withdrawn');
    assert.equal(position.lifecycleOpen, false);
  });

  it('projects constructor calendar and rejects withdrawals without their deposit epoch', async () => {
    const context = memoryStore();
    const calendar = vaultEvent({
      alias: 'CUKIE_POOL_NFT_VAULT',
      eventName: 'CukiePoolCalendarVersionScheduled',
      blockNumber: 1,
      args: {
        version: 1n,
        effectiveAt: 50_400n,
        firstCutoffAt: 136_800n,
        firstPeriodId: 0n,
        periodAnchorSeconds: 50_400n,
      },
    });
    await projectNftVaultEvent(context.store as never, calendar);
    assert.equal(context.collections.get('cukie_pool_calendar_versions')!.documents.size, 1);

    const orphanWithdrawal = vaultEvent({
      alias: 'CUKIE_POOL_NFT_VAULT',
      eventName: 'CukiePoolWithdrawn',
      blockNumber: 3,
      args: {
        collection: collectionA,
        tokenId: 2n,
        beneficiary,
        depositEpoch: 9n,
        withdrawnAt: 300n,
      },
    });
    await assert.rejects(
      () => projectNftVaultEvent(context.store as never, orphanWithdrawal),
      NftVaultProjectionError,
    );
  });
});
