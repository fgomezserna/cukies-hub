import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { isAddress } from 'viem';
import { z } from 'zod';

import type { ChainName, ContractAlias, IndexerConfig, LegacyImportConfig } from '../types.js';

const optionalBlockSchema = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.coerce.number().int().min(1).optional(),
);

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
  CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: z.coerce.number().int().refine(
    (value) => value === 56 || value === 97,
    'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID debe ser 56 o 97.',
  ).default(56),
  CHAIN_INDEXER_PRESALE_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_PRESALE_ADDRESS: z.string().optional(),
  CHAIN_INDEXER_UKI_STAKING_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_STAKING_ADDRESS: z.string().optional(),
  CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS: z.string().optional(),
  NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS: z.string().optional(),
  CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK: optionalBlockSchema,
  CHAIN_INDEXER_REWARDS_DISTRIBUTOR_START_BSC_BLOCK: optionalBlockSchema,
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

export function resolveMongoDatabaseNameFromUrl(databaseUrl: string, envName: string) {
  const match = databaseUrl.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
  if (!match || !match[1]) {
    throw new Error(`${envName} debe incluir explicitamente el nombre de la base de datos.`);
  }

  let databaseName: string;
  try {
    databaseName = decodeURIComponent(match[1]);
  } catch {
    throw new Error(`${envName} contiene un nombre de base de datos invalido.`);
  }

  if (
    databaseName.length > 64
    || /[\s/\\."$*<>:|?\u0000]/.test(databaseName)
  ) {
    throw new Error(`${envName} contiene un nombre de base de datos invalido.`);
  }

  return databaseName;
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
      item === 'PRESALE' ||
      item === 'UKI_STAKING' ||
      item === 'REWARDS_DISTRIBUTOR',
  );

  return valid.length > 0 ? valid : undefined;
}

function resolveOptionalBscAddress(
  value: string | undefined,
  alias: 'UKI_STAKING' | 'REWARDS_DISTRIBUTOR',
  requested: boolean,
) {
  const address = value?.trim();
  if (!address) {
    if (requested) throw new Error(`${alias} fue solicitado sin una address BSC configurada.`);
    return undefined;
  }
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) {
    throw new Error(`${alias} no tiene una address BSC no nula valida.`);
  }
  return address;
}

function parseRpcUrls(...values: Array<string | undefined>) {
  const urls = values
    .flatMap((value) => value?.split(',') ?? [])
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set(urls)];
}

export function resolveBscRpcUrls(input: {
  expectedChainId: 56 | 97;
  rpcUrls?: string;
  rpcUrl?: string;
  legacyRpcUrl?: string;
}) {
  const configured = parseRpcUrls(
    input.rpcUrls,
    input.rpcUrl,
    input.expectedChainId === 56 ? input.legacyRpcUrl : undefined,
  );

  if (configured.length > 0) return configured;

  if (input.expectedChainId === 97) {
    throw new Error(
      'BSC Testnet exige CHAIN_INDEXER_BSC_RPC_URLS o CHAIN_INDEXER_BSC_RPC_URL; no se permite fallback a mainnet.',
    );
  }

  return ['https://bsc.rpc.blxrbdn.com'];
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
  const ukiStakingRequested = contractAliases?.includes('UKI_STAKING') ?? false;
  const rewardsDistributorRequested =
    contractAliases?.includes('REWARDS_DISTRIBUTOR') ?? false;
  const ukiStakingAddress = resolveOptionalBscAddress(
    env.CHAIN_INDEXER_UKI_STAKING_ADDRESS ?? env.NEXT_PUBLIC_UKI_STAKING_ADDRESS,
    'UKI_STAKING',
    ukiStakingRequested,
  );
  const rewardsDistributorAddress = resolveOptionalBscAddress(
    env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_ADDRESS
      ?? env.NEXT_PUBLIC_UKI_REWARDS_DISTRIBUTOR_ADDRESS,
    'REWARDS_DISTRIBUTOR',
    rewardsDistributorRequested,
  );
  const bscExpectedChainId = env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID as 56 | 97;
  const bscRpcUrls = resolveBscRpcUrls({
    expectedChainId: bscExpectedChainId,
    rpcUrls: env.CHAIN_INDEXER_BSC_RPC_URLS,
    rpcUrl: env.CHAIN_INDEXER_BSC_RPC_URL,
    legacyRpcUrl: env.BSC_RPC_URL,
  });

  if (contractAliases?.includes('PRESALE') && !presaleAddress) {
    throw new Error('Falta CHAIN_INDEXER_PRESALE_ADDRESS o NEXT_PUBLIC_UKI_PRESALE_ADDRESS para indexar la preventa.');
  }

  for (const [alias, requested, startBlock] of [
    ['UKI_STAKING', ukiStakingRequested, env.CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK],
    [
      'REWARDS_DISTRIBUTOR',
      rewardsDistributorRequested,
      env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_START_BSC_BLOCK,
    ],
  ] as const) {
    if (requested && startBlock === undefined) {
      throw new Error(`${alias} requiere un bloque de despliegue/inicio explicito.`);
    }
  }

  if ((ukiStakingRequested || rewardsDistributorRequested) && !chains.includes('BSC')) {
    throw new Error('Los contratos UKI de staking/rewards solo se pueden indexar con BSC habilitada.');
  }

  return {
    mongoUrl,
    dbName: env.CHAIN_INDEXER_DB_NAME,
    chains,
    contractAliases,
    bscRpcUrl: bscRpcUrls[0],
    bscRpcUrls,
    bscExpectedChainId,
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
    ukiStakingAddress,
    rewardsDistributorAddress,
    ukiStakingStartBlock: env.CHAIN_INDEXER_UKI_STAKING_START_BSC_BLOCK,
    rewardsDistributorStartBlock: env.CHAIN_INDEXER_REWARDS_DISTRIBUTOR_START_BSC_BLOCK,
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
    legacyDbName: resolveMongoDatabaseNameFromUrl(
      env.CUKIES_DATABASE_URL,
      'CUKIES_DATABASE_URL',
    ),
    limit: env.CHAIN_INDEXER_IMPORT_LEGACY_LIMIT,
    networks: env.CHAIN_INDEXER_IMPORT_LEGACY_NETWORK
      ? parseChains(env.CHAIN_INDEXER_IMPORT_LEGACY_NETWORK)
      : undefined,
  };
}
