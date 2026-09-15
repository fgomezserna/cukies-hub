import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGACY_INDEX_DEFINITIONS } from './mongo.js';

test('el indice unico del cursor legacy convive con el indice historico no unico', () => {
  const cursorIndex = LEGACY_INDEX_DEFINITIONS.find(({ collection, index }) => (
    collection === 'chain_cursors'
    && JSON.stringify(index) === JSON.stringify({ chain: 1, contractAlias: 1, eventName: 1 })
  ));

  assert.deepEqual(cursorIndex?.options, {
    unique: true,
    name: 'legacy_chain_cursor_identity_unique',
  });
});
