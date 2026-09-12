import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDomainEvent } from './normalize.js';

describe('UKIStaking normalization', () => {
  it('normalizes bounded Cukie metadata while preserving its raw evidence', () => {
    const normalized = normalizeDomainEvent(
      'BSC',
      'CukieMetadataConfigured',
      'TOKEN',
      { tokenId: 42n, rarity: 6n, generation: 2n },
    );
    assert.equal(normalized.tokenId, '42');
    assert.equal(normalized.rarity, 6);
    assert.equal(normalized.rarityRaw, '6');
    assert.equal(normalized.generation, 2);
    assert.equal(normalized.generationRaw, '2');
    assert.equal(normalized.txType, 'CukieMetadataConfigured');
  });

  it('preserves every uint256 as an exact raw decimal string', () => {
    const normalized = normalizeDomainEvent('BSC', 'Staked', 'UKI_STAKING', {
      account: '0x00000000000000000000000000000000000000AA',
      amount: 20_000_000_000_000_000_000_001n,
      accountBalance: 40_000_000_000_000_000_000_003n,
      totalStaked: 900_000_000_000_000_000_000_007n,
    });

    assert.equal(normalized.accountNormalized, '0x00000000000000000000000000000000000000aa');
    assert.equal(normalized.amountRaw, '20000000000000000000001');
    assert.equal(normalized.accountBalanceRaw, '40000000000000000000003');
    assert.equal(normalized.totalStakedRaw, '900000000000000000000007');
  });

  it('normalizes VestingVault beneficiary, schedule and exact raw fields', () => {
    const normalized = normalizeDomainEvent('BSC', 'VestingCreated', 'VESTING_VAULT', {
      beneficiary: '0x00000000000000000000000000000000000000AA',
      scheduleId: '0xABCDEF',
      amount: 123456789012345678901234567890n,
      start: 10n,
      cliff: 20n,
      duration: 30n,
    });
    assert.equal(normalized.beneficiaryNormalized, '0x00000000000000000000000000000000000000aa');
    assert.equal(normalized.scheduleId, '0xabcdef');
    assert.equal(normalized.amountRaw, '123456789012345678901234567890');
    assert.equal(normalized.durationRaw, '30');
  });

  it('normalizes RewardsDistributor hashes, wallets and uints without precision loss', () => {
    const published = normalizeDomainEvent(
      'BSC',
      'BatchPublished',
      'REWARDS_DISTRIBUTOR',
      {
        batchId: `0x${'A'.repeat(64)}`,
        merkleRoot: `0x${'B'.repeat(64)}`,
        inputHash: `0x${'C'.repeat(64)}`,
        metadataHash: `0x${'D'.repeat(64)}`,
        totalAllocated: 123456789012345678901234567890n,
        startsAt: 10n,
        expiresAt: 20n,
      },
    );
    assert.equal(published.batchId, `0x${'a'.repeat(64)}`);
    assert.equal(published.inputHash, `0x${'c'.repeat(64)}`);
    assert.equal(published.totalAllocatedRaw, '123456789012345678901234567890');
    assert.equal(published.expiresAtRaw, '20');

    const claimed = normalizeDomainEvent(
      'BSC',
      'RewardClaimed',
      'REWARDS_DISTRIBUTOR',
      {
        batchId: `0x${'A'.repeat(64)}`,
        account: '0x00000000000000000000000000000000000000AA',
        amount: 999999999999999999999999999999n,
      },
    );
    assert.equal(claimed.accountNormalized, '0x00000000000000000000000000000000000000aa');
    assert.equal(claimed.amountRaw, '999999999999999999999999999999');
  });

  it('normalizes homonymous NFT vault events without losing alias-specific fields', () => {
    const collection = '0x00000000000000000000000000000000000000CC';
    const beneficiary = '0x00000000000000000000000000000000000000AA';
    const master = normalizeDomainEvent(
      'BSC',
      'CukieMasterDeposited',
      'CUKIE_MASTER_NFT_VAULT',
      {
        collection,
        tokenId: 123456789012345678901234567890n,
        beneficiary,
        depositEpoch: 7n,
        depositedAt: 1786800000n,
      },
    );
    assert.equal(master.collectionNormalized, collection.toLowerCase());
    assert.equal(master.beneficiaryNormalized, beneficiary.toLowerCase());
    assert.equal(master.tokenId, '123456789012345678901234567890');
    assert.equal(master.depositEpochRaw, '7');
    assert.equal(master.lifecycle, 'custodied');

    const pool = normalizeDomainEvent(
      'BSC',
      'CukiePoolDeposited',
      'CUKIE_POOL_NFT_VAULT',
      {
        collection,
        tokenId: 2n,
        beneficiary,
        depositEpoch: 9n,
        depositedAt: 100n,
        depositPeriodId: 40n,
        activationAt: 200n,
        activationPeriodId: 41n,
        calendarVersion: 3n,
      },
    );
    assert.equal(pool.activationAtRaw, '200');
    assert.equal(pool.activationPeriodIdRaw, '41');
    assert.equal(pool.calendarVersionRaw, '3');
    assert.equal(pool.lifecycle, 'pending_activation');
  });
});
