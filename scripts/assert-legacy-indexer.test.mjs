import assert from 'node:assert/strict';
import test from 'node:test';

import { validateLegacyIndexerEnvironment } from './assert-legacy-indexer.mjs';
import { validateProductionEnvironment } from './assert-production.mjs';
import { validateStagingEnvironment } from './assert-staging-only.mjs';

const TARGETS = Object.freeze({
  staging: {
    appEnv: 'staging',
    branch: 'staging',
    guard: 'true',
    uuid: 'u4s804o4wwcckowgk0woo4wg',
    dbName: 'cukies-legacy-indexer-staging',
  },
  production: {
    appEnv: 'production',
    branch: 'main',
    guard: 'false',
    uuid: 'jookw8ow8woks088s44404ok',
    dbName: 'cukies-legacy-indexer',
  },
});

function legacyEnvironment(target, overrides = {}) {
  const expected = TARGETS[target];
  return {
    APP_ENV: expected.appEnv,
    CUKIES_SERVICE: 'legacy-chain-indexer',
    CUKIES_LEGACY_INDEXER_ENABLED: 'true',
    CUKIES_LEGACY_BSC_CHAIN_ID: '56',
    CUKIES_LEGACY_BSC_RPC_URLS: 'https://bsc-rpc.example.test',
    CUKIES_LEGACY_BSC_START_BLOCK: '1',
    CUKIES_LEGACY_TRON_API_BASE_URL: 'https://api.trongrid.io/v1',
    CUKIES_LEGACY_TRON_NETWORK: 'mainnet',
    CUKIES_LEGACY_TRON_START_TIMESTAMP_MS: '1',
    CUKIES_LEGACY_INDEXER_MONGO_URL: `mongodb://mongo.example.test:27017/${expected.dbName}`,
    CUKIES_LEGACY_INDEXER_DB_NAME: expected.dbName,
    COOLIFY_BRANCH: expected.branch,
    COOLIFY_RESOURCE_UUID: expected.uuid,
    STAGING_ONLY_GUARD: expected.guard,
    ...overrides,
  };
}

const validators = Object.freeze({
  staging: (environment) => validateStagingEnvironment(environment, 'legacy-chain-indexer'),
  production: (environment) => validateProductionEnvironment(environment, 'legacy-chain-indexer'),
});

for (const target of Object.keys(TARGETS)) {
  test(`accepts the complete ${target} legacy indexer perimeter`, () => {
    const result = validators[target](legacyEnvironment(target));

    assert.equal(result.ok, true);
    assert.equal(result.target, target);
    assert.equal(result.dbName, TARGETS[target].dbName);
    assert.equal(result.runtimeScope, 'legacy');
  });
}

test('direct legacy validator accepts the synthetic staging configuration', () => {
  const result = validateLegacyIndexerEnvironment(legacyEnvironment('staging'), 'staging');

  assert.deepEqual(result, {
    ok: true,
    target: 'staging',
    dbName: TARGETS.staging.dbName,
    runtimeScope: 'legacy',
  });
});

test('rejects an incorrect Coolify UUID while branch and database remain valid', () => {
  const environment = legacyEnvironment('staging', {
    COOLIFY_RESOURCE_UUID: 'wrong-resource-uuid',
  });

  assert.equal(environment.COOLIFY_BRANCH, TARGETS.staging.branch);
  assert.equal(environment.CUKIES_LEGACY_INDEXER_DB_NAME, TARGETS.staging.dbName);
  assert.throws(
    () => validators.staging(environment),
    /COOLIFY_RESOURCE_UUID must equal u4s804o4wwcckowgk0woo4wg/,
  );
});

for (const target of Object.keys(TARGETS)) {
  const otherTarget = target === 'staging' ? 'production' : 'staging';
  test(`rejects a ${otherTarget} legacy database in ${target}`, () => {
    const environment = legacyEnvironment(target, {
      CUKIES_LEGACY_INDEXER_MONGO_URL:
        `mongodb://mongo.example.test:27017/${TARGETS[otherTarget].dbName}`,
      CUKIES_LEGACY_INDEXER_DB_NAME: TARGETS[otherTarget].dbName,
    });

    assert.throws(
      () => validators[target](environment),
      new RegExp(`must target database ${TARGETS[target].dbName}`),
    );
  });
}

for (const [name, override, expectedMessage] of [
  [
    'BSC Testnet chain 97',
    { CUKIES_LEGACY_BSC_CHAIN_ID: '97' },
    'CUKIES_LEGACY_BSC_CHAIN_ID must equal 56',
  ],
  [
    'Tron Nile API URL',
    { CUKIES_LEGACY_TRON_API_BASE_URL: 'https://nile.trongrid.io/v1' },
    'CUKIES_LEGACY_TRON_API_BASE_URL must equal https://api.trongrid.io/v1',
  ],
  [
    'Tron Nile network',
    { CUKIES_LEGACY_TRON_NETWORK: 'nile' },
    'CUKIES_LEGACY_TRON_NETWORK must equal mainnet',
  ],
  [
    'disabled worker',
    { CUKIES_LEGACY_INDEXER_ENABLED: 'false' },
    'CUKIES_LEGACY_INDEXER_ENABLED must equal true',
  ],
]) {
  test(`rejects ${name} in both deployment targets`, () => {
    for (const target of Object.keys(TARGETS)) {
      assert.throws(
        () => validators[target](legacyEnvironment(target, override)),
        new RegExp(expectedMessage),
      );
    }
  });
}

test('rejects an APP_ENV that disagrees with the explicit staging target', () => {
  assert.throws(
    () => validators.staging(legacyEnvironment('staging', { APP_ENV: 'production' })),
    /APP_ENV must equal staging/,
  );
});
