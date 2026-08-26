import type { Db } from 'mongodb';

import { readTotalStakedAt } from '@/lib/treasure-hunt-competition/server/staking-eligibility';

jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

describe('Treasure Hunt staking cutoff source', () => {
  it('reads the last projected staking total at the campaign boundary, not live state', async () => {
    const findOne = jest.fn(async () => ({
      _id: 'event-at-close',
      blockNumber: 123_456_789,
      blockHash: `0x${'a'.repeat(64)}`,
      normalized: { totalStakedRaw: '100000000000000000000000' },
    }));
    const db = {
      collection: jest.fn(() => ({ findOne })),
    } as unknown as Db;
    const through = new Date('2026-09-15T15:00:00.000Z');

    await expect(readTotalStakedAt({
      db,
      stakingContractAddress: `0x${'8'.repeat(40)}`,
      stakingChainId: 97,
      through,
    })).resolves.toEqual({
      totalStakedUkiRaw: '100000000000000000000000',
      sourceBlock: 123_456_789,
      sourceBlockHash: `0x${'a'.repeat(64)}`,
      sourceEventId: 'event-at-close',
    });
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 97,
        status: 'projected',
        timestampMs: { $lte: through.getTime() },
      }),
      expect.objectContaining({
        sort: { blockNumber: -1, logIndex: -1, _id: -1 },
      }),
    );
  });
});
