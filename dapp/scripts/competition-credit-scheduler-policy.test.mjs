import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadCompetitionCreditSchedulerConfig } from './competition-credit-scheduler-policy.mjs';

const STRONG_SECRET = 'B7!qL2@zN9#vR4$xC8%mK5&wT1*eY6+pD3=sH0_uF7-jS2.a';

function environment(overrides = {}) {
  return {
    COMPETITION_CREDITS_SCHEDULER_ENABLED: 'true',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    ECONOMY_INTERNAL_HMAC_KEY_ID: 'competition-credits-2026-01',
    ECONOMY_INTERNAL_HMAC_SECRET: STRONG_SECRET,
    ...overrides,
  };
}

describe('competition credit scheduler policy', () => {
  it('stays disabled without credentials by default', () => {
    const config = loadCompetitionCreditSchedulerConfig({}, 'host-a');
    assert.equal(config.enabled, false);
    assert.equal(config.schedulerId, 'host-a');
  });

  it('loads only a bounded scheduler for cukieshub-new', () => {
    const config = loadCompetitionCreditSchedulerConfig(environment(), 'host-a');
    assert.equal(config.enabled, true);
    assert.equal(config.dbName, 'cukieshub-new');
    assert.equal(config.baseUrl, 'http://dapp:3000');
    assert.equal(config.tickTimeoutMs, 240_000);
  });

  it('accepts the isolated staging economy database', () => {
    const config = loadCompetitionCreditSchedulerConfig(environment({
      CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    }), 'host-staging');
    assert.equal(config.enabled, true);
    assert.equal(config.dbName, 'cukieshub-new-staging');
  });

  it('rejects weak/public credentials, legacy DB and unsafe URLs', () => {
    assert.throws(() => loadCompetitionCreditSchedulerConfig(environment({
      ECONOMY_INTERNAL_HMAC_SECRET: 'a'.repeat(64),
    }), 'host-a'), /predecible/);
    assert.throws(() => loadCompetitionCreditSchedulerConfig(environment({
      NEXT_PUBLIC_REUSED_SECRET: STRONG_SECRET,
    }), 'host-a'), /NEXT_PUBLIC/);
    assert.throws(() => loadCompetitionCreditSchedulerConfig(environment({
      CHAIN_INDEXER_DB_NAME: 'cukies',
    }), 'host-a'), /cukieshub-new/);
    assert.throws(() => loadCompetitionCreditSchedulerConfig(environment({
      COMPETITION_CREDITS_SCHEDULER_BASE_URL: 'https://user:pass@example.com',
    }), 'host-a'), /sin credenciales/);
  });
});
