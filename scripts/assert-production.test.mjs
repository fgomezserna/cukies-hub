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

function bridgeRelayerEnvironment(overrides = {}) {
  return {
    APP_ENV: 'production',
    STAGING_ONLY_GUARD: 'false',
    COOLIFY_BRANCH: 'main',
    COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok',
    CUKIES_BRIDGE_RELAYER_ENABLED: 'true',
    CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM:
      'ENABLE_TRON_MAINNET_TO_BSC_MAINNET_LEGACY_RELAYER',
    CUKIES_BRIDGE_RELAYER_MONGO_URL:
      'mongodb://bridge:redacted@mongo:27017/cukieshub-new?authSource=admin',
    CUKIES_BRIDGE_RELAYER_DB_NAME: 'cukieshub-new',
    CUKIES_BRIDGE_RELAYER_TRON_NETWORK: 'mainnet',
    CUKIES_BRIDGE_RELAYER_TRON_RPC_URL: 'https://api.trongrid.io',
    CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL: 'https://api.trongrid.io/v1',
    CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS:
      'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
    CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS:
      'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
    CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS: '1750000000000',
    CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: '56',
    CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS:
      'https://bsc-rpc.publicnode.com,https://bsc-dataseed.bnbchain.org',
    CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS:
      '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS:
      '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
    CUKIES_BRIDGE_RELAYER_BSC_EXPECTED_SIGNER_ADDRESS:
      '0x3d80cbEd6CA067a154A22659224EB5194aDCe24C',
    CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
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

  const dappResult = validateProductionEnvironment({
    ...common,
    COOLIFY_RESOURCE_UUID: 'uo8gswsg84c488cowko0kkkg',
    NEXT_PUBLIC_UKI_CHAIN_ID: '56',
    CUKIES_DATABASE_URL: 'mongodb://mongo:27017/cukies',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukies-hub',
    NEXTAUTH_URL: 'https://cukies.world',
    NEXT_PUBLIC_UKI_STAKING_ADDRESS: '0xad18ff665e99d0033c3bb9d73182c2b03df59696',
  }, 'dapp');
  assert.equal(dappResult.scope, 'dapp');
  assert.equal(dappResult.coolifyApplicationId, '33');

  assert.equal(validateProductionEnvironment(
    bridgeRelayerEnvironment(),
    'cukies-bridge-relayer',
  ).scope, 'cukies-bridge-relayer');
});

test('accepts the explicitly enabled TRON-mainnet to BSC-mainnet bridge relayer', () => {
  const result = validateProductionEnvironment(
    bridgeRelayerEnvironment(),
    'cukies-bridge-relayer',
  );

  assert.equal(result.ok, true);
  assert.equal(result.bridgeRelayerDatabaseName, 'cukieshub-new');
  assert.equal(result.bridgeRelayerMongoDatabaseName, 'cukieshub-new');
});

test('rejects the bridge relayer without its explicit execution confirmation', () => {
  assert.throws(
    () => validateProductionEnvironment(
      bridgeRelayerEnvironment({
        CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: 'not-authorized',
      }),
      'cukies-bridge-relayer',
    ),
    (error) => error instanceof ProductionGuardError
      && error.message.includes('ENABLE_TRON_MAINNET_TO_BSC_MAINNET_LEGACY_RELAYER'),
  );
});

test('rejects unknown service scopes', () => {
  assert.throws(
    () => validateProductionEnvironment(productionEnvironment(), 'economy-scheduler'),
    /unsupported guard scope economy-scheduler/,
  );
});
