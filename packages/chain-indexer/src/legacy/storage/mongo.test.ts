import assert from 'node:assert/strict';
import test from 'node:test';

import { LEGACY_INDEX_DEFINITIONS } from './mongo.js';

test('el indice unico del cursor legacy convive con el indice historico no unico', () => {
  const cursorIndex = LEGACY_INDEX_DEFINITIONS.find(({ collection, index }) => (
    collection === 'chain_cursors'
    && JSON.stringify(index) === JSON.stringify({ runtimeScope: 1, chain: 1, contractAlias: 1, eventName: 1 })
  ));

  assert.deepEqual(cursorIndex?.options, {
    unique: true,
    name: 'legacy_runtime_chain_cursor_identity_unique',
  });
});

test('el indice de balances legacy excluye documentos historicos sin identidad canonica', () => {
  const pointBalanceIndex = LEGACY_INDEX_DEFINITIONS.find(({ collection, index }) => (
    collection === 'point_balances'
    && JSON.stringify(index) === JSON.stringify({
      chain: 1,
      pointsContractAddressNormalized: 1,
      walletNormalized: 1,
    })
  ));

  assert.deepEqual(pointBalanceIndex?.options, {
    unique: true,
    name: 'legacy_point_balance_identity',
    partialFilterExpression: {
      chain: { $type: 'string' },
      pointsContractAddressNormalized: { $type: 'string' },
      walletNormalized: { $type: 'string' },
    },
  });
});
