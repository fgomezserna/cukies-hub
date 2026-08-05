import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadCukieMasterSchedulerConfig } from './cukie-master-scheduler-policy.mjs';

const STRONG_SECRET = 'B7!qL2@zN9#vR4$xC8%mK5&wT1*eY6+pD3=sH0_uF7-jS2.a';

function environment(overrides = {}) {
  return {
    CHAIN_INDEXER_CUKIE_MASTER_ENABLED: 'true',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'cukie-master-2026-01',
    ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
    CUKIE_MASTER_QUEUE_LIMIT: '100',
    ...overrides,
  };
}

describe('Cukie Master scheduler policy', () => {
  it('loads a bounded production configuration', () => {
    const config = loadCukieMasterSchedulerConfig(environment(), 'host-a');
    assert.equal(config.enabled, true);
    assert.equal(config.queueLimit, 100);
    assert.equal(config.schedulerId, 'host-a');
    assert.equal(config.dbName, 'cukieshub-new');
  });

  it('rejects weak, public-reused and malformed HMAC credentials', () => {
    assert.throws(() => loadCukieMasterSchedulerConfig(environment({
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'bad key',
    })), /formato invalido/);
    assert.throws(() => loadCukieMasterSchedulerConfig(environment({
      ECONOMY_INTERNAL_HMAC_SECRET: 'a'.repeat(64),
    })), /predecible/);
    assert.throws(() => loadCukieMasterSchedulerConfig(environment({
      NEXT_PUBLIC_REUSED_SECRET: STRONG_SECRET,
    })), /NEXT_PUBLIC/);
  });

  it('rejects queue limits outside 1..500 and the legacy database', () => {
    assert.throws(() => loadCukieMasterSchedulerConfig(environment({
      CUKIE_MASTER_QUEUE_LIMIT: '0',
    })), /entre 1 y 500/);
    assert.throws(() => loadCukieMasterSchedulerConfig(environment({
      CUKIE_MASTER_QUEUE_LIMIT: '501',
    })), /entre 1 y 500/);
    assert.throws(() => loadCukieMasterSchedulerConfig(environment({
      CHAIN_INDEXER_DB_NAME: 'cukies',
    })), /no puede/);
  });
});
