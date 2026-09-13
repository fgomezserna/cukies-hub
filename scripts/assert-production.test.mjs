import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProductionGuardError,
  validateProductionEnvironment,
} from './assert-production.mjs';

function productionEnvironment(overrides = {}) {
  return {
    APP_ENV: 'production',
    STAGING_ONLY_GUARD: 'false',
    COOLIFY_BRANCH: '"main"',
    COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok',
    NEXT_PUBLIC_UKI_CHAIN_ID: '56',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
    DATABASE_URL: 'mongodb://runtime:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CUKIES_DATABASE_URL: 'mongodb://runtime:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CHAIN_INDEXER_MONGO_URL:
      'mongodb://runtime:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    CARD_WORKER_MONGO_URL:
      'mongodb://runtime:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CARD_WORKER_DB_NAME: 'cukieshub-new',
    CUKIES_BRIDGE_RELAYER_MONGO_URL:
      'mongodb://runtime:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CUKIES_BRIDGE_RELAYER_DB_NAME: 'cukieshub-new',
    NEXTAUTH_URL: 'https://cukies.world',
    NEXT_PUBLIC_UKI_STAKING_ADDRESS: '0xaD18ff665E99d0033c3BB9d73182c2B03Df59696',
    CHAIN_INDEXER_UKI_STAKING_ADDRESS: '0xaD18ff665E99d0033c3BB9d73182c2B03Df59696',
    CHAIN_INDEXER_CONTRACT_ALIASES: 'PRESALE,UKI_STAKING',
    ...overrides,
  };
}

test('accepts the exact production application, chain, databases and staking contract', () => {
  const result = validateProductionEnvironment(productionEnvironment());
  assert.equal(result.ok, true);
  assert.equal(result.gitBranch, 'main');
  assert.equal(result.publicChainId, '56');
  assert.equal(result.indexerChainId, '56');
  assert.equal(result.unifiedDatabaseName, 'cukieshub-new');
  assert.equal(result.databaseName, 'cukieshub-new');
  assert.equal(result.legacyDatabaseName, 'cukieshub-new');
  assert.equal(result.indexerDatabaseName, 'cukieshub-new');
  assert.equal(result.authHost, 'cukies.world');
});

test('accepts the optional legacy indexer on the same production Mongo runtime', () => {
  const result = validateProductionEnvironment(productionEnvironment({
    CUKIES_LEGACY_INDEXER_MONGO_URL:
      'mongodb://runtime:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CUKIES_LEGACY_INDEXER_DB_NAME: 'cukieshub-new',
  }));
  assert.equal(result.legacyIndexerDatabaseName, 'cukieshub-new');
});

