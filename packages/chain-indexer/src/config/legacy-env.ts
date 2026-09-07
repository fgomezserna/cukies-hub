import { z } from 'zod';

import { getContractEventConfigs } from './contracts.js';
import {
  LEGACY_BSC_CONTRACT_ALIASES,
  LEGACY_CONTRACT_ALIASES,
  LEGACY_CONTRACTS,
  LEGACY_TRON_CONTRACT_ALIASES,
  legacyContractProof,
} from '../legacy/contracts.js';
import type { IndexerConfig } from '../types.js';

const legacyEnvironmentSchema = z.object({
  APP_ENV: z.enum(['staging', 'production', 'test']),
  CUKIES_SERVICE: z.literal('legacy-chain-indexer'),
  CUKIES_LEGACY_INDEXER_ENABLED: z.string().optional(),
  CUKIES_LEGACY_INDEXER_MONGO_URL: z.string().min(1),
  CUKIES_LEGACY_INDEXER_DB_NAME: z.string().min(1),
  CUKIES_LEGACY_BSC_RPC_URLS: z.string().min(1),
  CUKIES_LEGACY_BSC_CHAIN_ID: z.coerce.number().int().optional(),
  CUKIES_LEGACY_BSC_START_BLOCK: z.coerce.number().int().nonnegative(),
  CUKIES_LEGACY_TRON_API_BASE_URL: z.string().url(),
  CUKIES_LEGACY_TRON_NETWORK: z.string().min(1),
  CUKIES_LEGACY_TRON_START_TIMESTAMP_MS: z.coerce.number().int().nonnegative(),
  CUKIES_LEGACY_BSC_CONFIRMATIONS: z.coerce.number().int().nonnegative().default(12),
  CUKIES_LEGACY_MAX_BLOCK_RANGE: z.coerce.number().int().positive().default(5_000),
  CUKIES_LEGACY_TRON_PAGE_LIMIT: z.coerce.number().int().positive().default(200),
  CUKIES_LEGACY_TRON_REQUEST_DELAY_MS: z.coerce.number().int().nonnegative().default(2_000),
  CUKIES_LEGACY_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  CUKIES_LEGACY_PROJECT_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  CUKIES_LEGACY_TRON_API_KEY: z.string().optional(),
  CUKIES_LEGACY_CONTRACT_ALIASES: z.string().optional(),
});

export const LEGACY_DB_NAMES = Object.freeze({
  staging: 'cukies-legacy-indexer-staging',
  production: 'cukies-legacy-indexer',
  test: 'cukies-legacy-worker-test',
});

function parseBoolean(value: string | undefined) {
  if (value === undefined || value.trim() === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('CUKIES_LEGACY_INDEXER_ENABLED debe ser true o false.');
}

function mongoDatabaseName(uri: string) {
  const parsed = new URL(uri);
  if (parsed.protocol !== 'mongodb:' && parsed.protocol !== 'mongodb+srv:') {
    throw new Error('CUKIES_LEGACY_INDEXER_MONGO_URL debe ser una URL MongoDB.');
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, '')).trim();
  if (!name) throw new Error('CUKIES_LEGACY_INDEXER_MONGO_URL debe incluir la base.');
  return name;
}

function rpcUrls(value: string) {
  const urls = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (urls.length === 0) throw new Error('CUKIES_LEGACY_BSC_RPC_URLS debe incluir un RPC.');
  for (const value of urls) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('CUKIES_LEGACY_BSC_RPC_URLS solo admite URLs HTTP(S).');
    }
  }
  return urls;
}

function validateAliases(value: string | undefined) {
  if (!value) return [...LEGACY_CONTRACT_ALIASES];
  const aliases = value.split(',').map((item) => item.trim()).filter(Boolean);
  if (
    aliases.length !== LEGACY_CONTRACT_ALIASES.length
    || aliases.some((alias) => !LEGACY_CONTRACT_ALIASES.includes(alias as never))
    || LEGACY_CONTRACT_ALIASES.some((alias) => !aliases.includes(alias))
  ) {
    throw new Error(`CUKIES_LEGACY_CONTRACT_ALIASES solo puede contener: ${LEGACY_CONTRACT_ALIASES.join(',')}.`);
  }
  return aliases;
}

function assertDatabaseBoundary(environment: NodeJS.ProcessEnv, appEnv: keyof typeof LEGACY_DB_NAMES, uri: string, dbName: string) {
  const expected = LEGACY_DB_NAMES[appEnv];
  const encoded = mongoDatabaseName(uri);
  if (dbName !== expected || encoded !== expected) {
    throw new Error(`La base legacy para ${appEnv} debe ser ${expected}; no se permite reutilizar otra base.`);
  }
  if (appEnv === 'test') {
    const parsed = new URL(uri);
    if (parsed.hostname !== '127.0.0.1' || parsed.port !== '37018') {
      throw new Error('La base legacy de test debe usar Mongo local 127.0.0.1:37018.');
    }
  }
  void environment;
}

