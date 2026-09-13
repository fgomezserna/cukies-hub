import { isAddress, type Address } from 'viem';
import { TronWeb } from 'tronweb';

import {
  buildBridgeRelayerConfig,
  type BridgeRelayerConfig,
} from './config.js';

/**
 * The signed E2E is a manually authorised production check.  The executable
 * remains blocked in `e2e-real.ts`; this config only validates that a caller
 * selected mainnet and an isolated local Mongo before any future manual run.
 */
const EXECUTION_CONFIRM = 'RUN_REAL_TRON_MAINNET_TO_BSC_MAINNET_ON_LOCAL_MONGO';

export type BridgeE2eConfig = Readonly<{
  relayer: BridgeRelayerConfig;
  tronPrivateKey: string;
  tronOwnerAddress: string;
  destinationOwner: Address;
  tokenId: string;
  callFeeLimitSun: number;
  timeoutMs: number;
}>;

function required(environment: NodeJS.ProcessEnv, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function assertLocalMongo(mongoUrl: string) {
  const parsed = new URL(mongoUrl);
  const dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (
    parsed.protocol !== 'mongodb:'
    || !['127.0.0.1', 'localhost'].includes(parsed.hostname)
    || parsed.port !== '37018'
    || dbName !== 'cukieshub-new'
  ) {
    throw new Error(
      'El E2E exige Mongo local 127.0.0.1:37018/cukieshub-new.',
    );
  }
}

function positiveInteger(
  environment: NodeJS.ProcessEnv,
  name: string,
  defaultValue: number,
) {
  const raw = environment[name]?.trim() || String(defaultValue);
  if (!/^\d+$/.test(raw)) throw new Error(`${name} debe ser un entero positivo.`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo.`);
  }
  return value;
}

export function buildBridgeE2eConfig(environment: NodeJS.ProcessEnv): BridgeE2eConfig {
  if (required(environment, 'CUKIES_BRIDGE_E2E_CONFIRM') !== EXECUTION_CONFIRM) {
    throw new Error('Falta la confirmacion exacta del E2E real mainnet.');
  }
  const relayer = buildBridgeRelayerConfig(environment);
  if (!relayer.enabled) throw new Error('El relayer debe estar activado para el E2E.');
  assertLocalMongo(relayer.mongoUrl);

  const tronPrivateKey = required(environment, 'CUKIES_BRIDGE_E2E_TRON_PRIVATE_KEY')
    .replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(tronPrivateKey)) {
    throw new Error('CUKIES_BRIDGE_E2E_TRON_PRIVATE_KEY no es una clave valida.');
  }
  const tronOwnerAddress = required(environment, 'CUKIES_BRIDGE_E2E_TRON_OWNER_ADDRESS');
  if (
    !TronWeb.isAddress(tronOwnerAddress)
    || TronWeb.address.fromPrivateKey(tronPrivateKey) !== tronOwnerAddress
  ) {
    throw new Error('La private key E2E no corresponde a la owner address TRON mainnet.');
  }

  const destinationOwner = required(environment, 'CUKIES_BRIDGE_E2E_BSC_OWNER_ADDRESS');
  if (!isAddress(destinationOwner) || /^0x0{40}$/i.test(destinationOwner)) {
    throw new Error('CUKIES_BRIDGE_E2E_BSC_OWNER_ADDRESS no es valida.');
  }
  const tokenId = required(environment, 'CUKIES_BRIDGE_E2E_TOKEN_ID');
  if (!/^\d+$/.test(tokenId) || BigInt(tokenId) <= 0n) {
    throw new Error('CUKIES_BRIDGE_E2E_TOKEN_ID debe ser uint256 positivo.');
  }

  return {
    relayer,
    tronPrivateKey,
    tronOwnerAddress,
    destinationOwner,
    tokenId,
    callFeeLimitSun: positiveInteger(
      environment,
      'CUKIES_BRIDGE_E2E_TRON_CALL_FEE_LIMIT_SUN',
      300_000_000,
    ),
    timeoutMs: positiveInteger(environment, 'CUKIES_BRIDGE_E2E_TIMEOUT_MS', 600_000),
  };
}

export { EXECUTION_CONFIRM as BRIDGE_E2E_CONFIRM };
