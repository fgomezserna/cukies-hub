import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLegacyCukieMetadataUpdate,
  convertLegacyEvent,
  legacyMetadataSourceFilter,
} from './importer.js';
import { legacyCukieIdentity } from './identity.js';

test('legacy event import fixes the legacy runtime boundary', () => {
  const event = convertLegacyEvent({
    _id: 'legacy-transfer_7',
    network: 'BSC',
    eventName: 'Transfer',
    contractAddress: '0x0dbDeBCC62f11005BF434ABFad74564E896aC861',
    transactionId: `0x${'1'.repeat(64)}`,
    blockNumber: 120,
    timeStamp: 1_700_000_000,
    data: { tokenId: 42, from: '0x0', to: '0x1' },
  });

  assert.equal(event?.runtimeScope, 'legacy');
  assert.equal(
    event?._id,
    `legacy:BSC:TOKEN:Transfer:0x${'1'.repeat(64)}:7`,
  );
  assert.equal(event?.chain, 'BSC');
  assert.equal(event?.logIndex, 7);
});

test('metadata upsert targets the canonical compound document and preserves state/event fields', () => {
  const importedAt = new Date('2026-09-15T10:00:00.000Z');
  const source = {
    _id: '00042',
    network: 'bsc',
    img: 'ipfs://metadata/42.png',
    type: 'Legendary',
    parents: [{ _id: 1 }, { tokenId: '2' }],
    user: '0xsource-owner',
    state: 'onSale',
    price: 12,
    priceOriginal: '12',
    timeStamp: 123,
  };
  const operation = buildLegacyCukieMetadataUpdate(source, importedAt);
  assert.ok(operation);

  const update = operation.updateOne.update;
  const identity = legacyCukieIdentity('BSC', '42');
  assert.equal(operation.updateOne.filter._id, identity.documentId);
  assert.equal(update.$set.chain, 'BSC');
  assert.equal(update.$set.chainId, 56);
  assert.equal(update.$set.network, 'BSC');
  assert.equal(update.$set.collectionAddressNormalized, identity.collectionAddressNormalized);
  assert.equal(update.$set.tokenId, '42');
  assert.equal(update.$set.legacyProjectionKind, 'canonical');
  assert.deepEqual(update.$setOnInsert.parents, ['1', '2']);

  const protectedFields = [
    'user',
    'owner',
    'ownerNormalized',
    'state',
    'price',
    'priceOriginal',
    'timeStamp',
    'lastEventId',
    'ownershipEventId',
    'ownershipEventBlockNumber',
    'ownershipEventLogIndex',
  ];
  for (const field of protectedFields) {
    assert.equal(field in update.$set, false, `${field} no debe copiarse en $set`);
    assert.equal(field in update.$setOnInsert, false, `${field} no debe copiarse en $setOnInsert`);
  }

  const destination = {
    _id: identity.documentId,
    owner: '0xindexed-owner',
    ownerNormalized: '0xindexed-owner',
    state: 'available',
    price: 0,
    priceOriginal: '0',
    timeStamp: 999,
    lastEventId: 'BSC:TOKEN:Transfer:120:0',
    ownershipEventId: 'BSC:TOKEN:Transfer:120:0',
  } as Record<string, unknown>;
  Object.assign(destination, update.$set);
  assert.equal(destination.owner, '0xindexed-owner');
  assert.equal(destination.ownerNormalized, '0xindexed-owner');
  assert.equal(destination.state, 'available');
  assert.equal(destination.price, 0);
  assert.equal(destination.priceOriginal, '0');
  assert.equal(destination.timeStamp, 999);
  assert.equal(destination.lastEventId, 'BSC:TOKEN:Transfer:120:0');
  assert.equal(destination.ownershipEventId, 'BSC:TOKEN:Transfer:120:0');

  const replay = buildLegacyCukieMetadataUpdate(source, importedAt);
  assert.deepEqual(replay, operation);
});

test('same-db metadata source filter and identity reject compound destination ids', () => {
  const filter = legacyMetadataSourceFilter() as {
    network: { $in: string[] };
    $or: Array<{ _id: { $type: string; $regex?: RegExp } }>;
  };
  assert.deepEqual(filter.network.$in, ['BSC', 'TRON', 'bsc', 'tron']);
  assert.equal(filter.$or.some((item) => item._id.$regex?.test('42') === true), true);
  assert.equal(filter.$or.some((item) => item._id.$regex?.test('BSC:56:token:42') === true), false);

  const compound = buildLegacyCukieMetadataUpdate({
    _id: 'BSC:56:0x0dbdebcc62f11005bf434abfad74564e896ac861:42',
    network: 'BSC',
  });
  assert.equal(compound, null);
});
