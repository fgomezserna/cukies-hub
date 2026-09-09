import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

import type { AssetIdentityContext, CardWorkerConfig, CardWorkerSourceFormat } from '../types.js';
import { validateAssetIdentityContext } from '../identity.js';
import { assertCardWorkerSourceConfig } from '../source.js';

const defaultTokenAddress = 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe';

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

export function packageRoot() {
  return path.resolve(new URL('../../', import.meta.url).pathname);
}

export function loadCardWorkerEnvFiles() {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const files = [
    path.join(workspaceRoot, '.env'),
    path.join(workspaceRoot, '.env.local'),
    path.join(workspaceRoot, 'dapp/.env'),
    path.join(workspaceRoot, 'dapp/.env.local'),
    path.join(workspaceRoot, 'packages/cuki-card-worker/.env'),
    path.join(workspaceRoot, 'packages/cuki-card-worker/.env.local'),
  ];

  for (const file of files) {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: false });
    }
  }
}

const envSchema = z.object({
  CARD_WORKER_MONGO_URL: z.string().optional(),
  CHAIN_INDEXER_MONGO_URL: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  CARD_WORKER_DB_NAME: z.string().optional(),
  CHAIN_INDEXER_DB_NAME: z.string().optional(),
  CARD_WORKER_ASSETS_DIR: z.string().optional(),
  CARD_WORKER_OUTPUT_DIR: z.string().optional(),
  CARD_WORKER_CAPACITY_FILE: z.string().optional(),
  CARD_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(1000).default(5000),
  CARD_WORKER_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
  CARD_WORKER_STALE_LOCK_MS: z.coerce.number().int().min(60000).default(15 * 60 * 1000),
  CARD_WORKER_UPLOAD: z.string().default('false'),
  CARD_WORKER_PUBLIC_BASE_URL: z.string().optional(),
  CARD_WORKER_PUBLIC_KEY_PREFIX: z.string().optional(),
  CARD_WORKER_S3_BUCKET: z.string().optional(),
  CARD_WORKER_S3_REGION: z.string().optional(),
  CARD_WORKER_S3_PREFIX: z.string().default(`png/tokens/v2/${defaultTokenAddress}`),
  CARD_WORKER_S3_ENDPOINT: z.string().optional(),
  CARD_WORKER_S3_FORCE_PATH_STYLE: z.string().default('false'),
  CARD_WORKER_S3_ACL: z.string().optional(),
  CARD_WORKER_VERIFY_PUBLIC: z.string().default('true'),
  CARD_WORKER_BACKFILL_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  CARD_WORKER_BACKFILL_MANIFEST_PATH: z.string().optional(),
  CARD_WORKER_SOURCE_NETWORK: z.string().optional(),
  CARD_WORKER_SOURCE_CHAIN_ID: z.coerce.number().int().positive().optional(),
  CARD_WORKER_SOURCE_COLLECTION: z.string().optional(),
  CARD_WORKER_SOURCE_FORMAT: z.enum(['indexed', 'legacy']).default('indexed'),
  CARD_WORKER_LEGACY_STAGING_ENABLED: z.string().default('false'),
});

function parseBoolean(value: string | undefined) {
  return value === 'true' || value === '1' || value === 'yes';
}