for (const [name, override, expectedMessage] of [
  ['staging environment', { APP_ENV: 'staging' }, 'APP_ENV must equal production'],
  ['enabled staging guard', { STAGING_ONLY_GUARD: 'true' }, 'must equal false'],
  ['staging branch', { COOLIFY_BRANCH: 'staging' }, 'must equal main'],
  ['staging resource', { COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg' }, 'approved production resources'],
  ['testnet public chain', { NEXT_PUBLIC_UKI_CHAIN_ID: '97' }, 'must equal 56'],
  ['testnet indexer chain', { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97' }, 'must equal 56'],
  ['staging database', { DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging' }, 'cukieshub-new'],
  ['staging auth host', { NEXTAUTH_URL: 'https://cukieshub.eurekand.com' }, 'approved production HTTPS'],
  ['wrong staking contract', { NEXT_PUBLIC_UKI_STAKING_ADDRESS: '0x0000000000000000000000000000000000000001' }, 'approved mainnet staking'],
  ['missing staking alias', { CHAIN_INDEXER_CONTRACT_ALIASES: 'PRESALE' }, 'must include UKI_STAKING'],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => validateProductionEnvironment(productionEnvironment(override)),
      (error) => error instanceof ProductionGuardError && error.message.includes(expectedMessage),
    );
  });
}

test('never includes Mongo credentials in a rejection message', () => {
  const secret = 'do-not-print-this-password';
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment({
      DATABASE_URL: `mongodb://user:${secret}@mongo:27017/not-production`,
    })),
    (error) => error instanceof ProductionGuardError && !error.message.includes(secret),
  );
});

test('uses service scopes without requiring unrelated credentials', () => {
  const common = {
    APP_ENV: 'production',
    STAGING_ONLY_GUARD: 'false',
    COOLIFY_BRANCH: 'main',
    COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok',
    DATABASE_URL: 'mongodb://mongo:27017/cukieshub-new',
  };

  assert.equal(validateProductionEnvironment({
    ...common,
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
    CHAIN_INDEXER_UKI_STAKING_ADDRESS: '0xaD18ff665E99d0033c3BB9d73182c2B03Df59696',
    CHAIN_INDEXER_CONTRACT_ALIASES: 'PRESALE,UKI_STAKING',
  }, 'chain-indexer').scope, 'chain-indexer');

  assert.equal(validateProductionEnvironment({
    ...common,
    CARD_WORKER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new',
    CARD_WORKER_DB_NAME: 'cukieshub-new',
  }, 'cuki-card-worker').scope, 'cuki-card-worker');
});

test('accepts an economy scheduler on the unified production database', () => {
  const result = validateProductionEnvironment({
    APP_ENV: 'production',
    STAGING_ONLY_GUARD: 'false',
    COOLIFY_BRANCH: 'main',
    COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok',
    DATABASE_URL: 'mongodb://runtime:secret@mongo:27017/cukieshub-new',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://runtime:secret@mongo:27017/cukieshub-new',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
    CHAIN_INDEXER_UKI_STAKING_ADDRESS: '0xaD18ff665E99d0033c3BB9d73182c2B03Df59696',
    CHAIN_INDEXER_CONTRACT_ALIASES: 'PRESALE,UKI_STAKING',
  }, 'economy-scheduler');
  assert.equal(result.scope, 'economy-scheduler');
});

test('requires the indexer Mongo identity for a production economy scheduler', () => {
  assert.throws(
    () => validateProductionEnvironment({
      APP_ENV: 'production',
      STAGING_ONLY_GUARD: 'false',
      COOLIFY_BRANCH: 'main',
      COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok',
      DATABASE_URL: 'mongodb://runtime:secret@mongo:27017/cukieshub-new',
    }, 'economy-scheduler'),
    /CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID is required|CHAIN_INDEXER_DB_NAME is required|CHAIN_INDEXER_MONGO_URL is required/,
  );
});

test('accepts the dedicated production web resource for the dapp scope', () => {
  const result = validateProductionEnvironment(productionEnvironment({
    COOLIFY_RESOURCE_UUID: 'uo8gswsg84c488cowko0kkkg',
  }), 'dapp');
  assert.equal(result.coolifyResourceUuid, 'uo8gswsg84c488cowko0kkkg');
  assert.equal(result.coolifyApplicationId, '33');
});

test('production card worker only accepts the indexed source', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment({
      CARD_WORKER_SOURCE_FORMAT: 'legacy',
    }), 'cuki-card-worker'),
    /CARD_WORKER_SOURCE_FORMAT must equal indexed/,
  );
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment({
      CARD_WORKER_LEGACY_STAGING_ENABLED: 'true',
    }), 'cuki-card-worker'),
    /CARD_WORKER_LEGACY_STAGING_ENABLED must be false/,
  );
});

test('production rejects enabling the staging-only bridge relayer', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment({
      CUKIES_BRIDGE_RELAYER_ENABLED: 'true',
    }), 'cukies-bridge-relayer'),
    /must be false in production; the relayer is staging-only/,
  );
});

test('rejects different production Mongo runtime users or endpoints', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment({
      CARD_WORKER_MONGO_URL: 'mongodb://different-user:redacted@other-mongo:27017/cukieshub-new',
    })),
    /same endpoint, database and runtime credentials/,
  );
});

test('rejects a different production Mongo password even with the same endpoint', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment({
      CARD_WORKER_MONGO_URL: 'mongodb://runtime:other-secret@mongo:27017/cukieshub-new',
    })),
    /same endpoint, database and runtime credentials/,
  );
});

test('rejects retired eventlog variables and URLs', () => {
  for (const override of [
    { NX_TRON_DB: 'mongodb://runtime:redacted@mongo:27017/eventlog' },
    { EVENTLOG_MONGO_URL: 'mongodb://runtime:redacted@mongo:27017/eventlog' },
    { DATABASE_URL: 'mongodb://runtime:redacted@mongo:27017/cukieshub-new?appName=eventlog' },
  ]) {
    assert.throws(
      () => validateProductionEnvironment(productionEnvironment(override)),
      /retired eventlog|must not reference retired eventlog/,
    );
  }
});

test('rejects unknown service scopes', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment(), 'unknown-service'),
    /unsupported guard scope unknown-service/,
  );
});
