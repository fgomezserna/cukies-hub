import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveBscRpcUrls,
  resolveMongoDatabaseNameFromUrl,
} from '../src/config/env.js';

test('testnet ignores the legacy mainnet RPC and keeps only explicit URLs', () => {
  const urls = resolveBscRpcUrls({
    expectedChainId: 97,
    rpcUrls: 'https://testnet-one.example, https://testnet-two.example',
    legacyRpcUrl: 'https://mainnet.example',
  });

  assert.deepEqual(urls, [
    'https://testnet-one.example',
    'https://testnet-two.example',
  ]);
});

test('testnet fails closed when no explicit RPC is configured', () => {
  assert.throws(
    () => resolveBscRpcUrls({
      expectedChainId: 97,
      legacyRpcUrl: 'https://mainnet.example',
    }),
    /BSC Testnet exige/,
  );
});

test('mainnet preserves the legacy fallback', () => {
  assert.deepEqual(
    resolveBscRpcUrls({ expectedChainId: 56 }),
    ['https://bsc.rpc.blxrbdn.com'],
  );
});

test('legacy imports select the database encoded in the runtime URL', () => {
  assert.equal(
    resolveMongoDatabaseNameFromUrl(
      'mongodb://db.invalid:27017/cukies-legacy-staging?authSource=admin',
      'CUKIES_DATABASE_URL',
    ),
    'cukies-legacy-staging',
  );
  assert.equal(
    resolveMongoDatabaseNameFromUrl(
      'mongodb://db.invalid:27017/cukies?authSource=admin',
      'CUKIES_DATABASE_URL',
    ),
    'cukies',
  );
});

test('legacy imports fail closed when the URL has no database', () => {
  assert.throws(
    () => resolveMongoDatabaseNameFromUrl(
      'mongodb://db.invalid:27017',
      'CUKIES_DATABASE_URL',
    ),
    /debe incluir explicitamente el nombre de la base de datos/,
  );
});
