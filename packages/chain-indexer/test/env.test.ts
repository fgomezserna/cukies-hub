import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveBscRpcUrls,
  resolveMongoDatabaseNameFromUrl,
  resolveVerifiedBscContractIdentity,
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

test('verified BSC identity requires exact deployment evidence without network defaults', () => {
  const identity = resolveVerifiedBscContractIdentity({
    alias: 'VESTING_VAULT',
    chainId: 97,
    address: `0x${'1'.repeat(40)}`,
    startBlock: 123,
    deploymentBlock: 123,
    deploymentTxHash: `0x${'2'.repeat(64)}`,
    runtimeCodeHash: `0x${'3'.repeat(64)}`,
    requested: true,
  });
  assert.equal(identity?.chainId, 97);
  assert.match(identity?.configHash ?? '', /^0x[0-9a-f]{64}$/);
  assert.throws(
    () => resolveVerifiedBscContractIdentity({
      alias: 'VESTING_VAULT',
      chainId: 97,
      address: `0x${'1'.repeat(40)}`,
      startBlock: 122,
      deploymentBlock: 123,
      deploymentTxHash: `0x${'2'.repeat(64)}`,
      runtimeCodeHash: `0x${'3'.repeat(64)}`,
      requested: true,
    }),
    /start block y deployment block explicitos e iguales/,
  );
  assert.equal(resolveVerifiedBscContractIdentity({
    alias: 'VESTING_VAULT',
    chainId: 97,
    address: undefined,
    startBlock: undefined,
    deploymentBlock: undefined,
    deploymentTxHash: undefined,
    runtimeCodeHash: undefined,
    requested: false,
  }), undefined);
});

test('verified BSC identity applies the same exact evidence to NFT aliases', () => {
  const identity = resolveVerifiedBscContractIdentity({
    alias: 'TOKEN',
    chainId: 97,
    address: `0x${'4'.repeat(40)}`,
    startBlock: 456,
    deploymentBlock: 456,
    deploymentTxHash: `0x${'5'.repeat(64)}`,
    runtimeCodeHash: `0x${'6'.repeat(64)}`,
    requested: true,
  });
  assert.equal(identity?.alias, 'TOKEN');
  assert.equal(identity?.chainId, 97);
  assert.equal(identity?.startBlock, 456);
  assert.match(identity?.configHash ?? '', /^0x[0-9a-f]{64}$/);
});

test('TOKEN_V2 requires its own complete deployment identity and never falls back to TOKEN', () => {
  assert.throws(
    () => resolveVerifiedBscContractIdentity({
      alias: 'TOKEN_V2',
      chainId: 97,
      address: undefined,
      startBlock: 456,
      deploymentBlock: 456,
      deploymentTxHash: `0x${'5'.repeat(64)}`,
      runtimeCodeHash: `0x${'6'.repeat(64)}`,
      requested: true,
    }),
    /TOKEN_V2 fue solicitado sin una address BSC configurada/,
  );
  const identity = resolveVerifiedBscContractIdentity({
    alias: 'TOKEN_V2',
    chainId: 97,
    address: `0x${'7'.repeat(40)}`,
    startBlock: 789,
    deploymentBlock: 789,
    deploymentTxHash: `0x${'8'.repeat(64)}`,
    runtimeCodeHash: `0x${'9'.repeat(64)}`,
    requested: true,
  });
  assert.equal(identity?.alias, 'TOKEN_V2');
  assert.equal(identity?.address, `0x${'7'.repeat(40)}`);
  assert.equal(identity?.startBlock, 789);
});
