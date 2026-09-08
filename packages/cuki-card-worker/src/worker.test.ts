import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCardImageLeaseFilter } from './storage/mongo.js';
import {
  backfillItemNeedsResume,
  backfillRunStatus,
  canonicalAssetIdentity,
  classifyCukiMetadata,
} from './worker.js';
import type { CardImageLease, CukiDocument } from './types.js';

const baseCuki: CukiDocument = {
  _id: 'mongo-document-1',
  tokenId: '42',
  network: 'BSC',
  chainId: 97,
  collectionAddressNormalized: '0xabc',
  rarity: 3,
  generation: 2,
};

describe('backfill census and identity', () => {
  it('does not silently drop missing or unsupported metadata', () => {
    assert.equal(classifyCukiMetadata(baseCuki), 'renderable');
    assert.equal(classifyCukiMetadata({ ...baseCuki, generation: undefined }), 'missing_metadata');
    assert.equal(classifyCukiMetadata({ ...baseCuki, rarity: 7 }), 'unsupported_metadata');
    assert.equal(classifyCukiMetadata({ ...baseCuki, skills: { generation: 0 } }), 'unsupported_metadata');
  });

  it('keeps document id, visible token id and canonical identity distinct', () => {
    assert.equal(canonicalAssetIdentity(baseCuki), 'bsc:0xabc:42');
    assert.equal(canonicalAssetIdentity({ ...baseCuki, _id: 'other-document', tokenId: '42' }), 'bsc:0xabc:42');
    assert.equal(canonicalAssetIdentity({ ...baseCuki, collectionAddressNormalized: undefined }), 'document:mongo-document-1');
  });
});

describe('card image lease fencing', () => {
  it('requires the current owner, version and source revision to finalize', () => {
    const lease: CardImageLease = {
      lockId: 'lease-a',
      leaseVersion: 4,
      claimedAt: new Date('2026-09-08T15:00:00.000Z'),
      sourceRevision: new Date('2026-09-08T14:59:00.000Z'),
    };
    const filter = buildCardImageLeaseFilter('doc-1', lease);

    assert.deepEqual(filter, {
      _id: 'doc-1',
      cardImageStatus: 'processing',
      cardImageLockId: 'lease-a',
      cardImageLeaseVersion: 4,
      updatedAt: lease.claimedAt,
      cardImageLeaseSourceRevision: lease.sourceRevision,
    });
    assert.notDeepEqual(filter, buildCardImageLeaseFilter('doc-1', { ...lease, lockId: 'lease-b' }));
    assert.notDeepEqual(filter, buildCardImageLeaseFilter('doc-1', { ...lease, leaseVersion: 5 }));
  });
});

describe('durable backfill checkpoints', () => {
  it('resumes interrupted and failed candidates without treating them as complete', () => {
    assert.equal(backfillItemNeedsResume({ status: 'interrupted' }), true);
    assert.equal(backfillItemNeedsResume({ status: 'locked_or_exhausted' }), true);
    assert.equal(backfillItemNeedsResume({ status: 'failed' }), true);
    assert.equal(backfillRunStatus([{ status: 'generated' }, { status: 'already_valid' }]), 'complete');
    assert.equal(backfillRunStatus([{ status: 'generated' }, { status: 'failed' }]), 'incomplete');
  });

  it('keeps a partial failure isolated from successful candidates', () => {
    const statuses = [{ status: 'generated' as const }, { status: 'failed' as const }, { status: 'already_valid' as const }];
    assert.equal(backfillRunStatus(statuses), 'incomplete');
    assert.equal(statuses[0]?.status, 'generated');
    assert.equal(statuses[2]?.status, 'already_valid');
  });
});
