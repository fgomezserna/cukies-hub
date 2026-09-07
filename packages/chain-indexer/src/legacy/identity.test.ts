import assert from 'node:assert/strict';
import test from 'node:test';

import { legacyListingIdentity, legacyNftDocumentId, legacyPointsIdentity } from './identity.js';
import type { ChainEvent } from '../types.js';

function event(chain: 'BSC' | 'TRON', contractAddress: string, chainId?: number): ChainEvent {
  return {
    _id: 'legacy-test', runtimeScope: 'legacy', chain, chainId, contractAlias: 'TOKEN', contractAddress,
    eventName: 'Transfer', txHash: '0x1', logIndex: 0, blockNumber: 1, timestampMs: 1,
    args: {}, normalized: {}, raw: {}, status: 'ingested', attempts: 0, schemaVersion: 1,
    createdAt: new Date(), updatedAt: new Date(),
  };
}

test('legacy NFT identity separates BSC 56 and TRON for the same tokenId', () => {
  const bsc = event('BSC', '0x0dbDeBCC62f11005BF434ABFad74564E896aC861', 56);
  const tron = event('TRON', 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe');
  assert.notEqual(legacyNftDocumentId(bsc, '42'), legacyNftDocumentId(tron, '42'));
  assert.deepEqual(legacyListingIdentity(bsc, '42'), {
    chain: 'BSC', chainId: 56,
    collectionAddressNormalized: '0x0dbdebcc62f11005bf434abfad74564e896ac861', tokenId: '42',
  });
});

test('legacy points identity includes chain, POINTS contract and wallet', () => {
  const bsc = event('BSC', '0x6875F0C9547c35F7EE700230FE8B9A7687F3ddB2', 56);
  const tron = event('TRON', 'TWwNJEySYrkNXTpDBF7WfGwkoW4YTZ4yKA');
  assert.notEqual(legacyPointsIdentity(bsc, 'wallet'), legacyPointsIdentity(tron, 'wallet'));
  assert.match(legacyPointsIdentity(bsc, 'wallet'), /^BSC:0x6875/);
});
