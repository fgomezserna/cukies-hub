import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCardWorkerSourceConfig,
  LEGACY_STAGING_DB_NAME,
  normalizeCukiSourceDocument,
  sourceDocumentFilter,
  sourceTokenIdFilter,
} from './source.js';
import type { CukiDocument } from './types.js';

const baseLegacy: CukiDocument = {
  _id: 1_000_000_000_000,
  network: 'BSC',
  type: 3,
  skills: { generation: 1 },
};

describe('legacy source adapter', () => {
  it('normalizes a mixed BSC/TRON source without replacing the real document id', () => {
    const bsc = normalizeCukiSourceDocument(baseLegacy, 'legacy');
    const tron = normalizeCukiSourceDocument({
      ...baseLegacy,
      _id: 1_000_000_000_001,
      network: 'TRON',
    }, 'legacy');

    assert.equal(bsc._id, 1_000_000_000_000);
    assert.equal(bsc.tokenId, '1000000000000');
    assert.equal(bsc.chainId, 56);
    assert.equal(bsc.collectionAddressNormalized, '0x0dbdebcc62f11005bf434abfad74564e896aC861'.toLowerCase());
    assert.equal(tron._id, 1_000_000_000_001);
    assert.equal(tron.tokenId, '1000000000001');
    assert.equal(tron.chainId, undefined);
    assert.equal(tron.collectionAddressNormalized, 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe');
  });

  it('rejects ObjectId-like/no-id values and identity conflicts before claim', () => {
    assert.throws(
      () => normalizeCukiSourceDocument({ ...baseLegacy, _id: '507f1f77bcf86cd799439011' }, 'legacy'),
      /entero decimal/,
    );
    assert.throws(
      () => normalizeCukiSourceDocument({ ...baseLegacy, _id: undefined as never }, 'legacy'),
      /entero decimal/,
    );
    assert.throws(
      () => normalizeCukiSourceDocument({ ...baseLegacy, tokenId: '9' }, 'legacy'),
      /conflicto/,
    );
    assert.throws(
      () => normalizeCukiSourceDocument({ ...baseLegacy, network: 'BSC', chainId: 97 }, 'legacy'),
      /chainId/,
    );
  });

  it('queries the original legacy id while keeping indexed behavior unchanged', () => {
    assert.deepEqual(sourceDocumentFilter('1000000000000', 'legacy'), { _id: '1000000000000' });
    assert.deepEqual(sourceTokenIdFilter('1000000000000', 'legacy'), {
      $or: [{ _id: '1000000000000' }, { _id: 1_000_000_000_000 }],
    });
    assert.deepEqual(sourceTokenIdFilter('42', 'indexed'), {
      $or: [{ tokenId: '42' }, { _id: '42' }],
    });
  });

  it('rejects explicit network/chain conflicts before replacing chain, while allowing chain omission', () => {
    assert.doesNotThrow(() => normalizeCukiSourceDocument({ ...baseLegacy, chain: undefined }, 'legacy'));
    assert.throws(
      () => normalizeCukiSourceDocument({ ...baseLegacy, network: 'BSC', chain: 'TRON' }, 'legacy'),
      /identidad canónica inválida/,
    );
  });
});

describe('legacy source guard', () => {
  it('requires explicit staging mode and the dedicated staging database', () => {
    assert.throws(
      () => assertCardWorkerSourceConfig({
        sourceFormat: 'legacy',
        legacyStagingEnabled: false,
        dbName: LEGACY_STAGING_DB_NAME,
      }),
      /LEGACY_STAGING_ENABLED/,
    );
    assert.throws(
      () => assertCardWorkerSourceConfig({
        sourceFormat: 'legacy',
        legacyStagingEnabled: true,
        dbName: 'cukieshub-new-staging',
      }),
      /sólo permite/,
    );
  });
});
