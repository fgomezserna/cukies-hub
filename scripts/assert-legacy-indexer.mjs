#!/usr/bin/env node

const TARGETS = Object.freeze({
  staging: { dbName: 'cukies-legacy-indexer-staging', branch: 'staging', guard: 'true', coolifyResourceUuid: 'u4s804o4wwcckowgk0woo4wg', applicationId: '28' },
  production: { dbName: 'cukies-legacy-indexer', branch: 'main', guard: 'false', coolifyResourceUuid: 'jookw8ow8woks088s44404ok', applicationId: '12' },
  test: { dbName: 'cukies-legacy-worker-test', branch: null, guard: null },
});

function required(environment, key, failures) {
  const value = environment[key]?.trim();
  if (!value) failures.push(`${key} is required`);
  return value;
}

function mongoDatabase(value, key, failures) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['mongodb:', 'mongodb+srv:'].includes(url.protocol)) {
      failures.push(`${key} must be a MongoDB URL`);
      return null;
    }
    const dbName = decodeURIComponent(url.pathname.replace(/^\//, '')).trim();
    if (!dbName) failures.push(`${key} must include an explicit database name`);
    return dbName || null;
  } catch {
    failures.push(`${key} is not a valid MongoDB URL`);
    return null;
  }
}

export function validateLegacyIndexerEnvironment(environment = process.env, target = environment.APP_ENV) {
  const failures = [];
  const expected = TARGETS[target];
  if (!expected) failures.push('APP_ENV must be staging, production or test');
  if (expected && environment.APP_ENV !== target) failures.push(`APP_ENV must equal ${target}`);
  if (environment.CUKIES_SERVICE !== 'legacy-chain-indexer') failures.push('CUKIES_SERVICE must equal legacy-chain-indexer');
  if (environment.CUKIES_LEGACY_INDEXER_ENABLED !== 'true') failures.push('CUKIES_LEGACY_INDEXER_ENABLED must equal true');
  if (environment.CUKIES_LEGACY_BSC_CHAIN_ID && environment.CUKIES_LEGACY_BSC_CHAIN_ID !== '56') failures.push('CUKIES_LEGACY_BSC_CHAIN_ID must equal 56');
  if (environment.CUKIES_LEGACY_TRON_NETWORK !== 'mainnet') failures.push('CUKIES_LEGACY_TRON_NETWORK must equal mainnet');
  if (target !== 'test' && environment.CUKIES_LEGACY_TRON_API_BASE_URL !== 'https://api.trongrid.io/v1') {
    failures.push('CUKIES_LEGACY_TRON_API_BASE_URL must equal https://api.trongrid.io/v1 for mainnet events');
  }
  if (expected?.branch && environment.COOLIFY_BRANCH?.replace(/^['"]|['"]$/g, '') !== expected.branch) failures.push(`COOLIFY_BRANCH must equal ${expected.branch}`);
  if (expected?.coolifyResourceUuid && environment.COOLIFY_RESOURCE_UUID !== expected.coolifyResourceUuid) failures.push(`COOLIFY_RESOURCE_UUID must equal ${expected.coolifyResourceUuid}`);
  if (expected?.applicationId && environment.COOLIFY_APPLICATION_ID && environment.COOLIFY_APPLICATION_ID !== expected.applicationId) failures.push(`COOLIFY_APPLICATION_ID must equal ${expected.applicationId}`);
  if (expected?.guard && environment.STAGING_ONLY_GUARD !== expected.guard) failures.push(`STAGING_ONLY_GUARD must equal ${expected.guard}`);
  const mongoUrl = required(environment, 'CUKIES_LEGACY_INDEXER_MONGO_URL', failures);
  const encodedDbName = mongoDatabase(mongoUrl, 'CUKIES_LEGACY_INDEXER_MONGO_URL', failures);
  const configuredDbName = required(environment, 'CUKIES_LEGACY_INDEXER_DB_NAME', failures);
  if (expected && configuredDbName && configuredDbName !== expected.dbName) failures.push(`CUKIES_LEGACY_INDEXER_DB_NAME must equal ${expected.dbName}`);
  if (expected && encodedDbName && encodedDbName !== expected.dbName) failures.push(`CUKIES_LEGACY_INDEXER_MONGO_URL must target database ${expected.dbName}`);
  for (const [key, value] of [['CUKIES_LEGACY_BSC_RPC_URLS', environment.CUKIES_LEGACY_BSC_RPC_URLS], ['CUKIES_LEGACY_BSC_START_BLOCK', environment.CUKIES_LEGACY_BSC_START_BLOCK], ['CUKIES_LEGACY_TRON_API_BASE_URL', environment.CUKIES_LEGACY_TRON_API_BASE_URL], ['CUKIES_LEGACY_TRON_START_TIMESTAMP_MS', environment.CUKIES_LEGACY_TRON_START_TIMESTAMP_MS]]) {
    required(environment, key, failures);
    if (value && (key.endsWith('START_BLOCK') || key.endsWith('TIMESTAMP_MS')) && !/^\d+$/.test(value.trim())) failures.push(`${key} must be a non-negative integer`);
  }
  if (environment.CUKIES_LEGACY_CONTRACT_ALIASES && environment.CUKIES_LEGACY_CONTRACT_ALIASES !== 'TOKEN,MINT,REFERRALS,POINTS,STAKING_POINTS,BREEDING_POINTS,MARKETPLACE,BRIDGE') failures.push('CUKIES_LEGACY_CONTRACT_ALIASES contains a non-canonical alias');
  if (failures.length) throw new Error(`LEGACY INDEXER guard rejected the operation:\n- ${failures.join('\n- ')}`);
  return { ok: true, target, dbName: expected?.dbName, runtimeScope: 'legacy' };
}

if (process.argv[1]?.endsWith('/assert-legacy-indexer.mjs')) {
  try {
    console.log(JSON.stringify(validateLegacyIndexerEnvironment(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
