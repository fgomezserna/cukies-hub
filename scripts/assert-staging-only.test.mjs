import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StagingGuardError,
  validateStagingEnvironment,
} from './assert-staging-only.mjs';

function stagingEnvironment(overrides = {}) {
  return {
    APP_ENV: 'staging',
    COOLIFY_BRANCH: '"staging"',
    COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
    DATABASE_URL: 'mongodb://staging-user:redacted@mongo:27017/cukies-hub-staging?authSource=admin',
    CUKIES_DATABASE_URL:
      'mongodb://staging-legacy:redacted@mongo:27017/cukies-legacy-staging?authSource=admin',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CARD_WORKER_DB_NAME: 'cukieshub-new-staging',
    NEXTAUTH_URL: 'https://cukieshub.eurekand.com',
    ...overrides,
  };
}

test('accepts only the exact staging application, chain and database perimeter', () => {
  const result = validateStagingEnvironment(stagingEnvironment());
  assert.equal(result.ok, true);
  assert.equal(result.gitBranch, 'staging');
  assert.equal(result.coolifyApplicationId, '28');
  assert.equal(result.publicChainId, '97');
  assert.equal(result.databaseName, 'cukies-hub-staging');
  assert.equal(result.legacyDatabaseName, 'cukies-legacy-staging');
  assert.equal(result.indexerDatabaseName, 'cukieshub-new-staging');
});

for (const [name, override, expectedMessage] of [
  ['production app env', { APP_ENV: 'production' }, 'APP_ENV must equal staging'],
  ['main branch', { COOLIFY_BRANCH: '"main"' }, 'must equal staging'],
  ['production Coolify UUID', { COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok' }, 'must equal u4s804'],
  ['BSC mainnet public chain', { NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, 'must equal 97'],
  ['BSC mainnet indexer chain', { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56' }, 'must equal 97'],
  ['production hub database', { DATABASE_URL: 'mongodb://mongo:27017/cukies-hub' }, 'cukies-hub-staging'],
  [
    'production legacy database',
    { CUKIES_DATABASE_URL: 'mongodb://mongo:27017/cukies' },
    'cukies-legacy-staging',
  ],
  ['production indexer database', { CHAIN_INDEXER_DB_NAME: 'cukieshub-new' }, 'cukieshub-new-staging'],
  ['production auth URL', { NEXTAUTH_URL: 'https://cukies.world' }, 'approved staging HTTPS'],
]) {
  test(`rejects ${name}`, () => {
    assert.throws(
      () => validateStagingEnvironment(stagingEnvironment(override)),
      (error) => error instanceof StagingGuardError && error.message.includes(expectedMessage),
    );
  });
}

test('never includes Mongo credentials in a rejection message', () => {
  const secret = 'do-not-print-this-password';
  assert.throws(
    () => validateStagingEnvironment(stagingEnvironment({
      DATABASE_URL: `mongodb://user:${secret}@mongo:27017/production`,
    })),
    (error) => error instanceof StagingGuardError && !error.message.includes(secret),
  );
});

test('uses service scopes without requiring unrelated credentials', () => {
  const common = {
    APP_ENV: 'staging',
    COOLIFY_BRANCH: 'staging',
    COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg',
  };

  assert.equal(validateStagingEnvironment({
    ...common,
    DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  }, 'chain-indexer').scope, 'chain-indexer');

  assert.equal(validateStagingEnvironment({
    ...common,
    DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging',
    CARD_WORKER_DB_NAME: 'cukieshub-new-staging',
  }, 'cuki-card-worker').scope, 'cuki-card-worker');
});

test('rejects unknown service scopes', () => {
  assert.throws(
    () => validateStagingEnvironment(stagingEnvironment(), 'production-worker'),
    /unsupported guard scope production-worker/,
  );
});
