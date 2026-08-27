import assert from 'node:assert/strict';
import test from 'node:test';

import { loadGameEconomySchedulerConfig } from './game-economy-scheduler-policy.mjs';

test('scheduler GameEconomy desactivado no exige secretos', () => {
  const config = loadGameEconomySchedulerConfig({ GAME_ECONOMY_RUNTIME_ENABLED: 'false' });
  assert.equal(config.enabled, false);
  assert.equal(config.secret, null);
});

test('scheduler GameEconomy activo exige Mongo y HMAC fuerte', () => {
  assert.throws(() => loadGameEconomySchedulerConfig({
    GAME_ECONOMY_RUNTIME_ENABLED: 'true',
  }), /ECONOMY_INTERNAL_HMAC_KEY_ID/);
});

test('scheduler GameEconomy activo carga configuracion aislada', () => {
  const config = loadGameEconomySchedulerConfig({
    GAME_ECONOMY_RUNTIME_ENABLED: 'true',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'admin-v1',
    ECONOMY_INTERNAL_HMAC_SECRET: 'A-very-long-secret-with-many-symbols-1234567890',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
  }, 'host-a');
  assert.equal(config.enabled, true);
  assert.equal(config.schedulerId, 'host-a');
  assert.equal(config.dbName, 'cukieshub-new');
});
