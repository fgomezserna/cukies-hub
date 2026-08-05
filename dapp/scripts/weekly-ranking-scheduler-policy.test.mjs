import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadWeeklyRankingSchedulerConfig } from './weekly-ranking-scheduler-policy.mjs';

const secret = 'weekly-ranking-secret-with-enough-entropy-123456789';

describe('weekly ranking scheduler policy', () => {
  it('stays disabled without credentials', () => {
    const config = loadWeeklyRankingSchedulerConfig({}, 'host-a');
    assert.equal(config.enabled, false);
    assert.equal(config.schedulerId, 'host-a');
    assert.equal(config.keyId, null);
  });

  it('requires private HMAC and the new economy database when enabled', () => {
    assert.throws(() => loadWeeklyRankingSchedulerConfig({
      WEEKLY_RANKING_RUNTIME_ENABLED: 'true',
    }), /ECONOMY_INTERNAL_HMAC_KEY_ID/);
    assert.throws(() => loadWeeklyRankingSchedulerConfig({
      WEEKLY_RANKING_RUNTIME_ENABLED: 'true',
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'ranking-v1',
      ECONOMY_INTERNAL_HMAC_SECRET: secret,
      CHAIN_INDEXER_MONGO_URL: 'mongodb://example',
      CHAIN_INDEXER_DB_NAME: 'cukies',
    }), /legacy/);
    assert.throws(() => loadWeeklyRankingSchedulerConfig({
      WEEKLY_RANKING_RUNTIME_ENABLED: 'true',
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'ranking-v1',
      ECONOMY_INTERNAL_HMAC_SECRET: secret,
      NEXT_PUBLIC_BAD_SECRET: secret,
      CHAIN_INDEXER_MONGO_URL: 'mongodb://example',
    }), /no puede ser publica/);
  });

  it('loads the enabled bounded policy', () => {
    const config = loadWeeklyRankingSchedulerConfig({
      WEEKLY_RANKING_RUNTIME_ENABLED: 'true',
      ECONOMY_INTERNAL_HMAC_KEY_ID: 'ranking-v1',
      ECONOMY_INTERNAL_HMAC_SECRET: secret,
      CHAIN_INDEXER_MONGO_URL: 'mongodb://example',
      CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
      WEEKLY_RANKING_SCHEDULER_INTERVAL_MS: '3600000',
    }, 'host-a');
    assert.equal(config.enabled, true);
    assert.equal(config.intervalMs, 3_600_000);
    assert.equal(config.dbName, 'cukieshub-new');
  });
});
