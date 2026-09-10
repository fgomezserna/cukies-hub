import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const SCRIPT = 'scripts/test-competition-credit-real-mongo.ts';
const SAFE_URI = 'mongodb://127.0.0.1:27017/?replicaSet=rs0';
const SAFE_DB = 'cukies_credit_real_123_456';

function runDirect(overrides) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', SCRIPT],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        ...overrides,
      },
      encoding: 'utf8',
      timeout: 10_000,
    },
  );
  return {
    ...result,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function assertRejected(overrides, reason) {
  const result = runDirect(overrides);
  assert.equal(result.status === 0, false, `se esperaba rechazo: ${result.output}`);
  assert.match(result.output, reason);
  // The validator runs before repository imports, connection and dropDatabase.
  assert.doesNotMatch(result.output, /Mongo real competition credits: 4 escenarios OK/);
}

test('rechaza URI con opciones extra antes de cualquier mutacion', () => {
  assertRejected({
    CREDIT_REAL_MONGO_URI: `${SAFE_URI}&authSource=admin`,
    CREDIT_REAL_MONGO_DB_NAME: SAFE_DB,
    CHAIN_INDEXER_MONGO_URL: `${SAFE_URI}&authSource=admin`,
    CHAIN_INDEXER_DB_NAME: SAFE_DB,
  }, /CREDIT_REAL_MONGO_URI debe tener exactamente/);
});

test('rechaza nombre de base ajeno antes de cualquier mutacion', () => {
  assertRejected({
    CREDIT_REAL_MONGO_URI: SAFE_URI,
    CREDIT_REAL_MONGO_DB_NAME: 'cukieshub-new',
    CHAIN_INDEXER_MONGO_URL: SAFE_URI,
    CHAIN_INDEXER_DB_NAME: 'cukieshub-new',
  }, /CREDIT_REAL_MONGO_DB_NAME debe cumplir/);
});

test('rechaza identidad CHAIN_INDEXER heredada que no coincide', () => {
  assertRejected({
    CREDIT_REAL_MONGO_URI: SAFE_URI,
    CREDIT_REAL_MONGO_DB_NAME: SAFE_DB,
    CHAIN_INDEXER_MONGO_URL: 'mongodb://127.0.0.1:27018/?replicaSet=rs0',
    CHAIN_INDEXER_DB_NAME: SAFE_DB,
  }, /CHAIN_INDEXER_MONGO_URL debe coincidir exactamente/);
});
