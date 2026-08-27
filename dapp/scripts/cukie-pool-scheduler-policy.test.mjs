import assert from 'node:assert/strict';
import test from 'node:test';

import { loadCukiePoolSchedulerConfig } from './cukie-pool-scheduler-policy.mjs';

const SECRET = 'pool-scheduler-secret-with-entropy-A9!';

test('scheduler remains inert without pool runtime enablement', () => {
  assert.deepEqual(loadCukiePoolSchedulerConfig({}, 'test-host'), {
    enabled: false,
    intervalMs: 30_000,
    tickTimeoutMs: 240_000,
    baseUrl: 'http://dapp:3000',
    schedulerId: 'test-host',
    keyId: null,
    secret: null,
    mongoUrl: null,
    dbName: null,
  });
});

test('enabled scheduler requires private HMAC and economy Mongo identity', () => {
  assert.throws(() => loadCukiePoolSchedulerConfig({
    CUKIE_POOL_RUNTIME_ENABLED: 'true',
  }), /ECONOMY_INTERNAL_HMAC_KEY_ID/);
  assert.throws(() => loadCukiePoolSchedulerConfig({
    CUKIE_POOL_RUNTIME_ENABLED: 'true',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'pool',
    ECONOMY_INTERNAL_HMAC_SECRET: SECRET,
  }), /CHAIN_INDEXER_MONGO_URL/);
  assert.deepEqual(loadCukiePoolSchedulerConfig({
    CUKIE_POOL_RUNTIME_ENABLED: 'true',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'pool',
    ECONOMY_INTERNAL_HMAC_SECRET: SECRET,
    CHAIN_INDEXER_MONGO_URL: 'mongodb://economy.example/cukieshub-new',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
  }, 'test-host'), {
    enabled: true,
    intervalMs: 30_000,
    tickTimeoutMs: 240_000,
    baseUrl: 'http://dapp:3000',
    schedulerId: 'test-host',
    keyId: 'pool',
    secret: SECRET,
    mongoUrl: 'mongodb://economy.example/cukieshub-new',
    dbName: 'cukieshub-new',
  });
});

test('scheduler rejects public secret reuse and legacy database', () => {
  const base = {
    CUKIE_POOL_RUNTIME_ENABLED: 'true',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'pool',
    ECONOMY_INTERNAL_HMAC_SECRET: SECRET,
    CHAIN_INDEXER_MONGO_URL: 'mongodb://economy.example/cukieshub-new',
  };
  assert.throws(() => loadCukiePoolSchedulerConfig({
    ...base,
    NEXT_PUBLIC_POOL_SECRET: SECRET,
  }), /NEXT_PUBLIC/);
  assert.throws(() => loadCukiePoolSchedulerConfig({
    ...base,
    CHAIN_INDEXER_DB_NAME: 'cukies',
  }), /cukies/);
});
