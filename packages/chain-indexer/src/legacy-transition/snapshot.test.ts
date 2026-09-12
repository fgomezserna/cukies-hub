import assert from 'node:assert/strict';
import test from 'node:test';
import { TronWeb } from 'tronweb';

import { MAX_UINT256 } from './canonical.js';
import { buildLegacySnapshot, normalizeLegacyAddress } from './snapshot.js';
import {
  BSC_USER,
  BSC_USER_2,
  TRON_USER,
  TRON_USER_2,
  emptySnapshotInput,
  testCoverage,
  testObservation,
} from './test-fixtures.js';

test('deduplicates exact canonical records with precise raw source bindings', () => {
  const huge = '900719925474099312345678901234567890';
  const coverage = testCoverage({ BSC: { wallets: 1, observed: 1, claimedRaw: huge, pendingRaw: '9' } });
  const observation = testObservation({
    network: 'BSC', wallet: BSC_USER, claimedRaw: huge, pendingRaw: '9',
    tokenIds: ['10', '2'], coverage,
  });
  const input = {
    coverage,
    discoveries: [
      { network: 'BSC' as const, wallet: BSC_USER.toUpperCase(), userId: 'user-1', source: 'bsc-wallets' },
      { network: 'BSC' as const, wallet: BSC_USER, userId: 'user-1', source: 'bsc-wallets' },
    ],
    observations: [observation, { ...observation, tokenIds: ['2', '10'] }],
  };
  const first = buildLegacySnapshot(input);
  const second = buildLegacySnapshot({
    coverage: [...coverage].reverse(),
    discoveries: [...input.discoveries].reverse(),
    observations: [...input.observations].reverse(),
  });
  assert.deepEqual(first, second);
  assert.equal(first.complete, true);
  assert.equal(first.cutoverAuthorized, false);
  assert.match(first.integritySha256, /^[0-9a-f]{64}$/);
  assert.equal(first.wallets[0]?.claimedRaw, huge);
  assert.deepEqual(first.wallets[0]?.tokenIds, ['2', '10']);
  assert.equal(first.wallets[0]?.claimedSourceId, 'bsc-claimed');
  assert.equal(first.wallets[0]?.pendingSourceId, 'bsc-pending');
  assert.ok(first.wallets[0]?.claimedSourceBalanceId);
  assert.ok(first.wallets[0]?.pendingSourceBalanceId);
  assert.ok(first.wallets[0]?.claimedSourceRowSha256);
  assert.ok(first.wallets[0]?.pendingSourceRowSha256);
});

test('requires complete hashed BSC/TRON coverage and exact source aggregates', () => {
  assert.throws(() => buildLegacySnapshot({
    coverage: testCoverage().slice(0, 1), discoveries: [], observations: [],
  } as never), /input limit exceeded/);

  const malformed = testCoverage();
  malformed[1] = {
    ...malformed[1],
    pending: { ...malformed[1].pending, complete: false, querySha256: 'bad' },
  };
  const result = buildLegacySnapshot({ coverage: malformed, discoveries: [], observations: [] });
  assert.equal(result.complete, false);
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_COVERAGE_SOURCE'));
  assert.ok(result.issues.some((issue) => issue.code === 'INCOMPLETE_NETWORK_COVERAGE'));
});

test('accepts zero-wallet only with zero counts and totals', () => {
  assert.equal(buildLegacySnapshot(emptySnapshotInput()).complete, true);
  const invalid = buildLegacySnapshot({
    coverage: testCoverage({ TRON: { wallets: 1, claimedRaw: '1' } }),
    discoveries: [], observations: [],
  });
  assert.ok(invalid.issues.some((issue) => issue.code === 'COVERAGE_MISMATCH'));
});

