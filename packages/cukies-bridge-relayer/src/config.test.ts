import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TronWeb } from 'tronweb';

import { buildBridgeRelayerConfig } from './config.js';

const tronCollection = TronWeb.address.fromPrivateKey('1'.repeat(64));
const tronEndpoint = TronWeb.address.fromPrivateKey('2'.repeat(64));
if (!tronCollection || !tronEndpoint) throw new Error('No se pudieron crear fixtures TRON.');
const tronCollectionAddress = tronCollection as string;
const tronEndpointAddress = tronEndpoint as string;

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    APP_ENV: 'staging',
    STAGING_ONLY_GUARD: 'true',
    CUKIES_BRIDGE_RELAYER_ENABLED: 'true',
    CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM:
      'ENABLE_TRON_NILE_TO_BSC_TESTNET_RELAYER',
    CUKIES_BRIDGE_RELAYER_MONGO_URL:
      'mongodb://127.0.0.1:27017/cukieshub-new-staging',
    CUKIES_BRIDGE_RELAYER_DB_NAME: 'cukieshub-new-staging',
    CUKIES_BRIDGE_RELAYER_TRON_NETWORK: 'nile',
    CUKIES_BRIDGE_RELAYER_TRON_RPC_URL: 'https://nile.trongrid.io',
    CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL: 'https://nile.trongrid.io/v1',
    CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS: tronCollectionAddress,
    CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS: tronEndpointAddress,
    CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS: '1788000000000',
    CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: '97',
    CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
    CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS:
      '0x1111111111111111111111111111111111111111',
    CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS:
      '0x2222222222222222222222222222222222222222',
    CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY: `0x${'33'.repeat(32)}`,
  };
}

describe('buildBridgeRelayerConfig', () => {
  it('queda desactivado por defecto sin exigir claves ni conexiones', () => {
    assert.deepEqual(buildBridgeRelayerConfig({}), { enabled: false });
  });

  it('acepta solo la topologia Stage Nile -> BSC Testnet completa', () => {
    const config = buildBridgeRelayerConfig(validEnvironment());
    assert.equal(config.enabled, true);
    if (!config.enabled) return;
    assert.equal(config.dbName, 'cukieshub-new-staging');
    assert.equal(config.tronRpcUrl, 'https://nile.trongrid.io');
    assert.equal(config.bscChainId, 97);
    assert.equal(config.tronStartTimestampMs, 1_788_000_000_000);
  });

  it('rechaza mainnet, base de produccion y ausencia de confirmacion explicita', () => {
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: '56',
      }),
      /chain 97/,
    );
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_MONGO_URL: 'mongodb://127.0.0.1:27017/cukieshub-new',
      }),
      /cukieshub-new-staging/,
    );
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: '',
      }),
      /confirmacion exacta/,
    );
  });

  it('nunca incluye la clave privada recibida en los errores de validacion', () => {
    const privateKey = 'secret-private-key-that-must-not-leak';
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY: privateKey,
      }),
      (error: unknown) => (
        error instanceof Error
        && /private key/.test(error.message)
        && !error.message.includes(privateKey)
      ),
    );
  });
});
