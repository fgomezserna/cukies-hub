import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';
import { TronWeb } from 'tronweb';

import {
  BRIDGE_E2E_CONFIRM,
  buildBridgeE2eConfig,
} from './e2e-config.js';
import {
  EXECUTION_CONFIRM as RELAYER_EXECUTION_CONFIRM,
  LEGACY_MAINNET,
} from './config.js';

const tronPrivateKey = '11'.repeat(32);
const bscPrivateKey = `0x${'22'.repeat(32)}` as const;
const bscExpectedSignerAddress = privateKeyToAccount(bscPrivateKey).address;

function tronAddress(privateKey: string) {
  const address = TronWeb.address.fromPrivateKey(privateKey);
  if (!address) {
    throw new Error('No se pudo derivar la address fixture del test.');
  }
  return address;
}

const tronOwnerAddress = tronAddress(tronPrivateKey);

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    APP_ENV: 'production',
    STAGING_ONLY_GUARD: 'false',
    CUKIES_BRIDGE_RELAYER_ENABLED: 'true',
    CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: RELAYER_EXECUTION_CONFIRM,
    CUKIES_BRIDGE_RELAYER_MONGO_URL:
      'mongodb://127.0.0.1:37018/cukieshub-new?replicaSet=cukies-mainnet-e2e-rs',
    CUKIES_BRIDGE_RELAYER_DB_NAME: 'cukieshub-new',
    CUKIES_BRIDGE_RELAYER_TRON_NETWORK: LEGACY_MAINNET.tronNetwork,
    CUKIES_BRIDGE_RELAYER_TRON_RPC_URL: LEGACY_MAINNET.tronRpcUrl,
    CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL: LEGACY_MAINNET.tronApiBaseUrl,
    CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS:
      LEGACY_MAINNET.tronCollectionAddress,
    CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS:
      LEGACY_MAINNET.tronBridgeAddress,
    CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS: '1788000000000',
    CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: '56',
    CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS: 'https://bsc-rpc.publicnode.com',
    CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS:
      LEGACY_MAINNET.bscCollectionAddress,
    CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS:
      LEGACY_MAINNET.bscBridgeAddress,
    CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY: bscPrivateKey,
    CUKIES_BRIDGE_RELAYER_BSC_EXPECTED_SIGNER_ADDRESS: bscExpectedSignerAddress,
    CUKIES_BRIDGE_E2E_CONFIRM: BRIDGE_E2E_CONFIRM,
    CUKIES_BRIDGE_E2E_TRON_PRIVATE_KEY: tronPrivateKey,
    CUKIES_BRIDGE_E2E_TRON_OWNER_ADDRESS: tronOwnerAddress,
    CUKIES_BRIDGE_E2E_BSC_OWNER_ADDRESS:
      privateKeyToAccount(bscPrivateKey).address,
    CUKIES_BRIDGE_E2E_TOKEN_ID: '1000000002279',
  };
}

describe('buildBridgeE2eConfig', () => {
  it('acepta exclusivamente TRON mainnet, BSC56 y el Mongo E2E local', () => {
    const config = buildBridgeE2eConfig(validEnvironment());
    assert.equal(config.relayer.bscChainId, 56);
    assert.equal(config.relayer.dbName, 'cukieshub-new');
    assert.equal(config.tokenId, '1000000002279');
    assert.equal(config.callFeeLimitSun, 300_000_000);
  });

  it('rechaza Mongo remoto y una confirmacion ausente', () => {
    assert.throws(
      () => buildBridgeE2eConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_MONGO_URL:
          'mongodb://e2e.example/cukieshub-new',
      }),
      /Mongo local/,
    );
    assert.throws(
      () => buildBridgeE2eConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_E2E_CONFIRM: '',
      }),
      /Falta CUKIES_BRIDGE_E2E_CONFIRM/,
    );
  });

  it('rechaza una clave TRON mainnet que no corresponda al owner', () => {
    assert.throws(
      () => buildBridgeE2eConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_E2E_TRON_PRIVATE_KEY: '33'.repeat(32),
      }),
      /no corresponde/,
    );
  });
});
