import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { isAddress, type Address, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { TronWeb } from 'tronweb';

/**
 * Public identities of the contracts used by the legacy bridge.  These are
 * deliberately fixed: this worker must never be pointed at a testnet or at
 * the newer CukiesBridgeEndpoint protocol by configuration accident.
 */
export const LEGACY_MAINNET = Object.freeze({
  bscChainId: 56,
  tronNetwork: 'mainnet',
  tronRpcUrl: 'https://api.trongrid.io',
  tronApiBaseUrl: 'https://api.trongrid.io/v1',
  tronCollectionAddress: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
  tronBridgeAddress: 'TXVrcj6YuHMgZNvMXg8VymVt19PC18KrhQ',
  bscCollectionAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
  bscBridgeAddress: '0xb775ec58411F0460716CC7FA6FbbE2c38AfD2A6E',
} as const);

/** Explicit acknowledgement required before an execution-enabled process starts. */
export const EXECUTION_CONFIRM =
  'ENABLE_TRON_MAINNET_TO_BSC_MAINNET_LEGACY_RELAYER';

export type BridgeRelayerConfig = Readonly<{
  enabled: boolean;
  appEnv: 'production';
  mongoUrl: string;
  dbName: 'cukieshub-new';
  tronNetwork: 'mainnet';
  tronRpcUrl: 'https://api.trongrid.io';
  tronApiBaseUrl: 'https://api.trongrid.io/v1';
  tronApiKey: string | null;
  tronCollectionAddress: string;
  /** Legacy bridge contract on TRON (kept as endpoint alias for callers). */
  tronBridgeAddress: string;
  tronEndpointAddress: string;
  tronStartTimestampMs: number;
  bscChainId: 56;
  bscRpcUrls: string[];
  bscCollectionAddress: Address;
  /** Legacy bridge contract on BSC (kept as endpoint alias for callers). */
  bscBridgeAddress: Address;
  bscEndpointAddress: Address;
  bscRelayerPrivateKey: Hex;
  bscExpectedSignerAddress: Address;
  bscConfirmations: number;
  pollIntervalMs: number;
  leaseMs: number;
  retryBaseMs: number;
  retryMaxMs: number;
  maxAttempts: number;
  submittedTimeoutMs: number;
  workerId: string;
}>;

const envSchema = z.object({
  APP_ENV: z.string().optional(),
  NEXT_PUBLIC_APP_ENV: z.string().optional(),
  STAGING_ONLY_GUARD: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_ENABLED: z.string().default('false'),
  CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_MONGO_URL: z.string().optional(),
  CHAIN_INDEXER_MONGO_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_DB_NAME: z.string().default('cukieshub-new'),
  CUKIES_BRIDGE_RELAYER_TRON_NETWORK: z.string().default('mainnet'),
  CUKIES_BRIDGE_RELAYER_TRON_RPC_URL: z.string().default(LEGACY_MAINNET.tronRpcUrl),
  CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL:
    z.string().default(LEGACY_MAINNET.tronApiBaseUrl),
  CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS:
    z.coerce.number().int().min(1).optional(),
  TRON_API_KEY: z.string().optional(),
  TRONGRID_API_KEY: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID: z.coerce.number().int().default(56),
  CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_EXPECTED_SIGNER_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_EXPECTED_SIGNER_ADDRESS: z.string().optional(),
  CUKIES_BRIDGE_RELAYER_BSC_CONFIRMATIONS:
    z.coerce.number().int().min(1).max(100).default(12),
  CUKIES_BRIDGE_RELAYER_POLL_INTERVAL_MS:
    z.coerce.number().int().min(1_000).default(10_000),
  CUKIES_BRIDGE_RELAYER_LEASE_MS:
    z.coerce.number().int().min(10_000).default(60_000),
  CUKIES_BRIDGE_RELAYER_RETRY_BASE_MS:
    z.coerce.number().int().min(1_000).default(5_000),
  CUKIES_BRIDGE_RELAYER_RETRY_MAX_MS:
    z.coerce.number().int().min(1_000).default(300_000),
  CUKIES_BRIDGE_RELAYER_MAX_ATTEMPTS:
    z.coerce.number().int().min(1).max(20).default(5),
  CUKIES_BRIDGE_RELAYER_SUBMITTED_TIMEOUT_MS:
    z.coerce.number().int().min(60_000).default(900_000),
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
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('La URL Mongo no es valida.');
  }
  if (parsed.protocol !== 'mongodb:' && parsed.protocol !== 'mongodb+srv:') {
    throw new Error('La URL Mongo debe usar mongodb:// o mongodb+srv://.');
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (!databaseName) throw new Error('La URL Mongo debe incluir cukieshub-new.');
  return databaseName;
}

function exactAddress(value: string, expected: string, label: string) {
  if (value.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} debe ser la address legacy mainnet aprobada.`);
  }
  return value;
}

function assertHttpsMainnetRpcUrls(raw: string | undefined) {
  const urls = (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  if (urls.length === 0) {
    throw new Error('El relayer exige al menos un RPC HTTPS de BSC mainnet.');
  }
  for (const value of urls) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS contiene una URL invalida.');
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Los RPC del relayer deben usar HTTPS.');
    }
    if (/prebsc|testnet|test\.bsc|nile|shasta|localhost|127\.0\.0\.1/i.test(parsed.hostname)) {
      throw new Error('El relayer rechaza RPC de testnet o locales.');
    }
  }
  return urls;
}

export function buildBridgeRelayerConfig(
  environment: NodeJS.ProcessEnv,
): BridgeRelayerConfig | { enabled: false } {
  const env = envSchema.parse(environment);
  if (!enabled(env.CUKIES_BRIDGE_RELAYER_ENABLED)) return { enabled: false };

  const appEnv = env.APP_ENV?.trim();
  const publicAppEnv = env.NEXT_PUBLIC_APP_ENV?.trim();
  if (appEnv !== 'production') {
    throw new Error('El relayer legacy exige APP_ENV=production.');
  }
  if (publicAppEnv && publicAppEnv !== appEnv) {
    throw new Error('APP_ENV y NEXT_PUBLIC_APP_ENV deben coincidir.');
  }
  if (env.STAGING_ONLY_GUARD !== 'false') {
    throw new Error('El relayer legacy exige STAGING_ONLY_GUARD=false exacto.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_EXECUTION_CONFIRM !== EXECUTION_CONFIRM) {
    throw new Error('Falta la confirmacion exacta de ejecucion del relayer mainnet legacy.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_TRON_NETWORK !== LEGACY_MAINNET.tronNetwork) {
    throw new Error('El relayer legacy solo admite TRON mainnet.');
  }
  if (env.CUKIES_BRIDGE_RELAYER_BSC_CHAIN_ID !== LEGACY_MAINNET.bscChainId) {
    throw new Error('El relayer legacy solo admite BSC mainnet chain 56.');
  }

  const mongoUrl = required(
    env.CUKIES_BRIDGE_RELAYER_MONGO_URL,
    'CUKIES_BRIDGE_RELAYER_MONGO_URL',
  );
  if (
    env.CUKIES_BRIDGE_RELAYER_DB_NAME !== 'cukieshub-new'
    || databaseNameFromUrl(mongoUrl) !== 'cukieshub-new'
  ) {
    throw new Error('El relayer legacy solo puede usar la base cukieshub-new.');
  }

  const tronCollectionAddress = exactAddress(
    required(
      env.CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS,
      'CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS',
    ),
    LEGACY_MAINNET.tronCollectionAddress,
    'CUKIES_BRIDGE_RELAYER_TRON_COLLECTION_ADDRESS',
  );
  const tronBridgeAddress = exactAddress(
    required(
      env.CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS
        ?? env.CUKIES_BRIDGE_RELAYER_TRON_ENDPOINT_ADDRESS,
      'CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS',
    ),
    LEGACY_MAINNET.tronBridgeAddress,
    'CUKIES_BRIDGE_RELAYER_TRON_BRIDGE_ADDRESS',
  );
  if (!TronWeb.isAddress(tronCollectionAddress) || !TronWeb.isAddress(tronBridgeAddress)) {
    throw new Error('Las addresses legacy mainnet de TRON no son validas.');
  }
  if (tronCollectionAddress === tronBridgeAddress) {
    throw new Error('La coleccion y el bridge TRON no pueden coincidir.');
  }

  const bscCollectionAddress = exactAddress(
    required(
      env.CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS,
      'CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS',
    ),
    LEGACY_MAINNET.bscCollectionAddress,
    'CUKIES_BRIDGE_RELAYER_BSC_COLLECTION_ADDRESS',
  );
  const bscBridgeAddress = exactAddress(
    required(
      env.CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS
        ?? env.CUKIES_BRIDGE_RELAYER_BSC_ENDPOINT_ADDRESS,
      'CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS',
    ),
    LEGACY_MAINNET.bscBridgeAddress,
    'CUKIES_BRIDGE_RELAYER_BSC_BRIDGE_ADDRESS',
  );
  if (
    !isAddress(bscCollectionAddress)
    || !isAddress(bscBridgeAddress)
    || bscCollectionAddress.toLowerCase() === bscBridgeAddress.toLowerCase()
  ) {
    throw new Error('Las addresses legacy mainnet de BSC no son validas.');
  }

  const bscRelayerPrivateKey = required(
    env.CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY,
    'CUKIES_BRIDGE_RELAYER_BSC_PRIVATE_KEY',
  );
  if (!/^0x[0-9a-f]{64}$/i.test(bscRelayerPrivateKey)) {
    throw new Error('La private key del relayer BSC no tiene el formato esperado.');
  }
  let account: ReturnType<typeof privateKeyToAccount>;
  try {
    account = privateKeyToAccount(bscRelayerPrivateKey as Hex);
  } catch {
    throw new Error('La private key del relayer BSC no es valida.');
  }
  const expectedSignerAddress = required(
    env.CUKIES_BRIDGE_RELAYER_BSC_EXPECTED_SIGNER_ADDRESS
      ?? env.CUKIES_BRIDGE_RELAYER_EXPECTED_SIGNER_ADDRESS,
    'CUKIES_BRIDGE_RELAYER_BSC_EXPECTED_SIGNER_ADDRESS',
  );
  if (!isAddress(expectedSignerAddress) || /^0x0{40}$/i.test(expectedSignerAddress)) {
    throw new Error('La address signer esperada no es valida.');
  }
  if (account.address.toLowerCase() !== expectedSignerAddress.toLowerCase()) {
    throw new Error('La private key del relayer no corresponde a la address signer esperada.');
  }

  const bscRpcUrls = assertHttpsMainnetRpcUrls(env.CUKIES_BRIDGE_RELAYER_BSC_RPC_URLS);
  if (env.CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS === undefined) {
    throw new Error('Falta CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS.');
  }

  return {
    enabled: true,
    appEnv: 'production',
    mongoUrl,
    dbName: 'cukieshub-new',
    tronNetwork: 'mainnet',
    tronRpcUrl: exactUrl(
      env.CUKIES_BRIDGE_RELAYER_TRON_RPC_URL,
      LEGACY_MAINNET.tronRpcUrl,
      'CUKIES_BRIDGE_RELAYER_TRON_RPC_URL',
    ) as 'https://api.trongrid.io',
    tronApiBaseUrl: exactUrl(
      env.CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL,
      LEGACY_MAINNET.tronApiBaseUrl,
      'CUKIES_BRIDGE_RELAYER_TRON_API_BASE_URL',
    ) as 'https://api.trongrid.io/v1',
    tronApiKey: env.TRON_API_KEY ?? env.TRONGRID_API_KEY ?? null,
    tronCollectionAddress,
    tronBridgeAddress,
    tronEndpointAddress: tronBridgeAddress,
    tronStartTimestampMs: env.CUKIES_BRIDGE_RELAYER_TRON_START_TIMESTAMP_MS,
    bscChainId: 56,
    bscRpcUrls,
    bscCollectionAddress: bscCollectionAddress as Address,
    bscBridgeAddress: bscBridgeAddress as Address,
    bscEndpointAddress: bscBridgeAddress as Address,
    bscRelayerPrivateKey: bscRelayerPrivateKey as Hex,
    bscExpectedSignerAddress: expectedSignerAddress as Address,
    bscConfirmations: env.CUKIES_BRIDGE_RELAYER_BSC_CONFIRMATIONS,
    pollIntervalMs: env.CUKIES_BRIDGE_RELAYER_POLL_INTERVAL_MS,
    leaseMs: env.CUKIES_BRIDGE_RELAYER_LEASE_MS,
    retryBaseMs: env.CUKIES_BRIDGE_RELAYER_RETRY_BASE_MS,
    retryMaxMs: env.CUKIES_BRIDGE_RELAYER_RETRY_MAX_MS,
    maxAttempts: env.CUKIES_BRIDGE_RELAYER_MAX_ATTEMPTS,
    submittedTimeoutMs: env.CUKIES_BRIDGE_RELAYER_SUBMITTED_TIMEOUT_MS,
    workerId: env.CUKIES_BRIDGE_RELAYER_WORKER_ID ?? `legacy-mainnet-relayer-${process.pid}`,
  };
}

export function getBridgeRelayerConfig() {
  loadBridgeRelayerEnvFiles();
  return buildBridgeRelayerConfig(process.env);
}
