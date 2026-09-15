import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { privateKeyToAccount } from 'viem/accounts';

import {
  buildBridgeRelayerConfig,
  EXECUTION_CONFIRM,
  LEGACY_MAINNET,
} from './config.js';

const bscPrivateKey = `0x${'33'.repeat(32)}` as const;
const bscExpectedSignerAddress = privateKeyToAccount(bscPrivateKey).address;

function validEnvironment(): NodeJS.ProcessEnv {
  return {
    APP_ENV: 'production',
    STAGING_ONLY_GUARD: 'false',
    CUKIES_BRIDGE_RELAYER_ENABLED: 'true',
    CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: EXECUTION_CONFIRM,
    CUKIES_BRIDGE_RELAYER_MONGO_URL:
      'mongodb://127.0.0.1:27017/cukieshub-new',
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
  };
}

describe('buildBridgeRelayerConfig', () => {
  it('queda desactivado por defecto sin exigir claves ni conexiones', () => {
    assert.deepEqual(buildBridgeRelayerConfig({}), { enabled: false });
  });

  it('acepta solo la topologia TRON mainnet -> BSC mainnet completa', () => {
    const config = buildBridgeRelayerConfig(validEnvironment());
    assert.equal(config.enabled, true);
    if (!config.enabled) return;
    assert.equal(config.dbName, 'cukieshub-new');
    assert.equal(config.tronRpcUrl, 'https://api.trongrid.io');
    assert.equal(config.bscChainId, 56);
    assert.equal(config.tronStartTimestampMs, 1_788_000_000_000);
  });

  it('trata aliases vacios materializados por Compose como ausentes antes del fallback', () => {
    const config = buildBridgeRelayerConfig({
      ...validEnvironment(),
      CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS: '',
      CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS: LEGACY_MAINNET.tronBridgeAddress,
      CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS: '   ',
      CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS: LEGACY_MAINNET.bscBridgeAddress,
      CUKIES_BRIDGE_RELAYER_BSC_EXPECTED_SIGNER_ADDRESS: '',
      CUKIES_BRIDGE_RELAYER_EXPECTED_SIGNER_ADDRESS: bscExpectedSignerAddress,
    });
    assert.equal(config.enabled, true);
    if (!config.enabled) return;
    assert.equal(config.tronBridgeAddress, LEGACY_MAINNET.tronBridgeAddress);
    assert.equal(config.bscBridgeAddress.toLowerCase(), LEGACY_MAINNET.bscBridgeAddress.toLowerCase());
    assert.equal(config.bscExpectedSignerAddress.toLowerCase(), bscExpectedSignerAddress.toLowerCase());
  });

  it('exige APP_ENV de runtime y rechaza el conflicto con NEXT_PUBLIC_APP_ENV', () => {
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        APP_ENV: 'staging',
      }),
      /APP_ENV=production/,
    );
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        NEXT_PUBLIC_APP_ENV: 'staging',
      }),
      /APP_ENV y NEXT_PUBLIC_APP_ENV deben coincidir/,
    );
  });

  it('exige STAGING_ONLY_GUARD exactamente false y rechaza valores ambiguos', () => {
    for (const value of [undefined, '', 'true', '0', 'FALSE', 'false ']) {
      assert.throws(
        () => buildBridgeRelayerConfig({
          ...validEnvironment(),
          STAGING_ONLY_GUARD: value,
        }),
        /STAGING_ONLY_GUARD=false exacto/,
      );
    }
  });

  it('rechaza testnet, base incorrecta y ausencia de confirmacion explicita', () => {
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: '97',
      }),
      /chain 56/,
    );
    assert.throws(
      () => buildBridgeRelayerConfig({
        ...validEnvironment(),
        CUKIES_BRIDGE_RELAYER_MONGO_URL: 'mongodb://127.0.0.1:27017/cukieshub-new-staging',
      }),
      /cukieshub-new/,
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
