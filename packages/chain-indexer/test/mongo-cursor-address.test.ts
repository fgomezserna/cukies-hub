import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexerStore } from '../src/storage/mongo.js';
import type { ChainCursor, ContractEventConfig } from '../src/types.js';

const config: ContractEventConfig = {
  chain: 'BSC',
  contractAlias: 'PRESALE',
  contractAddress: `0x${'a'.repeat(40)}`,
  eventName: 'Purchased',
};

function storeWithCursor(cursor: Partial<ChainCursor> | null) {
  const deleted: unknown[] = [];
  const collection = {
    findOne: async () => cursor,
    deleteOne: async (filter: unknown) => {
      deleted.push(filter);
      return { deletedCount: 1 };
    },
  };
  const store = Object.create(IndexerStore.prototype) as IndexerStore;
  Object.defineProperty(store, 'cursors', {
    value: () => collection,
  });
  return { store, deleted };
}

test('reuses a BSC cursor when the contract address differs only by casing', async () => {
  const cursor = {
    _id: 'BSC:PRESALE:Purchased',
    contractAddress: config.contractAddress.toUpperCase(),
    nextBlock: 123,
  };
  const { store, deleted } = storeWithCursor(cursor);

  assert.equal(await store.getCursor(config), cursor);
  assert.deepEqual(deleted, []);
});

test('deletes and ignores a cursor owned by another contract address', async () => {
  const cursor = {
    _id: 'BSC:PRESALE:Purchased',
    contractAddress: `0x${'b'.repeat(40)}`,
    nextBlock: 999,
  };
  const { store, deleted } = storeWithCursor(cursor);

  assert.equal(await store.getCursor(config), null);
  assert.deepEqual(deleted, [{
    _id: 'BSC:PRESALE:Purchased',
    contractAddress: cursor.contractAddress,
  }]);
});
