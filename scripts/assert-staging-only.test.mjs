import assert from 'node:assert/strict';
import test from 'node:test';

import {
  StagingGuardError,
  validateStagingEnvironment,
} from './assert-staging-only.mjs';

function stagingEnvironment(overrides = {}) {
  return {
    APP_ENV: 'staging',
    STAGING_ONLY_GUARD: 'true',
    COOLIFY_BRANCH: '"staging"',
    COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg',
    NEXT_PUBLIC_APP_ENV: 'staging',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    NEXT_PUBLIC_ASM_TOKEN_ADDRESS: '0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C',
    NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c',
    NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://testnet.bscscan.com',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
    DATABASE_URL: 'mongodb://staging-user:redacted@mongo:27017/cukies-hub-staging?authSource=admin',
    CUKIES_DATABASE_URL:
      'mongodb://staging-legacy:redacted@mongo:27017/cukies-legacy-staging?authSource=admin',
    CHAIN_INDEXER_MONGO_URL:
      'mongodb://staging-economy:redacted@mongo:27017/cukieshub-new-staging?authSource=cukieshub-new-staging',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CARD_WORKER_MONGO_URL:
      'mongodb://staging-card:redacted@mongo:27017/cukieshub-new-staging?authSource=cukieshub-new-staging',
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
  assert.equal(result.indexerMongoDatabaseName, 'cukieshub-new-staging');
});

for (const [name, override, expectedMessage] of [
  ['production app env', { APP_ENV: 'production' }, 'APP_ENV must equal staging'],
  ['disabled staging guard', { STAGING_ONLY_GUARD: 'false' }, 'STAGING_ONLY_GUARD must equal true'],
  ['main branch', { COOLIFY_BRANCH: '"main"' }, 'must equal staging'],
  ['production Coolify UUID', { COOLIFY_RESOURCE_UUID: 'jookw8ow8woks088s44404ok' }, 'must equal u4s804'],
  ['BSC mainnet public chain', { NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, 'must equal 97'],
  ['public production app env', { NEXT_PUBLIC_APP_ENV: 'production' }, 'must equal staging'],
  ['BscScan mainnet', { NEXT_PUBLIC_BSCSCAN_BASE_URL: 'https://bscscan.com' }, 'testnet.bscscan.com'],
  [
    'PancakeSwap mainnet',
    { NEXT_PUBLIC_UKI_SWAP_URL: 'https://pancakeswap.finance/swap?chain=bsc' },
    'must target PancakeSwap BSC Testnet',
  ],
  ['BSC mainnet indexer chain', { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56' }, 'must equal 97'],
  ['production hub database', { DATABASE_URL: 'mongodb://mongo:27017/cukies-hub' }, 'cukies-hub-staging'],
  [
    'production legacy database',
    { CUKIES_DATABASE_URL: 'mongodb://mongo:27017/cukies' },
    'cukies-legacy-staging',
  ],
  ['production indexer database', { CHAIN_INDEXER_DB_NAME: 'cukieshub-new' }, 'cukieshub-new-staging'],
  [
    'production indexer Mongo URL',
    { CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new' },
    'CHAIN_INDEXER_MONGO_URL must target database cukieshub-new-staging',
  ],
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

test('accepts an optional swap only when it uses the configured testnet tokens', () => {
  const result = validateStagingEnvironment(stagingEnvironment({
    NEXT_PUBLIC_UKI_SWAP_URL:
      'https://pancakeswap.finance/swap?chain=bscTestnet&inputCurrency=0xf93dd40Bf8bD8dDf7C785AA87dc13C3c3FeB6c8C&outputCurrency=0x42895bBEc6A6EC1b4aF0B11E144Cd2777589C23c',
  }));

  assert.match(result.swapUrl, /chain=bscTestnet/);
  assert.throws(
    () => validateStagingEnvironment(stagingEnvironment({
      NEXT_PUBLIC_UKI_SWAP_URL:
        'https://pancakeswap.finance/swap?chain=bscTestnet&inputCurrency=0x1111111111111111111111111111111111111111&outputCurrency=0x2222222222222222222222222222222222222222',
    })),
    /must use the configured staging ASM\/UKI tokens/,
  );
});

test('accepts only one coherent optional UKI marketplace address across dapp and indexer', () => {
  const marketplace = '0x1111111111111111111111111111111111111111';
  const result = validateStagingEnvironment(stagingEnvironment({
    NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: marketplace,
    CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: marketplace.toUpperCase().replace('0X', '0x'),
  }));
  assert.equal(result.ukiMarketplaceAddress, marketplace);

  assert.throws(
    () => validateStagingEnvironment(stagingEnvironment({
      NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: marketplace,
      CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: '0x2222222222222222222222222222222222222222',
    })),
    /marketplace addresses must match/,
  );
  assert.throws(
    () => validateStagingEnvironment(stagingEnvironment({
      NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: '0x0000000000000000000000000000000000000000',
    })),
    /non-zero BSC address/,
  );
});

test('uses service scopes without requiring unrelated credentials', () => {
  const common = {
    APP_ENV: 'staging',
    STAGING_ONLY_GUARD: 'true',
    COOLIFY_BRANCH: 'staging',
    COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg',
  };

  assert.equal(validateStagingEnvironment({
    ...common,
    DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new-staging',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  }, 'chain-indexer').scope, 'chain-indexer');

  assert.equal(validateStagingEnvironment({
    ...common,
    DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging',
    CARD_WORKER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new-staging',
    CARD_WORKER_DB_NAME: 'cukieshub-new-staging',
  }, 'cuki-card-worker').scope, 'cuki-card-worker');

  assert.equal(validateStagingEnvironment({
    ...common,
    DATABASE_URL: 'mongodb://mongo:27017/cukies-hub-staging',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo:27017/cukieshub-new-staging',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
  }, 'economy-scheduler').scope, 'economy-scheduler');
});

test('rejects unknown service scopes', () => {
  assert.throws(
    () => validateStagingEnvironment(stagingEnvironment(), 'production-worker'),
    /unsupported guard scope production-worker/,
  );
});
