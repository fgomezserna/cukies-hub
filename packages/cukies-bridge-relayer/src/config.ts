import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { TronWeb } from 'tronweb';

export type BridgeRelayerConfig = Readonly<{
  enabled: boolean;
  mongoUrl: string;
  dbName: 'cukieshub-new-staging';
  tronRpcUrl: 'https://nile.trongrid.io';
  tronApiBaseUrl: 'https://nile.trongrid.io/v1';
  tronApiKey: string | null;
  tronCollectionAddress: string;
  tronEndpointAddress: string;
  tronStartTimestampMs: number;
  bscChainId: 97;
  bscRpcUrls: string[];
  bscCollectionAddress: Address;
  bscEndpointAddress: Address;
  bscRelayerPrivateKey: Hex;
  bscConfirmations: number;
  pollIntervalMs: number;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  maxAttempts: number;
  submittedTimeoutMs: number;
  workerId: string;
}>;

const MAINNET_BSC_ENDPOINT = '0xb775ec58411f0460716cc7fa6fbbe2c38afd2a6e';
const MAINNET_BSC_COLLECTION = '0x0dbdebcc62f11005bf434abfad74564e896ac861';
const MAINNET_TRON_COLLECTION = 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe';
const MAINNET_TRON_ENDPOINT = 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ';
const EXECUTION_CONFIRM = 'ENABLE_TRON_NILE_TO_BSC_TESTNET_RELAYER';

const envSchema = z.object({
  APP_ENV: z.string().optional(),
  NEXT_PUBLIC_APP_ENV: z.string().optional(),
  STAGING_ONLY_GUARD: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_ENABLED: z.string().default('false'),
  CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_MONGO_URL: z.string().optional(),
  CHAIN_INDEXER_MONGO_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_DB_NAME: z.string().default('cukieshub-new-staging'),
  CUKIES_BRIDGE_RELAYER_TRON_NETWORK: z.string().default('nile'),
  CUKIES_BRIDGE_RELAYER_TRON_RPC_URL: z.string().default('https://nile.trongrid.io'),
  CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL: z.string().default('https://nile.trongrid.io/v1'),
  CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS: z.coerce.number().int().min(1).optional(),
  TRON_API_KEY: z.string().optional(),
  TRONGRID_API_KEY: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: z.coerce.number().int().default(97),
  CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_CONFIRMATIONS: z.coerce.number().int().min(1).max(30).default(3),
  CUKIES_BRIDGE_RELAYER_POLL_INTERVAL_MS: z.coerce.number().int().min(1_000).default(10_000),
  CUKIES_BRIDGE_RELAYER_LEASE_MS: z.coerce.number().int().min(10_000).default(60_000),
  CUKIES_BRIDGE_RELAYER_RETRY_BASE_MS: z.coerce.number().int().min(1_000).default(5_000),
  CUKIES_BRIDGE_RELAYER_RETRY_MAX_MS: z.coerce.number().int().min(1_000).default(300_000),
  CUKIES_BRIDGE_RELAYER_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  CUKIES_BRIDGE_RELAYER_SUBMITTED_TIMEOUT_MS: z.coerce.number().int().min(60_000).default(900_000),
  CUKIES_BRIDGE_RELAYER_WORKER_ID: z.string().optional(),
});

function findWorkspaceRoot(startDir: string) {
  let current = startDir;
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) return current;
    current = path.dirname(current);
  }
  return startDir;
}

export function loadBridgeRelayerEnvFiles() {
  const root = findWorkspaceRoot(process.cwd());
  for (const file of [
    path.join(root, '.env'),
    path.join(root, '.env.local'),
    path.join(root, 'packages/cukies-bridge-relayer/.env'),
    path.join(root, 'packages/cukies-bridge-relayer/.env.local'),
  ]) {
    if (fs.existsSync(file)) dotenv.config({ path: file, override: false });
  }
}

function enabled(value: string) {
  return ['true', '1', 'yes'].includes(value.toLowerCase());
}

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`Falta ${label}.`);
  return normalized;
}

