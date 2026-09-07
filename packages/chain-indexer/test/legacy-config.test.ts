import assert from 'node:assert/strict';
import test from 'node:test';

import { getLegacyIndexerConfig, LEGACY_DB_NAMES } from '../src/config/legacy-env.js';

function env(overrides: Record<string, string> = {}) {
  return {
    APP_ENV: 'staging', CUKIES_SERVICE: 'legacy-chain-indexer', CUKIES_LEGACY_INDEXER_ENABLED: 'true',
    CUKIES_LEGACY_INDEXER_MONGO_URL: `mongodb://127.0.0.1:37018/${LEGACY_DB_NAMES.staging}`,
    CUKIES_LEGACY_INDEXER_DB_NAME: LEGACY_DB_NAMES.staging,
    CUKIES_LEGACY_BSC_RPC_URLS: 'https://bsc.example.test', CUKIES_LEGACY_BSC_START_BLOCK: '16906879',
    CUKIES_LEGACY_TRON_API_BASE_URL: 'https://api.trongrid.io/v1', CUKIES_LEGACY_TRON_NETWORK: 'mainnet', CUKIES_LEGACY_TRON_START_TIMESTAMP_MS: '1',
    ...overrides,
  };
}

test('legacy staging is pinned to BSC 56 and the dedicated database', () => {
  const config = getLegacyIndexerConfig(env());
  assert.equal(config.bscExpectedChainId, 56);
  assert.equal(config.dbName, LEGACY_DB_NAMES.staging);
  assert.equal(config.runtimeScope, 'legacy');
  assert.equal(config.legacyContractProofs.length, 14);
});

test('legacy rejects chain 97 and production database in staging', () => {
  assert.throws(() => getLegacyIndexerConfig(env({ CUKIES_LEGACY_BSC_CHAIN_ID: '97' })));
  assert.throws(() => getLegacyIndexerConfig(env({ CUKIES_LEGACY_INDEXER_DB_NAME: 'cukieshub-new-staging', CUKIES_LEGACY_INDEXER_MONGO_URL: 'mongodb://127.0.0.1:37018/cukieshub-new-staging' })));
  assert.throws(() => getLegacyIndexerConfig(env({ CUKIES_LEGACY_CONTRACT_ALIASES: 'TOKEN,UKI_TOKEN' })));
  assert.throws(() => getLegacyIndexerConfig(env({ CUKIES_LEGACY_TRON_API_BASE_URL: 'https://nile.trongrid.io/v1' })));
  assert.throws(() => getLegacyIndexerConfig(env({ CUKIES_LEGACY_TRON_NETWORK: 'nile' })));
});

test('legacy disabled defaults closed without changing the parsed scope', () => {
  const config = getLegacyIndexerConfig(env({ CUKIES_LEGACY_INDEXER_ENABLED: 'false' }));
  assert.equal(config.enabled, false);
  assert.equal(config.runtimeScope, 'legacy');
});
