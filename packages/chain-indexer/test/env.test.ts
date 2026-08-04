import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBscRpcUrls } from '../src/config/env.js';

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
