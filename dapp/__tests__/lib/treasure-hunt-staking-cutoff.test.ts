import type { Db } from 'mongodb';

import { createCompetitionConfig } from '@/lib/treasure-hunt-competition';
import {
  MongoCompetitionStakingSource,
  readTotalStakedAt,
} from '@/lib/treasure-hunt-competition/server/staking-eligibility';

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

  it('mantiene la descalificación histórica aunque la wallet vuelva a depositar', async () => {
    const stakingAddress = `0x${'8'.repeat(40)}`;
    const walletAddress = `0x${'7'.repeat(40)}`;
    const now = new Date('2026-08-28T12:00:00.000Z');
    const campaign = createCompetitionConfig({
      campaignId: 'uki-launch-testnet',
      rulesVersion: '1',
      eligibilityKind: 'uki_staking',
      stakingContractAddress: stakingAddress,
      stakingChainId: 97,
      startsAt: '2026-08-27T12:00:00.000Z',
      endsAt: '2026-09-15T15:00:00.000Z',
    });
    const cursor = (eventName: 'Staked' | 'Unstaked') => ({
      eventName,
      bootstrapStatus: 'verified',
      verifiedChainId: 97,
      safeBlock: 123_456_800,
      contractAddress: stakingAddress,
    });
    const chainEventsFindOne = jest.fn(async (filter: Record<string, unknown>) => (
      filter.eventName === 'Unstaked'
        ? {
          _id: 'unstake-during-campaign',
          txHash: `0x${'a'.repeat(64)}`,
          blockNumber: 123_456_700,
          timestampMs: new Date('2026-08-27T15:00:00.000Z').getTime(),
          normalized: { amountRaw: '1' },
        }
        : null
    ));
    const db = {
      collection: jest.fn((name: string) => {
        if (name === 'uki_staking_positions') return {
          findOne: jest.fn(async () => ({ accountBalanceRaw: '26000000000000000000000' })),
        };
        if (name === 'uki_staking_state') return {
          findOne: jest.fn(async () => ({
            bootstrapStatus: 'verified',
            verifiedChainId: 97,
            materializationStatus: 'consistent',
            totalStakedRaw: '46000000000000000000000',
          })),
        };
        if (name === 'chain_cursors') return {
          find: jest.fn(() => ({
            limit: jest.fn(() => ({
              toArray: jest.fn(async () => [cursor('Staked'), cursor('Unstaked')]),
            })),
          })),
        };
        if (name === 'chain_bsc_checkpoints') return {
          findOne: jest.fn(async () => ({ checkedAt: now, safeBlockNumber: 123_456_800 })),
        };
        if (name === 'chain_events') return { findOne: chainEventsFindOne };
        return { findOne: jest.fn(async () => null) };
      }),
    } as unknown as Db;
    const source = new MongoCompetitionStakingSource(async () => db, {}, 60_000);

    await expect(source.getSnapshot({ campaign, walletAddress, now })).resolves.toMatchObject({
      ready: true,
      stakedUkiRaw: '26000000000000000000000',
      disqualified: true,
      disqualificationEvidence: {
        eventId: 'unstake-during-campaign',
        amountRaw: '1',
      },
    });
    expect(chainEventsFindOne).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'Unstaked',
        timestampMs: {
          $gte: Date.parse(campaign.startsAt),
          $lte: now.getTime(),
        },
      }),
      expect.any(Object),
    );
  });
});
