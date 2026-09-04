import test from 'node:test';
import assert from 'node:assert/strict';
import { resetTargets, RESET_COLLECTIONS, validateResetCalendar } from './reset-staging-economy.mjs';

test('reset is an explicit economic-only allowlist and pool projection filters are address scoped', () => {
  const address = '0x1111111111111111111111111111111111111111';
  const targets = resetTargets(address);
  assert.equal(new Set(RESET_COLLECTIONS).size, RESET_COLLECTIONS.length);
  for (const protectedCollection of ['User', 'users', 'ambassador_profiles', 'ambassador_attributions',
    'presale_participants', 'cukie_master_slots', 'cukie_master_nft_positions', 'chain_events',
    'nft_asset_locks', 'uki_staking_positions', 'uki_vesting_positions', 'economy_internal_nonces']) {
    assert.equal(targets.some((target) => target.collection === protectedCollection), false);
  }
  const cursor = targets.find((target) => target.collection === 'chain_cursors');
  assert.deepEqual(cursor.filter, { chain: 'BSC', contractAlias: 'CUKIE_POOL_NFT_VAULT', contractAddress: { $regex: `^${address}$`, $options: 'i' } });
  assert.throws(() => resetTargets(''), /exact/);
  assert.throws(() => resetTargets('0x' + '0'.repeat(40)), /exact/);
});

test('rejects malformed, unaligned and elapsed anchors before any reset', () => {
  const now = new Date('2026-09-04T09:00:00.000Z');
  const environment = { ECONOMY_CYCLE_SECONDS: '1800', ECONOMY_CYCLE_ANCHOR_AT: '2026-09-04T10:00:00.000Z' };
  assert.equal(validateResetCalendar(environment, now), environment.ECONOMY_CYCLE_ANCHOR_AT);
  for (const anchor of ['', 'typo', '2026-09-04T10:01:00.000Z', '2026-09-04T09:00:00.000Z']) {
    assert.throws(() => validateResetCalendar({ ...environment, ECONOMY_CYCLE_ANCHOR_AT: anchor }, now));
  }
});
