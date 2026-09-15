import assert from 'node:assert/strict';
import test from 'node:test';

import type { ContractEventConfig } from '../types.js';
import { IndexerStore, runtimeScopedEventFilter } from './mongo.js';
import { runtimeScopedStorageId } from './runtime-scope.js';

test('legacy worker only claims legacy runtime events', () => {
  assert.deepEqual(runtimeScopedEventFilter('legacy'), {
    runtimeScope: 'legacy',
  });
});

test('default worker accepts historical unscoped rows but rejects legacy rows', () => {
  assert.deepEqual(runtimeScopedEventFilter('default'), {
    $or: [
      { runtimeScope: { $exists: false } },
      { runtimeScope: 'default' },
    ],
  });
});

test('legacy storage ids are namespaced while default ids remain backward compatible', () => {
  assert.equal(runtimeScopedStorageId('default', 'BSC:TOKEN:Transfer:0xtx:0'), 'BSC:TOKEN:Transfer:0xtx:0');
  assert.equal(runtimeScopedStorageId(undefined, 'BSC:TOKEN:Transfer:0xtx:0'), 'BSC:TOKEN:Transfer:0xtx:0');
  assert.equal(runtimeScopedStorageId('legacy', 'BSC:TOKEN:Transfer:0xtx:0'), 'legacy:BSC:TOKEN:Transfer:0xtx:0');
});

test('legacy cursor keys cannot collide with historical/default cursor keys', () => {
  const config: ContractEventConfig = {
    chain: 'BSC',
    contractAlias: 'TOKEN',
    contractAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    eventName: 'Transfer',
  };
  const defaultStore = Object.create(IndexerStore.prototype) as IndexerStore;
  Object.defineProperty(defaultStore, 'runtimeScope', { value: 'default' });
  const legacyStore = Object.create(IndexerStore.prototype) as IndexerStore;
  Object.defineProperty(legacyStore, 'runtimeScope', { value: 'legacy' });

  assert.equal(defaultStore.cursorId(config), 'BSC:TOKEN:Transfer');
  assert.equal(legacyStore.cursorId(config), 'legacy:BSC:TOKEN:Transfer');
});
