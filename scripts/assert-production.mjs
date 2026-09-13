#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { validateLegacyIndexerEnvironment } from './assert-legacy-indexer.mjs';

export const PRODUCTION_TARGET = Object.freeze({
  appEnv: 'production',
  gitBranch: 'main',
  coolifyApplicationId: '12',
  coolifyResourceUuid: 'jookw8ow8woks088s44404ok',
  coolifyResourceUuids: Object.freeze({
    workers: 'jookw8ow8woks088s44404ok',
    web: 'uo8gswsg84c488cowko0kkkg',
    game: 'tkkggwcosc4gksckcc480cwg',
  }),
  chainId: '56',
  // Production has one logical database.  The old names are deliberately not
  // accepted by any runtime guard; legacy collections are namespaced inside
  // this database during the migration.
  unifiedDatabaseName: 'cukieshub-new',
  databaseName: 'cukieshub-new',
  legacyDatabaseName: 'cukieshub-new',
  indexerDatabaseName: 'cukieshub-new',
  authHosts: new Set(['cukies.world', 'www.cukies.world']),
  stakingAddress: '0xad18ff665e99d0033c3bb9d73182c2b03df59696',
});

const RETIRED_EVENTLOG_VARIABLES = Object.freeze([
  'NX_TRON_DB',
  'TRON_DB',
  'CUKIES_TRON_DB',
  'EVENTLOG_DATABASE_URL',
  'EVENTLOG_MONGO_URL',
]);

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

function productionResourceIds(scope) {
  if (scope === 'dapp') {
    return [
      PRODUCTION_TARGET.coolifyResourceUuids.web,
      PRODUCTION_TARGET.coolifyResourceUuids.workers,
    ];
  }
  if (scope === 'game') return [PRODUCTION_TARGET.coolifyResourceUuids.game];
  return [PRODUCTION_TARGET.coolifyResourceUuids.workers];
}

function requireProductionResource(environment, scope, failures) {
  const value = required(environment, 'COOLIFY_RESOURCE_UUID', failures);
  const allowed = productionResourceIds(scope);
  if (value && !allowed.includes(value)) {
    failures.push(`COOLIFY_RESOURCE_UUID must equal one of the approved production resources (${allowed.join(', ')})`);
  }
  return value;
}

function productionApplicationId(resourceUuid) {
  if (resourceUuid === PRODUCTION_TARGET.coolifyResourceUuids.web) return '33';
  if (resourceUuid === PRODUCTION_TARGET.coolifyResourceUuids.game) return '13';
  return '12';
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

function mongoConnectionFingerprint(value, key, failures) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:') {
      failures.push(`${key} must be a MongoDB URL`);
      return null;
    }
    const username = decodeURIComponent(url.username);
    const password = decodeURIComponent(url.password);
    const port = url.port || (url.protocol === 'mongodb+srv:' ? 'srv' : '27017');
    const authSource = url.searchParams.get('authSource') ?? '';
    // The password is compared in memory so every service really uses one URI,
    // but it is never included in an error or return value.
    return {
      endpoint: `${url.protocol}//${username}@${url.hostname.toLowerCase()}:${port}|authSource=${authSource}`,
      password,
    };
  } catch {
    failures.push(`${key} is not a valid MongoDB URL`);
    return null;
  }
}

function requireOneMongoRuntime(environment, entries, failures) {
  const fingerprints = new Map();
  for (const [key, value] of entries) {
    if (!value?.trim()) continue;
    const fingerprint = mongoConnectionFingerprint(value.trim(), key, failures);
    if (fingerprint) fingerprints.set(key, fingerprint);
  }
  const uniqueEndpoints = new Set([...fingerprints.values()].map(({ endpoint }) => endpoint));
  const uniquePasswords = new Set([...fingerprints.values()].map(({ password }) => password));
  if (uniqueEndpoints.size > 1 || uniquePasswords.size > 1) {
    failures.push('all production Mongo variables must use the same endpoint, database and runtime credentials');
  }
}

