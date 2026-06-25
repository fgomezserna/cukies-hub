import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import type { ChainName, ContractAlias, IndexerConfig, LegacyImportConfig } from '../types.js';

function findWorkspaceRoot(startDir: string) {
  let current = startDir;

  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
      return current;
    }

    current = path.dirname(current);
  }

  return startDir;
}

export function loadIndexerEnvFiles() {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const files = [
    path.join(workspaceRoot, '.env'),
    path.join(workspaceRoot, '.env.local'),
    path.join(workspaceRoot, 'dapp/.env'),
    path.join(workspaceRoot, 'dapp/.env.local'),
    path.join(workspaceRoot, 'packages/chain-indexer/.env'),
    path.join(workspaceRoot, 'packages/chain-indexer/.env.local'),
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

const envSchema = z.object({
  CHAIN_INDEXER_MONGO_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  CHAIN_INDEXER_DB_NAME: z.string().default('cukieshub-new'),
  CHAIN_INDEXER_CHAINS: z.string().default('BSC,TRON'),
  CHAIN_INDEXER_CONTRACT_ALIASES: z.string().optional(),
  CHAIN_INDEXER_BSC_RPC_URLS: z.string().optional(),
  CHAIN_INDEXER_BSC_RPC_URL: z.string().optional(),
  BSC_RPC_URL: z.string().optional(),
  CHAIN_INDEXER_PRESALE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_PRESALE_ADDRESS: z.string().optional(),
  CHAIN_INDEXER_TRON_API_BASE_URL: z.string().default('https://api.trongrid.io/v1'),
  CUKIES_DATABASE_URL: z.string().optional(),
  TRON_API_KEY: z.string().optional(),
  TRONGRID_API_KEY: z.string().optional(),
  CHAIN_INDEXER_START_BSC_BLOCK: z.coerce.number().int().min(0).default(0),
  CHAIN_INDEXER_START_TRON_TIMESTAMP_MS: z.coerce.number().int().min(0).default(0),
  CHAIN_INDEXER_BSC_CONFIRMATIONS: z.coerce.number().int().min(0).default(12),
  CHAIN_INDEXER_MAX_BLOCK_RANGE: z.coerce.number().int().min(1).max(100000).default(5000),
  CHAIN_INDEXER_TRON_PAGE_LIMIT: z.coerce.number().int().min(1).max(200).default(200),
  CHAIN_INDEXER_TRON_REQUEST_DELAY_MS: z.coerce.number().int().min(0).default(500),
  CHAIN_INDEXER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(60000),
  CHAIN_INDEXER_PROJECT_BATCH_SIZE: z.coerce.number().int().min(1).max(1000).default(100),
  CHAIN_INDEXER_IMPORT_LEGACY_LIMIT: z.coerce.number().int().min(1).max(50000).default(10000),
  CHAIN_INDEXER_IMPORT_LEGACY_NETWORK: z.string().optional(),
});

function parseChains(value: string): ChainName[] {
  const chains = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  const valid = chains.filter((item): item is ChainName => item === 'BSC' || item === 'TRON');
  return valid.length > 0 ? valid : ['BSC', 'TRON'];
}

function parseContractAliases(value?: string): ContractAlias[] | undefined {
  if (!value) return undefined;

  const aliases = value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
  const valid = aliases.filter(
    (item): item is ContractAlias =>
      item === 'TOKEN' ||
      item === 'POINTS' ||
      item === 'STAKING_POINTS' ||
      item === 'BREEDING_POINTS' ||
      item === 'MARKETPLACE' ||
      item === 'BRIDGE' ||
      item === 'PRESALE',
  );

  return valid.length > 0 ? valid : undefined;
}

function parseRpcUrls(...values: Array<string | undefined>) {
  const urls = values
    .flatMap((value) => value?.split(',') ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(urls)];
}

export function getIndexerConfig(): IndexerConfig {
  loadIndexerEnvFiles();
  const env = envSchema.parse(process.env);
  const mongoUrl = env.CHAIN_INDEXER_MONGO_URL ?? env.DATABASE_URL;

  if (!mongoUrl) {
    throw new Error(
      'Falta CHAIN_INDEXER_MONGO_URL o DATABASE_URL para conectar el indexer a Mongo.',
    );
  }

  const chains = parseChains(env.CHAIN_INDEXER_CHAINS);
  const contractAliases = parseContractAliases(env.CHAIN_INDEXER_CONTRACT_ALIASES);
  const presaleAddress = env.CHAIN_INDEXER_PRESALE_ADDRESS ?? env.NEXT_PUBLIC_UKI_PRESALE_ADDRESS;
  const bscRpcUrls = parseRpcUrls(
    env.CHAIN_INDEXER_BSC_RPC_URLS,
    env.CHAIN_INDEXER_BSC_RPC_URL,
    env.BSC_RPC_URL,
    'https://bsc.rpc.blxrbdn.com',
  );

  if (contractAliases?.includes('PRESALE') && !presaleAddress) {
    throw new Error('Falta CHAIN_INDEXER_PRESALE_ADDRESS o NEXT_PUBLIC_UKI_PRESALE_ADDRESS para indexar la preventa.');
  }

  return {
    mongoUrl,
    dbName: env.CHAIN_INDEXER_DB_NAME,
    chains,
    contractAliases,
    bscRpcUrl: bscRpcUrls[0],
    bscRpcUrls,
    tronApiBaseUrl: env.CHAIN_INDEXER_TRON_API_BASE_URL.replace(/\/$/, ''),
    tronApiKey: env.TRON_API_KEY ?? env.TRONGRID_API_KEY,
    bscStartBlock: env.CHAIN_INDEXER_START_BSC_BLOCK,
    tronStartTimestampMs: env.CHAIN_INDEXER_START_TRON_TIMESTAMP_MS,
    bscConfirmations: env.CHAIN_INDEXER_BSC_CONFIRMATIONS,
    maxBlockRange: env.CHAIN_INDEXER_MAX_BLOCK_RANGE,
    tronPageLimit: env.CHAIN_INDEXER_TRON_PAGE_LIMIT,
    tronRequestDelayMs: env.CHAIN_INDEXER_TRON_REQUEST_DELAY_MS,
    pollIntervalMs: env.CHAIN_INDEXER_POLL_INTERVAL_MS,
    projectBatchSize: env.CHAIN_INDEXER_PROJECT_BATCH_SIZE,
    presaleAddress,
  };
}

export function getLegacyImportConfig(): LegacyImportConfig {
  loadIndexerEnvFiles();
  const env = envSchema.parse(process.env);

  if (!env.CUKIES_DATABASE_URL) {
    throw new Error('Falta CUKIES_DATABASE_URL para importar processedEvents legacy.');
  }

  return {
    legacyMongoUrl: env.CUKIES_DATABASE_URL,
    limit: env.CHAIN_INDEXER_IMPORT_LEGACY_LIMIT,
    networks: env.CHAIN_INDEXER_IMPORT_LEGACY_NETWORK
      ? parseChains(env.CHAIN_INDEXER_IMPORT_LEGACY_NETWORK)
      : undefined,
  };
}
