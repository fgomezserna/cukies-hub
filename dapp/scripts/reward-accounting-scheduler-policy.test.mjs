import assert from 'node:assert/strict';
import test from 'node:test';

import { loadRewardAccountingSchedulerConfig } from './reward-accounting-scheduler-policy.mjs';

test('reward accounting permanece inerte sin opt-in', () => {
  const config = loadRewardAccountingSchedulerConfig({}, 'host-a');
  assert.equal(config.enabled, false);
  assert.equal(config.schedulerId, 'host-a');
  assert.equal(config.secret, null);
});

test('el gate legacy de runtime no arranca por si solo el scheduler', () => {
  const config = loadRewardAccountingSchedulerConfig({
    REWARD_ACCOUNTING_RUNTIME_ENABLED: 'true',
  }, 'host-a');
  assert.equal(config.enabled, false);
  assert.equal(config.secret, null);
});

test('reward accounting activo exige HMAC privado y Mongo no legacy', () => {
  const config = loadRewardAccountingSchedulerConfig({
    REWARD_ACCOUNTING_SCHEDULER_ENABLED: 'true',
    REWARD_ACCOUNTING_RUNTIME_ENABLED: 'true',
    REWARD_DAILY_ACCOUNTING_ENABLED: 'true',
    REWARD_WEEKLY_PAYOUT_ENABLED: 'true',
    REWARD_POOL_TRANCHES_ENABLED: 'true',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'staging-reward-accounting',
    ECONOMY_INTERNAL_HMAC_SECRET: 'reward-accounting-secret-with-entropy-A9!',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new-staging',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
  }, 'host-a');
  assert.equal(config.enabled, true);
  assert.equal(config.dbName, 'cukieshub-new-staging');
  assert.equal(config.secret, 'reward-accounting-secret-with-entropy-A9!');
});

test('el scheduler no puede activarse con el runtime apagado', () => {
  assert.throws(() => loadRewardAccountingSchedulerConfig({
    REWARD_ACCOUNTING_SCHEDULER_ENABLED: 'true',
    REWARD_ACCOUNTING_RUNTIME_ENABLED: 'false',
  }), /RUNTIME_ENABLED debe ser true/);
});

test('reward accounting rechaza secreto publico', () => {
  assert.throws(() => loadRewardAccountingSchedulerConfig({
    REWARD_ACCOUNTING_SCHEDULER_ENABLED: 'true',
    REWARD_ACCOUNTING_RUNTIME_ENABLED: 'true',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'staging-reward-accounting',
    ECONOMY_INTERNAL_HMAC_SECRET: 'reward-accounting-secret-with-entropy-A9!',
    NEXT_PUBLIC_LEAK: 'reward-accounting-secret-with-entropy-A9!',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new-staging',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
  }), /no puede ser publica/);
});
