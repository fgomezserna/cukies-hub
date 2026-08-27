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
    DATABASE_URL: 'mongodb://production:redacted@mongo:27017/cukies-hub?authSource=admin',
    CUKIES_DATABASE_URL: 'mongodb://legacy:redacted@mongo:27017/cukies?authSource=admin',
    CHAIN_INDEXER_MONGO_URL:
      'mongodb://economy:redacted@mongo:27017/cukies-hub?authSource=admin',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    CARD_WORKER_MONGO_URL:
      'mongodb://cards:redacted@mongo:27017/cukies-hub?authSource=admin',
    CARD_WORKER_DB_NAME: 'cukieshub-new',
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
  assert.equal(result.databaseName, 'cukies-hub');
  assert.equal(result.legacyDatabaseName, 'cukies');
  assert.equal(result.indexerDatabaseName, 'cukieshub-new');
  assert.equal(result.authHost, 'cukies.world');
});

for (const [name, override, expectedMessage] of [
  ['staging environment', { APP_ENV: 'staging' }, 'APP_ENV must equal production'],
  ['enabled staging guard', { STAGING_ONLY_GUARD: 'true' }, 'must equal false'],
  ['staging branch', { COOLIFY_BRANCH: 'staging' }, 'must equal main'],
  ['staging resource', { COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg' }, 'must equal jookw8'],
  ['testnet public chain', { NEXT_PUBLIC_UKI_CHAIN_ID: '97' }, 'must equal 56'],
  ['testnet indexer chain', { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97' }, 'must equal 56'],
  ['staging database', { DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging' }, 'cukies-hub'],
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
    DATABASE_URL: 'mongodb://mongo:27017/cukies-hub',
  };

  assert.equal(validateProductionEnvironment({
    ...common,
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukies-hub',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56',
    CHAIN_INDEXER_UKI_STAKING_ADDRESS: '0xaD18ff665E99d0033c3BB9d73182c2B03Df59696',
    CHAIN_INDEXER_CONTRACT_ALIASES: 'PRESALE,UKI_STAKING',
  }, 'chain-indexer').scope, 'chain-indexer');

  assert.equal(validateProductionEnvironment({
    ...common,
    CARD_WORKER_MONGO_URL: 'mongodb://mongo:27017/cukies-hub',
    CARD_WORKER_DB_NAME: 'cukieshub-new',
  }, 'cuki-card-worker').scope, 'cuki-card-worker');
});

test('rejects unknown service scopes', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment(), 'economy-scheduler'),
    /unsupported guard scope economy-scheduler/,
  );
});
