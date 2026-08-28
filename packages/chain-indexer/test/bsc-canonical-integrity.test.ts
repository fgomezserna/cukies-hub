import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  assertBscCanonicalCheckpoint,
  validateBscCanonicalRange,
} from '../src/chains/bsc.js';

function incidentStore(writes: unknown[]) {
  return {
    db: {
      collection() {
        return {
          async updateOne(...args: unknown[]) {
            writes.push(args);
          },
        };
      },
    },
  };
}

describe('BSC canonical integrity guards', () => {
  it('accepts the persisted checkpoint when its hash is still canonical', async () => {
    const writes: unknown[] = [];
    await assertBscCanonicalCheckpoint(incidentStore(writes) as never, {
      _id: 'canonical-safe',
      safeBlockNumber: 123,
      safeBlockHash: '0xaaa',
    }, '0xAAA');
    assert.deepEqual(writes, []);
  });

  it('opens an integrity incident and aborts on a safe-block hash mismatch', async () => {
    const writes: unknown[] = [];

    await assert.rejects(
      () => assertBscCanonicalCheckpoint(incidentStore(writes) as never, {
        _id: 'canonical-safe',
        safeBlockNumber: 123,
        safeBlockHash: '0xaaa',
      }, '0xbbb'),
      /Reorg BSC detectado/,
    );
    assert.equal(writes.length, 1);
    const update = (writes[0] as Array<Record<string, unknown>>)[1];
    assert.equal((update.$set as Record<string, unknown>).status, 'open');
    assert.equal(
      (update.$set as Record<string, unknown>).type,
      'canonical_checkpoint_mismatch',
    );
  });

  it('opens an incident when the canonical range differs from the ingested logs', async () => {
    const writes: unknown[] = [];
    await assert.rejects(
      () => validateBscCanonicalRange(
        incidentStore(writes) as never,
        [{ blockNumber: 200, blockHash: '0xbefore' }],
        async () => '0xafter',
      ),
      /durante la ingesta/,
    );
    const update = (writes[0] as Array<Record<string, unknown>>)[1];
    assert.equal((update.$set as Record<string, unknown>).status, 'open');
    assert.equal((update.$set as Record<string, unknown>).type, 'canonical_range_mismatch');
  });
});
