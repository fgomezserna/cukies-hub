import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadRewardBatchPublisherConfig,
  publicRewardBatchPublisherConfig,
} from './reward-batch-publisher-policy.mjs';

const PRIVATE_KEY = `0x${'11'.repeat(32)}`;
const SIGNER = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A';

function environment(overrides = {}) {
  return {
    REWARD_BATCH_PUBLISHER_ENABLED: 'true',
    REWARD_BATCH_PUBLISHER_ID: 'staging-publisher',
    APP_ENV: 'staging',
    STAGING_ONLY_GUARD: 'true',
    COOLIFY_BRANCH: 'staging',
    COOLIFY_RESOURCE_UUID: 'u4s804o4wwcckowgk0woo4wg',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new-staging',
    CHAIN_INDEXER_MONGO_URL: 'mongodb://user:secret@mongo:27017/cukieshub-new-staging',
    CHAIN_INDEXER_BSC_RPC_URL: 'https://rpc.example.test',
    NEXT_PUBLIC_UKI_TOKEN_ADDRESS: '0x1111111111111111111111111111111111111111',
    CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS:
      '0x2222222222222222222222222222222222222222',
    REWARD_BATCH_PUBLISHER_PRIVATE_KEY: PRIVATE_KEY,
    REWARD_BATCH_PUBLISHER_EXPECTED_SIGNER_ADDRESS: SIGNER,
    ...overrides,
  };
}

test('permanece inerte sin clave cuando el gate esta apagado', () => {
  assert.deepEqual(loadRewardBatchPublisherConfig({
    REWARD_BATCH_PUBLISHER_ENABLED: 'false',
  }, 'host-a'), {
    enabled: false,
    schedulerId: 'host-a',
    intervalMs: 60_000,
  });
});

test('carga solo un publicador testnet aislado y no expone la clave', () => {
  const config = loadRewardBatchPublisherConfig(environment());
  assert.equal(config.signerAddress, SIGNER);
  assert.equal(config.chainId, 97);
  assert.equal(config.databaseName, 'cukieshub-new-staging');
  const publicConfig = publicRewardBatchPublisherConfig(config);
  assert.equal('privateKey' in publicConfig, false);
  assert.equal('mongoUrl' in publicConfig, false);
  assert.equal('rpcUrl' in publicConfig, false);
});

for (const [name, override, message] of [
  ['mainnet', { CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '56' }, 'debe ser 97'],
  ['production', { APP_ENV: 'production' }, 'APP_ENV debe ser staging'],
  ['otra base', { CHAIN_INDEXER_MONGO_URL: 'mongodb://mongo/cukieshub-new' }, 'debe apuntar'],
  ['otra wallet', {
    REWARD_BATCH_PUBLISHER_EXPECTED_SIGNER_ADDRESS:
      '0x3333333333333333333333333333333333333333',
  }, 'no coincide'],
]) {
  test(`rechaza ${name}`, () => {
    assert.throws(() => loadRewardBatchPublisherConfig(environment(override)), new RegExp(message));
  });
}