test('TRON hex and Base58 normalize to one canonical wallet while zero addresses are rejected', () => {
  const tronHex = TronWeb.address.toHex(TRON_USER);
  const coverage = testCoverage({ TRON: { wallets: 1, observed: 1, claimedRaw: '3', pendingRaw: '2' } });
  const result = buildLegacySnapshot({
    coverage,
    discoveries: [{ network: 'TRON', wallet: tronHex, userId: 'tron-user', source: 'tron-wallets' }],
    observations: [testObservation({
      network: 'TRON', wallet: TRON_USER, claimedRaw: '3', pendingRaw: '2', coverage,
    })],
  });
  assert.equal(result.complete, true);
  assert.equal(result.wallets[0]?.wallet, TRON_USER);
  assert.equal(normalizeLegacyAddress('TRON', TronWeb.address.toHex('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb')), null);
  assert.equal(normalizeLegacyAddress('TRON', 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'), null);
  assert.equal(normalizeLegacyAddress('BSC', '0x0000000000000000000000000000000000000000'), null);
});

test('wallet discoveries must use the covered wallet source id', () => {
  const coverage = testCoverage({ BSC: { wallets: 0, observed: 1, claimedRaw: '1' } });
  const result = buildLegacySnapshot({
    coverage,
    discoveries: [{ network: 'BSC', wallet: BSC_USER, userId: 'u', source: 'wrong-source' }],
    observations: [testObservation({
      network: 'BSC', wallet: BSC_USER, claimedRaw: '1', pendingRaw: '0', coverage,
    })],
  });
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_SOURCE_BINDING'));
});

test('distinct observations are never summed and source balances cannot be reused across wallets', () => {
  const conflictCoverage = testCoverage({ BSC: { wallets: 1, observed: 1 } });
  const first = testObservation({
    network: 'BSC', wallet: BSC_USER, claimedRaw: '0', pendingRaw: '0',
    snapshotId: 'first', coverage: conflictCoverage,
  });
  const conflict = buildLegacySnapshot({
    coverage: conflictCoverage,
    discoveries: [{ network: 'BSC', wallet: BSC_USER, userId: 'u', source: 'bsc-wallets' }],
    observations: [first, { ...first, snapshotId: 'second' }],
  });
  assert.ok(conflict.issues.some((issue) => issue.code === 'CONFLICTING_OBSERVATION'));
  assert.equal(conflict.totals.BSC.totalRaw, '0');

  const duplicateCoverage = testCoverage({ BSC: { wallets: 2, observed: 2, claimedRaw: '10' } });
  const duplicated = buildLegacySnapshot({
    coverage: duplicateCoverage,
    discoveries: [
      { network: 'BSC', wallet: BSC_USER, userId: 'a', source: 'bsc-wallets' },
      { network: 'BSC', wallet: BSC_USER_2, userId: 'b', source: 'bsc-wallets' },
    ],
    observations: [
      testObservation({ network: 'BSC', wallet: BSC_USER, claimedRaw: '10', pendingRaw: '0', balanceSuffix: 'same', coverage: duplicateCoverage }),
      testObservation({ network: 'BSC', wallet: BSC_USER_2, claimedRaw: '10', pendingRaw: '0', balanceSuffix: 'same', coverage: duplicateCoverage }),
    ],
  });
  assert.ok(duplicated.issues.some((issue) => issue.code === 'DUPLICATE_SOURCE_BALANCE'));
  assert.equal(duplicated.totals.BSC.claimedRaw, '10');
});

test('row hashes detect wallet-to-wallet swaps even when ids and amounts look valid', () => {
  const coverage = testCoverage({ BSC: { wallets: 2, observed: 2, claimedRaw: '30' } });
  const a = testObservation({ network: 'BSC', wallet: BSC_USER, claimedRaw: '10', pendingRaw: '0', coverage });
  const b = testObservation({ network: 'BSC', wallet: BSC_USER_2, claimedRaw: '20', pendingRaw: '0', coverage });
  const swapped = buildLegacySnapshot({
    coverage,
    discoveries: [
      { network: 'BSC', wallet: BSC_USER, userId: 'a', source: 'bsc-wallets' },
      { network: 'BSC', wallet: BSC_USER_2, userId: 'b', source: 'bsc-wallets' },
    ],
    observations: [
      { ...a, claimedSourceBalanceId: b.claimedSourceBalanceId, claimedSourceRowSha256: b.claimedSourceRowSha256 },
      { ...b, claimedSourceBalanceId: a.claimedSourceBalanceId, claimedSourceRowSha256: a.claimedSourceRowSha256 },
    ],
  });
  assert.ok(swapped.issues.some((issue) => issue.code === 'INVALID_SOURCE_BINDING'));
  assert.equal(swapped.totals.BSC.claimedRaw, '0');
});

test('rejects per-wallet and global uint256 overflow', () => {
  const max = MAX_UINT256.toString();
  const coverage = testCoverage({ BSC: { wallets: 1, observed: 1, claimedRaw: max, pendingRaw: '1' } });
  const perWallet = buildLegacySnapshot({
    coverage,
    discoveries: [{ network: 'BSC', wallet: BSC_USER, userId: 'u', source: 'bsc-wallets' }],
    observations: [testObservation({ network: 'BSC', wallet: BSC_USER, claimedRaw: max, pendingRaw: '1', coverage })],
  });
  assert.equal(perWallet.complete, false);

  const globalCoverage = testCoverage({ BSC: { wallets: 2, observed: 2, claimedRaw: max } });
  assert.throws(() => buildLegacySnapshot({
    coverage: globalCoverage,
    discoveries: [
      { network: 'BSC', wallet: BSC_USER, userId: 'a', source: 'bsc-wallets' },
      { network: 'BSC', wallet: BSC_USER_2, userId: 'b', source: 'bsc-wallets' },
    ],
    observations: [
      testObservation({ network: 'BSC', wallet: BSC_USER, claimedRaw: max, pendingRaw: '0', coverage: globalCoverage }),
      testObservation({ network: 'BSC', wallet: BSC_USER_2, claimedRaw: '1', pendingRaw: '0', coverage: globalCoverage }),
    ],
  }), /aggregate exceeds uint256/);
});

test('runtime guards reject unknown networks and excessive token input', () => {
  assert.throws(() => buildLegacySnapshot({
    coverage: testCoverage(),
    discoveries: [{ network: 'ETH', wallet: BSC_USER, source: 'bsc-wallets' }],
    observations: [],
  } as never), /invalid runtime values/);
  assert.throws(() => buildLegacySnapshot({
    coverage: testCoverage(), discoveries: [],
    observations: [{
      network: 'BSC', wallet: BSC_USER, snapshotId: 'x',
      tokenIds: Array.from({ length: 1_001 }, () => '1'),
    }],
  }), /token input limit exceeded/);
  assert.throws(() => buildLegacySnapshot({
    coverage: testCoverage(), discoveries: [],
    observations: [{ network: 'BSC', wallet: BSC_USER, snapshotId: 'x', claimedRaw: 1 }],
  } as never), /invalid runtime values/);
  assert.throws(() => buildLegacySnapshot({
    coverage: testCoverage(), discoveries: [], observations: [], errors: [null],
  } as never), /invalid runtime values/);
});

test('machine identifiers reject zero-width, bidi and Unicode homoglyph characters', () => {
  for (const source of ['bsc-wallets\u200b', 'bsc-wallets\u202e', 'bsc-wаllets']) {
    const result = buildLegacySnapshot({
      coverage: testCoverage(),
      discoveries: [{ network: 'BSC', wallet: BSC_USER, userId: 'u', source }],
      observations: [],
    });
    assert.equal(result.complete, false);
    assert.ok(result.issues.some((issue) => issue.code === 'INVALID_WALLET'));
  }
  const result = buildLegacySnapshot({
    coverage: testCoverage({ BSC: { observed: 1 } }), discoveries: [],
    observations: [{
      network: 'BSC', wallet: BSC_USER, snapshotId: 'snapshot\u200b',
      claimedRaw: '0', pendingRaw: '0',
    }],
  });
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_WALLET'));
});

test('external error codes are allowlisted or hashed without retaining attacker text', () => {
  const coverage = testCoverage({ TRON: { wallets: 1, observed: 1 } });
  const result = buildLegacySnapshot({
    coverage,
    discoveries: [{ network: 'TRON', wallet: TRON_USER_2, userId: 'u', source: 'tron-wallets' }],
    observations: [{
      network: 'TRON', wallet: TRON_USER_2, snapshotId: 'final',
      error: {
        code: ['mongodb://', 'user:password', '@host/database'].join(''),
        message: 'sensitive details',
      },
    }],
  });
  const serialized = JSON.stringify(result.issues);
  assert.doesNotMatch(serialized, /mongodb|user|password|host|sensitive/);
  assert.match(serialized, /EXTERNAL_[0-9a-f]{12}/);
});