function rejectRetiredEventlogVariables(environment, failures) {
  for (const key of RETIRED_EVENTLOG_VARIABLES) {
    if (environment[key]?.trim()) {
      failures.push(`${key} is retired; Tron getters read the chain directly and must not use eventlog`);
    }
  }
  for (const key of Object.keys(environment)) {
    if (!/(?:MONGO|DATABASE|DB|URL)/i.test(key) || !/eventlog/i.test(environment[key] ?? '')) continue;
    failures.push(`${key} must not reference retired eventlog`);
  }
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
  if (scope === 'legacy-chain-indexer') return validateLegacyIndexerEnvironment(environment, 'production');
  const failures = [];
  const supportedScopes = new Set([
    'full',
    'dapp',
    'chain-indexer',
    'cuki-card-worker',
    'cukies-bridge-relayer',
    'economy-scheduler',
  ]);
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
  const coolifyResourceUuid = requireProductionResource(environment, scope, failures);
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
  let legacyIndexerDatabaseName = null;
  let cardWorkerDatabaseName = null;
  let cardWorkerMongoDatabaseName = null;
  let bridgeRelayerDatabaseName = null;
  let bridgeRelayerMongoDatabaseName = null;
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

  if (scope === 'full' || scope === 'chain-indexer' || scope === 'economy-scheduler') {
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
    if (environment.CARD_WORKER_SOURCE_FORMAT?.trim()
      && environment.CARD_WORKER_SOURCE_FORMAT.trim() !== 'indexed') {
      failures.push('CARD_WORKER_SOURCE_FORMAT must equal indexed in production');
    }
    if (environment.CARD_WORKER_LEGACY_STAGING_ENABLED?.trim() === 'true') {
      failures.push('CARD_WORKER_LEGACY_STAGING_ENABLED must be false in production');
    }
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

  if (scope === 'full' && (environment.CUKIES_LEGACY_INDEXER_MONGO_URL?.trim()
    || environment.CUKIES_LEGACY_INDEXER_DB_NAME?.trim())) {
    legacyIndexerDatabaseName = requireExact(
      environment,
      'CUKIES_LEGACY_INDEXER_DB_NAME',
      PRODUCTION_TARGET.unifiedDatabaseName,
      failures,
    );
    requireMongoDatabase(
      environment,
      'CUKIES_LEGACY_INDEXER_MONGO_URL',
      PRODUCTION_TARGET.unifiedDatabaseName,
      failures,
    );
  }

  if (scope === 'cukies-bridge-relayer') {
    if (environment.CUKIES_BRIDGE_RELAYER_ENABLED?.trim() === 'true') {
      failures.push('CUKIES_BRIDGE_RELAYER_ENABLED must be false in production; the relayer is staging-only');
    }
    bridgeRelayerDatabaseName = requireExact(
      environment,
      'CUKIES_BRIDGE_RELAYER_DB_NAME',
      PRODUCTION_TARGET.unifiedDatabaseName,
      failures,
    );
    bridgeRelayerMongoDatabaseName = requireMongoDatabase(
      environment,
      'CUKIES_BRIDGE_RELAYER_MONGO_URL',
      PRODUCTION_TARGET.unifiedDatabaseName,
      failures,
    );
  }

  if (scope === 'full' || scope === 'dapp' || scope === 'chain-indexer'
    || scope === 'cuki-card-worker' || scope === 'cukies-bridge-relayer'
    || scope === 'economy-scheduler') {
    const mongoEntries = [['DATABASE_URL', environment.DATABASE_URL]];
    if (scope === 'full' || scope === 'dapp' || scope === 'chain-indexer') {
      mongoEntries.push(['CUKIES_DATABASE_URL', environment.CUKIES_DATABASE_URL]);
    }
    if (scope === 'full' || scope === 'dapp' || scope === 'chain-indexer' || scope === 'economy-scheduler') {
      mongoEntries.push(['CHAIN_INDEXER_MONGO_URL', environment.CHAIN_INDEXER_MONGO_URL]);
    }
    if (scope === 'full' || scope === 'cuki-card-worker') mongoEntries.push(['CARD_WORKER_MONGO_URL', environment.CARD_WORKER_MONGO_URL]);
    if (scope === 'full' && environment.CUKIES_LEGACY_INDEXER_MONGO_URL) {
      mongoEntries.push(['CUKIES_LEGACY_INDEXER_MONGO_URL', environment.CUKIES_LEGACY_INDEXER_MONGO_URL]);
    }
    if (scope === 'cukies-bridge-relayer') mongoEntries.push(['CUKIES_BRIDGE_RELAYER_MONGO_URL', environment.CUKIES_BRIDGE_RELAYER_MONGO_URL]);
    requireOneMongoRuntime(environment, mongoEntries, failures);
  }

  rejectRetiredEventlogVariables(environment, failures);

  if (failures.length > 0) throw new ProductionGuardError(failures);

  return {
    ok: true,
    target: 'production',
    scope,
    appEnv,
    gitBranch,
    coolifyApplicationId: productionApplicationId(coolifyResourceUuid),
    coolifyResourceUuid,
    unifiedDatabaseName: PRODUCTION_TARGET.unifiedDatabaseName,
    publicChainId,
    indexerChainId,
    databaseName,
    legacyDatabaseName,
    indexerDatabaseName,
    indexerMongoDatabaseName,
    cardWorkerDatabaseName,
    cardWorkerMongoDatabaseName,
    legacyIndexerDatabaseName,
    bridgeRelayerDatabaseName,
    bridgeRelayerMongoDatabaseName,
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