function exactUrl(value: string, expected: string, label: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} no es una URL valida.`);
  }
  if (parsed.toString().replace(/\/$/, '') !== expected) {
    throw new Error(`${label} debe ser exactamente ${expected}.`);
  }
  return expected;
}

function databaseNameFromUrl(url: string) {
  const match = url.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/i);
  if (!match?.[1]) throw new Error('La URL Mongo debe incluir la base de datos de Stage.');
  return decodeURIComponent(match[1]);
}

export function buildBridgeRelayerConfig(
  environment: NodeJS.ProcessEnv,
): BridgeRelayerConfig | { enabled: false } {
  const env = envSchema.parse(environment);
  if (!enabled(env.CUKIES_BRIDGE_RELAYER_ENABLED)) return { enabled: false };

  const appEnv = env.NEXT_PUBLIC_APP_ENV ?? env.APP_ENV;
  if (appEnv !== 'staging') throw new Error('El relayer exige APP_ENV=staging.');
  if (!enabled(env.STAGING_ONLY_GUARD ?? 'false')) {
    throw new Error('El relayer exige STAGING_ONLY_GUARD=true.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM !== EXECUTION_CONFIRM) {
    throw new Error('Falta la confirmacion exacta de ejecucion del relayer Testnet.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_TRON_NETWORK !== 'nile') {
    throw new Error('El relayer solo admite TRON Nile.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID !== 97) {
    throw new Error('El relayer solo admite BSC Testnet chain 97.');
  }

  const mongoUrl = required(
    env.CUKIES_BRIDGE_RELAYER_MONGO_URL ?? env.CHAIN_INDEXER_MONGO_URL ?? env.DATABASE_URL,
    'CUKIES_BRIDGE_RELAYER_MONGO_URL',
  );
  if (
    env.CUKIES_BRIDGE_RELAYER_DB_NAME !== 'cukieshub-new-staging'
    || databaseNameFromUrl(mongoUrl) !== 'cukieshub-new-staging'
  ) {
    throw new Error('El relayer solo puede usar cukieshub-new-staging.');
  }

  const tronCollectionAddress = required(
    env.CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS,
    'CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS',
  );
  const tronEndpointAddress = required(
    env.CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS,
    'CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS',
  );
  if (!TronWeb.isAddress(tronCollectionAddress) || !TronWeb.isAddress(tronEndpointAddress)) {
    throw new Error('Las addresses Nile no son TRON base58 validas.');
  }
  if (
    tronCollectionAddress === MAINNET_TRON_COLLECTION
    || tronEndpointAddress === MAINNET_TRON_ENDPOINT
    || tronCollectionAddress === tronEndpointAddress
  ) {
    throw new Error('El relayer Stage rechaza contratos TRON mainnet o duplicados.');
  }

  const bscCollectionAddress = required(
    env.CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS,
    'CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS',
  );
  const bscEndpointAddress = required(
    env.CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS,
    'CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS',
  );
  if (
    !isAddress(bscCollectionAddress)
    || !isAddress(bscEndpointAddress)
    || bscCollectionAddress.toLowerCase() === MAINNET_BSC_COLLECTION
    || bscEndpointAddress.toLowerCase() === MAINNET_BSC_ENDPOINT
    || bscCollectionAddress.toLowerCase() === bscEndpointAddress.toLowerCase()
  ) {
    throw new Error('Las addresses BSC Testnet no son validas, son duplicadas o apuntan a mainnet.');
  }

  const bscRelayerPrivateKey = required(
    env.CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY,
    'CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY',
  );
  if (!/^0x[0-9a-f]{64}$/i.test(bscRelayerPrivateKey)) {
    throw new Error('La private key del relayer BSC no tiene el formato esperado.');
  }
  try {
    privateKeyToAccount(bscRelayerPrivateKey as Hex);
  } catch {
    throw new Error('La private key del relayer BSC no es valida.');
  }
  const bscRpcUrls = (env.CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (bscRpcUrls.length === 0 || bscRpcUrls.some((value) => !value.startsWith('https://'))) {
    throw new Error('El relayer exige al menos un RPC HTTPS de BSC Testnet.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS === undefined) {
    throw new Error('Falta CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS.');
  }

  return {
    enabled: true,
    mongoUrl,
    dbName: 'cukieshub-new-staging',
    tronRpcUrl: exactUrl(
      env.CUKIES_BRIDGE_RELAYER_TRON_RPC_URL,
      'https://nile.trongrid.io',
      'CUKIES_BRIDGE_RELAYER_TRON_RPC_URL',
    ) as 'https://nile.trongrid.io',
    tronApiBaseUrl: exactUrl(
      env.CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL,
      'https://nile.trongrid.io/v1',
      'CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL',
    ) as 'https://nile.trongrid.io/v1',
    tronApiKey: env.TRON_API_KEY ?? env.TRONGRID_API_KEY ?? null,
    tronCollectionAddress,
    tronEndpointAddress,
    tronStartTimestampMs: env.CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS,
    bscChainId: 97,
    bscRpcUrls,
    bscCollectionAddress: bscCollectionAddress as Address,
    bscEndpointAddress: bscEndpointAddress as Address,
    bscRelayerPrivateKey: bscRelayerPrivateKey as Hex,
    bscConfirmations: env.CUKIES_BRIDGE_RELAYER_BSC_CONFIRMATIONS,
    pollIntervalMs: env.CUKIES_BRIDGE_RELAYER_POLL_INTERVAL_MS,
    leaseMs: env.CUKIES_BRIDGE_RELAYER_LEASE_MS,
    retryBaseMs: env.CUKIES_BRIDGE_RELAYER_RETRY_BASE_MS,
    retryMaxMs: env.CUKIES_BRIDGE_RELAYER_RETRY_MAX_MS,
    maxAttempts: env.CUKIES_BRIDGE_RELAYER_MAX_ATTEMPTS,
    submittedTimeoutMs: env.CUKIES_BRIDGE_RELAYER_SUBMITTED_TIMEOUT_MS,
    workerId: env.CUKIES_BRIDGE_RELAYER_WORKER_ID ?? `bridge-relayer-${process.pid}`,
  };
}

export function getBridgeRelayerConfig() {
  loadBridgeRelayerEnvFiles();
  return buildBridgeRelayerConfig(process.env);
}
