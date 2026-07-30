import { createCompetitionConfig } from '@/lib/treasure-hunt-competition';
import {
  buildCompetitionLeaderboardWithRewards,
  type CompetitionLeaderboardAllocationEntry,
  type CompetitionRewardSource,
} from '@/lib/treasure-hunt-competition/server/leaderboard-rewards';
import { TREASURE_HUNT_TOKEN_SCALE } from '@/lib/treasure-hunt-prize-pool';

const PLAYER_A = `0x${'1'.repeat(40)}`;
const PLAYER_B = `0x${'2'.repeat(40)}`;
const PRESALE = `0x${'9'.repeat(40)}`;

const campaign = createCompetitionConfig({
  campaignId: 'preview-campaign',
  rulesVersion: 'preview-v1',
  presaleContractAddress: PRESALE,
  startsAt: '2026-07-01T00:00:00.000Z',
  endsAt: '2026-08-10T23:00:00.000Z',
});

function raw(tokens: number) {
  return (BigInt(tokens) * TREASURE_HUNT_TOKEN_SCALE).toString();
}

function entry(
  attemptId: string,
  rank: number,
  walletAddress: string,
  score: number,
): CompetitionLeaderboardAllocationEntry {
  return {
    attemptId,
    rank,
    walletRank: walletAddress === PLAYER_A ? rank : 1,
    campaignId: campaign.campaignId,
    gameId: campaign.gameId,
    mode: campaign.mode,
    walletAddress,
    playerAlias: walletAddress === PLAYER_A ? 'Alpha' : 'Bravo',
    score,
    gameTimeMs: 30_000,
    startedAt: '2026-07-10T10:00:00.000Z',
    finishedAt: '2026-07-10T10:00:30.000Z',
    status: 'valid',
    reviewStatus: 'approved',
  };
}

class Source implements CompetitionRewardSource {
  listPurchases = jest.fn(async () => [
    {
      eventId: 'purchase-a',
      walletAddress: PLAYER_A,
      asmPurchasedRaw: raw(1_000),
      ukiPurchasedRaw: raw(888_000),
    },
    {
      eventId: 'purchase-b',
      walletAddress: PLAYER_B,
      asmPurchasedRaw: raw(4_000),
      ukiPurchasedRaw: raw(3_552_000),
    },
  ]);
}

describe('Treasure Hunt provisional leaderboard rewards', () => {
  it('allocates 10% per ranked attempt, paginates after global allocation and marks the cut partial', async () => {
    const source = new Source();
    const allocation = {
      campaign,
      entries: [
        entry('a-1', 1, PLAYER_A, 3_000),
        entry('a-2', 2, PLAYER_A, 2_000),
        entry('b-1', 3, PLAYER_B, 1_000),
      ],
    };

    const firstPage = await buildCompetitionLeaderboardWithRewards({
      allocation,
      source,
      page: 1,
      pageSize: 2,
      now: new Date('2026-07-30T12:00:00.000Z'),
    });
    const secondPage = await buildCompetitionLeaderboardWithRewards({
      allocation,
      source,
      page: 2,
      pageSize: 2,
      now: new Date('2026-07-30T12:00:00.000Z'),
    });

    expect(firstPage).toMatchObject({
      poolUkiRaw: raw(333_000),
      playerPoolUkiRaw: raw(266_400),
      allocatedPlayerUkiRaw: raw(266_400),
      remainingPlayerPoolUkiRaw: '0',
      pagination: { page: 1, pageSize: 2, totalEntries: 3, totalPages: 2 },
      entries: [
        {
          attemptId: 'a-1',
          estimatedRewardUkiRaw: raw(88_800),
          rewardStatus: 'estimated',
        },
        {
          attemptId: 'a-2',
          estimatedRewardUkiRaw: raw(88_800),
          rewardStatus: 'estimated',
        },
      ],
    });
    expect(secondPage.entries).toEqual([
      expect.objectContaining({
        attemptId: 'b-1',
        estimatedRewardUkiRaw: raw(88_800),
        rewardStatus: 'partial',
      }),
    ]);
  });

  it('filters personal attempts only after calculating the global reward order', async () => {
    const result = await buildCompetitionLeaderboardWithRewards({
      allocation: {
        campaign,
        entries: [
          entry('a-1', 1, PLAYER_A, 3_000),
          entry('b-1', 2, PLAYER_B, 2_000),
          entry('a-2', 3, PLAYER_A, 1_000),
        ],
      },
      source: new Source(),
      currentWalletAddress: PLAYER_A.toUpperCase(),
      mineOnly: true,
      pageSize: 20,
      now: new Date('2026-07-30T12:00:00.000Z'),
    });

    expect(result.myAttempts).toBe(2);
    expect(result.pagination.totalEntries).toBe(2);
    expect(result.entries.map((item) => item.attemptId)).toEqual(['a-1', 'a-2']);
    expect(JSON.stringify(result.entries)).not.toContain(PLAYER_A);
    expect(JSON.stringify(result.entries)).not.toContain(PLAYER_B);
  });
});
