import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveLegacyTypeId } from './store.js';

describe('deriveLegacyTypeId', () => {
  it('recovers the type slot from the deployed mainnet token ids', () => {
    assert.equal(deriveLegacyTypeId('1000000002279'), 1n);
    assert.equal(deriveLegacyTypeId('3000000013013'), 3n);
  });

  it('does not confuse a non-zero chain prefix with the type id', () => {
    assert.equal(deriveLegacyTypeId('205000000002279'), 5n);
  });

  it('rejects a token id without a legacy type slot', () => {
    assert.throws(
      () => deriveLegacyTypeId('7000000002279'),
      /typeId legacy no derivable/,
    );
  });
});
