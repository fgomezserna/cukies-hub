#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const STAGING_TARGET = Object.freeze({
  appEnv: 'staging',
  gitBranch: 'staging',
  coolifyApplicationId: '28',
  coolifyResourceUuid: 'u4s804o4wwcckowgk0woo4wg',
  chainId: '97',
  databaseName: 'cukies-hub-staging',
  legacyDatabaseName: 'cukies-legacy-staging',
  indexerDatabaseName: 'cukieshub-new-staging',
  authHosts: new Set(['cukieshub.eurekand.com', 'cukies-hub.eurekand.com']),
});

export class StagingGuardError extends Error {
  constructor(failures) {
    super(`STAGING-ONLY guard rejected the operation:\n- ${failures.join('\n- ')}`);
    this.name = 'StagingGuardError';
    this.failures = failures;
  }
}

function required(environment, key, failures) {
  const value = environment[key]?.trim();
  if (!value) failures.push(`${key} is required`);
  return value;
}

function requireExact(environment, key, expected, failures) {
  const value = required(environment, key, failures);
  if (value && value !== expected) failures.push(`${key} must equal ${expected}`);
  return value;
}

function requireQuotedOrExact(environment, key, expected, failures) {
  const rawValue = required(environment, key, failures);
  const value = rawValue?.replace(/^(['"])(.*)\1$/, '$2');
  if (value && value !== expected) failures.push(`${key} must equal ${expected}`);
  return value;
}

function databaseNameFromMongoUrl(value, key, failures) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') {
      failures.push(`${key} must be a MongoDB URL`);
      return null;
    }
    const databaseName = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
    if (!databaseName) failures.push(`${key} must include an explicit database name`);
    return databaseName || null;
  } catch {
    failures.push(`${key} is not a valid MongoDB URL`);
    return null;
  }
}

function requireMongoDatabase(environment, key, expected, failures) {
  const value = required(environment, key, failures);
  const databaseName = databaseNameFromMongoUrl(value, key, failures);
  if (databaseName && databaseName !== expected) {
    failures.push(`${key} must target database ${expected}`);
  }
  return databaseName;
}

function requireStagingAuthUrl(environment, failures) {
  const value = required(environment, 'NEXTAUTH_URL', failures);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !STAGING_TARGET.authHosts.has(url.hostname)) {
      failures.push('NEXTAUTH_URL must use the approved staging HTTPS hostname');
    }
    return url.hostname;
  } catch {
    failures.push('NEXTAUTH_URL is not a valid URL');
    return null;
  }
}

export function validateStagingEnvironment(environment = process.env, scope = 'full') {
  const failures = [];
  const supportedScopes = new Set([
    'full',
    'dapp',
    'chain-indexer',
    'cuki-card-worker',
    'economy-scheduler',
  ]);
  if (!supportedScopes.has(scope)) {
    throw new StagingGuardError([`unsupported guard scope ${scope}`]);
  }

  const appEnv = requireExact(environment, 'APP_ENV', STAGING_TARGET.appEnv, failures);
  requireExact(environment, 'STAGING_ONLY_GUARD', 'true', failures);
  const gitBranch = requireQuotedOrExact(
    environment,
    'COOLIFY_BRANCH',
    STAGING_TARGET.gitBranch,
    failures,
  );
  const coolifyResourceUuid = requireExact(
    environment,
    'COOLIFY_RESOURCE_UUID',
    STAGING_TARGET.coolifyResourceUuid,
    failures,
  );

  let publicChainId = null;
  let indexerChainId = null;
  const databaseName = requireMongoDatabase(
    environment,
    'DATABASE_URL',
    STAGING_TARGET.databaseName,
    failures,
  );
  let legacyDatabaseName = null;
  let indexerDatabaseName = null;
  let indexerMongoDatabaseName = null;
  let cardWorkerDatabaseName = null;
  let cardWorkerMongoDatabaseName = null;
  let authHost = null;

  if (scope === 'full' || scope === 'dapp') {
    publicChainId = requireExact(
      environment,
      'NEXT_PUBLIC_UKI_CHAIN_ID',
      STAGING_TARGET.chainId,
      failures,
    );
    legacyDatabaseName = requireMongoDatabase(
      environment,
      'CUKIES_DATABASE_URL',
      STAGING_TARGET.legacyDatabaseName,
      failures,
    );
    indexerDatabaseName = requireExact(
      environment,
      'CHAIN_INDEXER_DB_NAME',
      STAGING_TARGET.indexerDatabaseName,
      failures,
    );
    indexerMongoDatabaseName = requireMongoDatabase(
      environment,
      'CHAIN_INDEXER_MONGO_URL',
      STAGING_TARGET.indexerDatabaseName,
      failures,
    );
    authHost = requireStagingAuthUrl(environment, failures);
  }

  if (scope === 'full' || scope === 'chain-indexer' || scope === 'economy-scheduler') {
    indexerChainId = requireExact(
      environment,
      'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID',
      STAGING_TARGET.chainId,
      failures,
    );
    indexerDatabaseName ??= requireExact(
      environment,
      'CHAIN_INDEXER_DB_NAME',
      STAGING_TARGET.indexerDatabaseName,
      failures,
    );
    indexerMongoDatabaseName ??= requireMongoDatabase(
      environment,
      'CHAIN_INDEXER_MONGO_URL',
      STAGING_TARGET.indexerDatabaseName,
      failures,
    );
  }

  if (scope === 'full' || scope === 'cuki-card-worker') {
    cardWorkerDatabaseName = requireExact(
      environment,
      'CARD_WORKER_DB_NAME',
      STAGING_TARGET.indexerDatabaseName,
      failures,
    );
    cardWorkerMongoDatabaseName = requireMongoDatabase(
      environment,
      'CARD_WORKER_MONGO_URL',
      STAGING_TARGET.indexerDatabaseName,
      failures,
    );
  }

  if (failures.length > 0) throw new StagingGuardError(failures);

  return {
    ok: true,
    target: 'staging-only',
    scope,
    appEnv,
    gitBranch,
    coolifyApplicationId: STAGING_TARGET.coolifyApplicationId,
    coolifyResourceUuid,
    publicChainId,
    indexerChainId,
    databaseName,
    legacyDatabaseName,
    indexerDatabaseName,
    indexerMongoDatabaseName,
    cardWorkerDatabaseName,
    cardWorkerMongoDatabaseName,
    authHost,
  };
}

function main() {
  try {
    const scopeIndex = process.argv.indexOf('--scope');
    const scope = scopeIndex === -1 ? 'full' : process.argv[scopeIndex + 1];
    console.log(JSON.stringify(validateStagingEnvironment(process.env, scope), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