export type LegacyIndexerConfig = IndexerConfig & {
  runtimeScope: 'legacy';
  enabled: boolean;
  legacyDatabaseName: string;
  legacyContractAliases: string[];
  legacyContractProofs: ReturnType<typeof legacyContractProof>[];
};

export function getLegacyIndexerConfig(environment: NodeJS.ProcessEnv = process.env): LegacyIndexerConfig {
  const parsed = legacyEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    throw new Error(`Configuración legacy inválida: ${parsed.error.issues.map((issue) => issue.message + ' (' + issue.path.join('.') + ')').join('; ')}`);
  }
  const env = parsed.data;
  const appEnv = env.APP_ENV;
  if (env.CUKIES_LEGACY_BSC_CHAIN_ID !== undefined && env.CUKIES_LEGACY_BSC_CHAIN_ID !== 56) {
    throw new Error('CUKIES_LEGACY_BSC_CHAIN_ID debe ser 56; chain 97 está fuera del runtime legacy.');
  }
  if (env.CUKIES_LEGACY_TRON_NETWORK !== 'mainnet') {
    throw new Error('CUKIES_LEGACY_TRON_NETWORK debe ser mainnet.');
  }
  if (appEnv !== 'test' && env.CUKIES_LEGACY_TRON_API_BASE_URL !== 'https://api.trongrid.io/v1') {
    throw new Error('Runtime legacy Stage/producción exige https://api.trongrid.io/v1 para eventos.');
  }
  const dbName = env.CUKIES_LEGACY_INDEXER_DB_NAME.trim();
  assertDatabaseBoundary(environment, appEnv, env.CUKIES_LEGACY_INDEXER_MONGO_URL, dbName);
  const aliases = validateAliases(env.CUKIES_LEGACY_CONTRACT_ALIASES);
  const bscRpcUrls = rpcUrls(env.CUKIES_LEGACY_BSC_RPC_URLS);
  // El manifiesto compartido conserva aliases de economía; el runtime legacy
  // obtiene solo los contratos canónicos y filtra el resultado sin aceptar
  // addresses ni aliases inyectados desde el entorno.
  const eventConfigs = getContractEventConfigs(['BSC', 'TRON']).filter((event) => aliases.includes(event.contractAlias));
  if (eventConfigs.length === 0 || eventConfigs.some((event) => !LEGACY_CONTRACTS[event.chain][event.contractAlias as keyof typeof LEGACY_CONTRACTS.BSC])) {
    throw new Error('El manifiesto legacy no contiene únicamente contratos canónicos.');
  }

  return {
    runtimeScope: 'legacy',
    enabled: parseBoolean(env.CUKIES_LEGACY_INDEXER_ENABLED),
    legacyDatabaseName: dbName,
    legacyContractAliases: aliases,
    mongoUrl: env.CUKIES_LEGACY_INDEXER_MONGO_URL,
    dbName,
    chains: ['BSC', 'TRON'],
    bscRpcUrl: bscRpcUrls[0],
    bscRpcUrls,
    bscExpectedChainId: 56,
    tronApiBaseUrl: env.CUKIES_LEGACY_TRON_API_BASE_URL.replace(/\/$/, ''),
    tronApiKey: env.CUKIES_LEGACY_TRON_API_KEY,
    bscStartBlock: env.CUKIES_LEGACY_BSC_START_BLOCK,
    tronStartTimestampMs: env.CUKIES_LEGACY_TRON_START_TIMESTAMP_MS,
    bscConfirmations: env.CUKIES_LEGACY_BSC_CONFIRMATIONS,
    maxBlockRange: env.CUKIES_LEGACY_MAX_BLOCK_RANGE,
    tronPageLimit: env.CUKIES_LEGACY_TRON_PAGE_LIMIT,
    tronRequestDelayMs: env.CUKIES_LEGACY_TRON_REQUEST_DELAY_MS,
    pollIntervalMs: env.CUKIES_LEGACY_POLL_INTERVAL_MS,
    projectBatchSize: env.CUKIES_LEGACY_PROJECT_BATCH_SIZE,
    verifiedBscContracts: {},
    // getContractEventConfigs supplies the immutable BSC/TRON legacy maps;
    // do not pass an env-derived alias list into the shared default runtime.
    contractAliases: undefined,
    legacyStartBlocks: Object.fromEntries(
      LEGACY_BSC_CONTRACT_ALIASES.map((alias) => [alias, env.CUKIES_LEGACY_BSC_START_BLOCK]),
    ) as IndexerConfig['legacyStartBlocks'],
    legacyContractProofs: [
      ...LEGACY_BSC_CONTRACT_ALIASES
        .map((alias) => legacyContractProof('BSC', alias)),
      ...LEGACY_TRON_CONTRACT_ALIASES
        .map((alias) => legacyContractProof('TRON', alias)),
    ],
  };
}

export function assertLegacyIndexerEnabled(config: Pick<LegacyIndexerConfig, 'enabled'>) {
  if (!config.enabled) {
    throw new Error('CUKIES_LEGACY_INDEXER_ENABLED=false; runtime legacy desactivado.');
  }
}