function normalizePrefix(prefix: string) {
  return prefix.replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeBaseUrl(value: string | undefined, bucket: string | undefined, region: string | undefined) {
  const base = value ?? (bucket && region ? `https://${bucket}.s3.${region}.amazonaws.com` : undefined);
  return base ? base.replace(/\/+$/, '') : null;
}

function resolveSourceIdentity(env: z.infer<typeof envSchema>): AssetIdentityContext | null {
  const values = [env.CARD_WORKER_SOURCE_NETWORK, env.CARD_WORKER_SOURCE_CHAIN_ID, env.CARD_WORKER_SOURCE_COLLECTION];
  if (values.every((value) => value === undefined)) return null;
  if (!env.CARD_WORKER_SOURCE_NETWORK || !env.CARD_WORKER_SOURCE_COLLECTION) {
    throw new Error('El contexto de origen requiere CARD_WORKER_SOURCE_NETWORK y CARD_WORKER_SOURCE_COLLECTION.');
  }
  const context: AssetIdentityContext = {
    network: env.CARD_WORKER_SOURCE_NETWORK.trim().toUpperCase(),
    ...(env.CARD_WORKER_SOURCE_CHAIN_ID === undefined ? {} : { chainId: env.CARD_WORKER_SOURCE_CHAIN_ID }),
    collectionAddressNormalized: env.CARD_WORKER_SOURCE_COLLECTION.trim(),
  };
  validateAssetIdentityContext(context);
  return context;
}

export function getCardWorkerConfig(sourceIdentityOverride?: AssetIdentityContext): CardWorkerConfig {
  loadCardWorkerEnvFiles();
  const env = envSchema.parse(process.env);
  const mongoUrl = env.CARD_WORKER_MONGO_URL ?? env.CHAIN_INDEXER_MONGO_URL ?? env.DATABASE_URL;

  if (!mongoUrl) {
    throw new Error('Falta CARD_WORKER_MONGO_URL, CHAIN_INDEXER_MONGO_URL o DATABASE_URL.');
  }

  const sourceFormat = env.CARD_WORKER_SOURCE_FORMAT as CardWorkerSourceFormat;
  const legacyStagingEnabled = parseBoolean(env.CARD_WORKER_LEGACY_STAGING_ENABLED);
  const sourceIdentity = sourceFormat === 'legacy'
    ? null
    : sourceIdentityOverride ?? resolveSourceIdentity(env);
  if (sourceIdentityOverride) validateAssetIdentityContext(sourceIdentityOverride);

  const dbName = env.CARD_WORKER_DB_NAME ?? env.CHAIN_INDEXER_DB_NAME ?? 'cukieshub-new';
  assertCardWorkerSourceConfig({ sourceFormat, legacyStagingEnabled, dbName });

  return {
    mongoUrl,
    dbName,
    assetsDir: env.CARD_WORKER_ASSETS_DIR
      ? path.resolve(env.CARD_WORKER_ASSETS_DIR)
      : path.join(packageRoot(), 'assets'),
    outputDir: env.CARD_WORKER_OUTPUT_DIR
      ? path.resolve(env.CARD_WORKER_OUTPUT_DIR)
      : path.join(packageRoot(), '.tmp/cards'),
    capacityFile: env.CARD_WORKER_CAPACITY_FILE ?? null,
    pollIntervalMs: env.CARD_WORKER_POLL_INTERVAL_MS,
    maxAttempts: env.CARD_WORKER_MAX_ATTEMPTS,
    staleLockMs: env.CARD_WORKER_STALE_LOCK_MS,
    upload: parseBoolean(env.CARD_WORKER_UPLOAD),
    publicBaseUrl: normalizeBaseUrl(
      env.CARD_WORKER_PUBLIC_BASE_URL,
      env.CARD_WORKER_S3_BUCKET,
      env.CARD_WORKER_S3_REGION,
    ),
    publicKeyPrefix: env.CARD_WORKER_PUBLIC_KEY_PREFIX
      ? normalizePrefix(env.CARD_WORKER_PUBLIC_KEY_PREFIX)
      : null,
    s3Bucket: env.CARD_WORKER_S3_BUCKET ?? null,
    s3Region: env.CARD_WORKER_S3_REGION ?? null,
    s3Prefix: normalizePrefix(env.CARD_WORKER_S3_PREFIX),
    s3Endpoint: env.CARD_WORKER_S3_ENDPOINT ?? null,
    s3ForcePathStyle: parseBoolean(env.CARD_WORKER_S3_FORCE_PATH_STYLE),
    s3Acl: env.CARD_WORKER_S3_ACL ?? null,
    verifyPublic: parseBoolean(env.CARD_WORKER_VERIFY_PUBLIC),
    backfillConcurrency: env.CARD_WORKER_BACKFILL_CONCURRENCY,
    backfillManifestPath: env.CARD_WORKER_BACKFILL_MANIFEST_PATH
      ? path.resolve(env.CARD_WORKER_BACKFILL_MANIFEST_PATH)
      : null,
    sourceFormat,
    legacyStagingEnabled,
    sourceIdentity,
  };
}
