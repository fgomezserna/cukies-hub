import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertCardWorkerSourceConfig,
  LEGACY_STAGING_DB_NAME,
  normalizeCukiSourceDocument,
  legacySourceIdentityFilter,
  sourceCandidateFilter,
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

  it('mantiene BSC legacy 56 y TRON, pero nunca reinterpreta una fila indexada BSC 97', () => {
    assert.doesNotThrow(() => normalizeCukiSourceDocument({
      ...baseLegacy,
      chainId: 56,
      collectionAddressNormalized: '0x0DBDEBCC62F11005BF434ABFad74564E896aC861',
    }, 'legacy'));
    assert.doesNotThrow(() => normalizeCukiSourceDocument({
      ...baseLegacy,
      _id: 1_000_000_000_001,
      network: 'TRON',
      chainId: null,
      collectionAddressNormalized: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
    }, 'legacy'));
    assert.throws(() => normalizeCukiSourceDocument({
      ...baseLegacy,
      _id: 98_000_001,
      chainId: 97,
      collectionAddressNormalized: '0xd4c7b16db234d7f62ba6a8f30153faf85feabec8',
    }, 'legacy'), /chainId|collection/);
    assert.throws(() => normalizeCukiSourceDocument({
      ...baseLegacy,
      _id: 98_000_002,
      chainId: 56,
      collectionAddressNormalized: '0xd4c7b16db234d7f62ba6a8f30153faf85feabec8',
    }, 'legacy'), /collection/);
  });

  it('incluye el predicado de identidad en la selección de candidatos legacy', () => {
    const filter = sourceCandidateFilter('legacy');
    assert.ok('$and' in filter);
    assert.equal(filter.$and?.length, 2);
    const identity = legacySourceIdentityFilter();
    assert.equal(identity.$or?.length, 2);
  });
});

describe('legacy source guard', () => {
  it('requires explicit staging mode and the unified staging database', () => {
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
        dbName: 'cukies-legacy-staging',
      }),
      /sólo permite/,
    );
  });
});
