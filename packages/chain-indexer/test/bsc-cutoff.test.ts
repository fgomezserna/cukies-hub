import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { findGreatestBscBlockBeforeTimestamp } from '../src/chains/bsc.js';

const hash = (number: number) => `0x${number.toString(16).padStart(64, '0')}` as `0x${string}`;

describe('canonical BSC cutoff block', () => {
  it('returns the greatest contiguous block whose timestamp is strictly before cutoff', async () => {
    const result = await findGreatestBscBlockBeforeTimestamp({
      cutoffTimestampMs: 25_000,
      safeBlockNumber: 9,
      getBlock: async (number) => ({
        number: BigInt(number),
        hash: hash(number),
        timestamp: BigInt(number * 10),
      }),
    });
    assert.equal(result.blockNumber, 2);
    assert.equal(result.blockTimestamp.getTime(), 20_000);
    assert.equal(result.successorBlockNumber, 3);
    assert.equal(result.successorBlockTimestamp.getTime(), 30_000);
  });

  it('fails closed when the confirmed head has not reached cutoff', async () => {
    await assert.rejects(
      findGreatestBscBlockBeforeTimestamp({
        cutoffTimestampMs: 100_000,
        safeBlockNumber: 5,
        getBlock: async (number) => ({
          number: BigInt(number),
          hash: hash(number),
          timestamp: BigInt(number * 10),
        }),
      }),
      /aun no cubre el cutoff/,
    );
  });
});
