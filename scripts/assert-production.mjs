#!/usr/bin/env node

import { pathToFileURL } from 'node:url';

export const PRODUCTION_TARGET = Object.freeze({
  appEnv: 'production',
  gitBranch: 'main',
  coolifyApplicationId: '12',
  coolifyResourceUuid: 'jookw8ow8woks088s44404ok',
  chainId: '56',
  databaseName: 'cukies-hub',
  legacyDatabaseName: 'cukies',
  indexerDatabaseName: 'cukieshub-new',
  authHosts: new Set(['cukies.world', 'www.cukies.world']),
  stakingAddress: '0xad18ff665e99d0033c3bb9d73182c2b03df59696',
});

export class ProductionGuardError extends Error {
  constructor(failures) {
    super(`PRODUCTION guard rejected the operation:\n- ${failures.join('\n- ')}`);
    this.name = 'ProductionGuardError';
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

function requireProductionAuthUrl(environment, failures) {
  const value = required(environment, 'NEXTAUTH_URL', failures);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !PRODUCTION_TARGET.authHosts.has(url.hostname)) {
      failures.push('NEXTAUTH_URL must use an approved production HTTPS hostname');
    }
    return url.hostname;
  } catch {
    failures.push('NEXTAUTH_URL is not a valid URL');
    return null;
  }
}

function requireAddress(environment, key, expected, failures) {
  const value = required(environment, key, failures);
  if (value && value.toLowerCase() !== expected) {
    failures.push(`${key} must equal the approved mainnet staking address`);
  }
  return value?.toLowerCase() ?? null;
}

export function validateProductionEnvironment(environment = process.env, scope = 'full') {
  const failures = [];
  const supportedScopes = new Set(['full', 'dapp', 'chain-indexer', 'cuki-card-worker']);
  if (!supportedScopes.has(scope)) {
    throw new ProductionGuardError([`unsupported guard scope ${scope}`]);
  }

  const appEnv = requireExact(environment, 'APP_ENV', PRODUCTION_TARGET.appEnv, failures);
  requireExact(environment, 'STAGING_ONLY_GUARD', 'false', failures);
  const gitBranch = requireQuotedOrExact(
    environment,
    'COOLIFY_BRANCH',
    PRODUCTION_TARGET.gitBranch,
    failures,
  );
  const coolifyResourceUuid = requireExact(
    environment,
    'COOLIFY_RESOURCE_UUID',
    PRODUCTION_TARGET.coolifyResourceUuid,
    failures,
  );
  const databaseName = requireMongoDatabase(
    environment,
    'DATABASE_URL',
    PRODUCTION_TARGET.databaseName,
    failures,
  );

  let publicChainId = null;
  let indexerChainId = null;
  let legacyDatabaseName = null;
  let indexerDatabaseName = null;
  let indexerMongoDatabaseName = null;
  let cardWorkerDatabaseName = null;
  let cardWorkerMongoDatabaseName = null;
  let authHost = null;
  let stakingAddress = null;

  if (scope === 'full' || scope === 'dapp') {
    publicChainId = requireExact(
      environment,
      'NEXT_PUBLIC_UKI_CHAIN_ID',
      PRODUCTION_TARGET.chainId,
      failures,
    );
    legacyDatabaseName = requireMongoDatabase(
      environment,
      'CUKIES_DATABASE_URL',
      PRODUCTION_TARGET.legacyDatabaseName,
      failures,
    );
    indexerDatabaseName = requireExact(
      environment,
      'CHAIN_INDEXER_DB_NAME',
      PRODUCTION_TARGET.indexerDatabaseName,
      failures,
    );
    indexerMongoDatabaseName = requireMongoDatabase(
      environment,
      'CHAIN_INDEXER_MONGO_URL',
      PRODUCTION_TARGET.databaseName,
      failures,
    );
    authHost = requireProductionAuthUrl(environment, failures);
    stakingAddress = requireAddress(
      environment,
      'NEXT_PUBLIC_UKI_STAKING_ADDRESS',
      PRODUCTION_TARGET.stakingAddress,
      failures,
    );
  }

  if (scope === 'full' || scope === 'chain-indexer') {
    indexerChainId = requireExact(
      environment,
      'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID',
      PRODUCTION_TARGET.chainId,
      failures,
    );
    indexerDatabaseName ??= requireExact(
      environment,
      'CHAIN_INDEXER_DB_NAME',
      PRODUCTION_TARGET.indexerDatabaseName,
      failures,
    );
    indexerMongoDatabaseName ??= requireMongoDatabase(
      environment,
      'CHAIN_INDEXER_MONGO_URL',
      PRODUCTION_TARGET.databaseName,
      failures,
    );
    stakingAddress ??= requireAddress(
      environment,
      'CHAIN_INDEXER_UKI_STAKING_ADDRESS',
      PRODUCTION_TARGET.stakingAddress,
      failures,
    );
    const aliases = required(environment, 'CHAIN_INDEXER_CONTRACT_ALIASES', failures)
      ?.split(',')
      .map((alias) => alias.trim())
      .filter(Boolean) ?? [];
    if (!aliases.includes('UKI_STAKING')) {
      failures.push('CHAIN_INDEXER_CONTRACT_ALIASES must include UKI_STAKING');
    }
  }

  if (scope === 'full' || scope === 'cuki-card-worker') {
    cardWorkerDatabaseName = requireExact(
      environment,
      'CARD_WORKER_DB_NAME',
      PRODUCTION_TARGET.indexerDatabaseName,
      failures,
    );
    cardWorkerMongoDatabaseName = requireMongoDatabase(
      environment,
      'CARD_WORKER_MONGO_URL',
      PRODUCTION_TARGET.databaseName,
      failures,
    );
  }

  if (failures.length > 0) throw new ProductionGuardError(failures);

  return {
    ok: true,
    target: 'production',
    scope,
    appEnv,
    gitBranch,
    coolifyApplicationId: PRODUCTION_TARGET.coolifyApplicationId,
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
    stakingAddress,
  };
}

function main() {
  try {
    const scopeIndex = process.argv.indexOf('--scope');
    const scope = scopeIndex === -1 ? 'full' : process.argv[scopeIndex + 1];
    console.log(JSON.stringify(validateProductionEnvironment(process.env, scope), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
