import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexerStore } from '../src/storage/mongo.js';
import type { ChainEvent } from '../src/types.js';

test('dead letters retain the contract identity used by health checks', async () => {
  const deadLetterUpdates: Array<{ filter: unknown; update: unknown; options: unknown }> = [];
  const store = Object.create(IndexerStore.prototype) as IndexerStore;
  Object.defineProperty(store, 'events', {
    value: () => ({ updateOne: async () => ({ modifiedCount: 1 }) }),
  });
  Object.defineProperty(store, 'db', {
    value: {
      collection: (name: string) => {
        assert.equal(name, 'chain_dead_letters');
        return {
          updateOne: async (filter: unknown, update: unknown, options: unknown) => {
            deadLetterUpdates.push({ filter, update, options });
            return { upsertedCount: 1 };
          },
        };
      },
    },
  });
  const event: ChainEvent = {
    _id: 'BSC:UKI_STAKING:Staked:0xhash:0',
    chain: 'BSC',
    chainId: 97,
    contractAlias: 'UKI_STAKING',
    contractAddress: `0x${'a'.repeat(40)}`,
    eventName: 'Staked',
    txHash: `0x${'b'.repeat(64)}`,
    logIndex: 0,
    blockNumber: 123,
    timestampMs: 1,
    args: {},
    normalized: {},
    raw: {},
    status: 'failed',
    attempts: 5,
    schemaVersion: 1,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };

  await store.markFailed(event, new Error('boom'));

  assert.equal(deadLetterUpdates.length, 1);
  assert.deepEqual(deadLetterUpdates[0]?.filter, { eventId: event._id });
  assert.deepEqual(deadLetterUpdates[0]?.options, { upsert: true });
  const set = (deadLetterUpdates[0]?.update as { $set: Record<string, unknown> }).$set;
  assert.equal(set.chain, 'BSC');
  assert.equal(set.contractAlias, 'UKI_STAKING');
  assert.equal(set.contractAddress, event.contractAddress);
});
