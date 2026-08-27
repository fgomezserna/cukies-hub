import { act, renderHook, waitFor } from '@testing-library/react';

import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';

function jsonResponse(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function statusResponse(disqualified: boolean) {
  return {
    success: true,
    configured: true,
    enabled: true,
    phase: 'active',
    campaign: {
      campaignId: 'uki-staking-testnet-2026-08',
      eligibilityKind: 'uki_staking',
      startsAt: '2026-08-26T00:00:00.000Z',
      endsAt: '2026-09-15T15:00:00.000Z',
      stakePerAttemptRaw: '2000000000000000000000',
      topAttemptsPerWallet: 10,
      pointsPerTicket: 100,
      basePrizeUkiRaw: '50000000000000000000000',
      stakePrizeBps: 1_000,
      prizePerWinnerUkiRaw: '10000000000000000000000',
      maxWinsPerWallet: 1,
      poolBps: 2_500,
      playerRewardBps: 1_000,
      sponsorRewardBps: 2_500,
      maxWinningAttemptsPerWallet: 10,
      cliffMonths: 9,
      vestingMonths: 6,
    },
    participant: { alias: 'CukiePlayer', canonicalAlias: 'cukieplayer', aliasChangedAt: null, createdAt: '2026-08-26T12:00:00.000Z' },
    eligibility: {
      ready: true,
      stakedUkiRaw: disqualified ? '0' : '19999000000000000000000',
      totalStakedUkiRaw: disqualified ? '20000000000000000000000' : '39999000000000000000000',
      indexedThroughBlock: 127_368_828,
      indexedAt: '2026-08-26T16:40:34.657Z',
      disqualified,
      disqualificationEvidence: disqualified ? {
        eventId: 'unstake-1',
        txHash: `0x${'a'.repeat(64)}`,
        blockNumber: 127_368_347,
        timestamp: '2026-08-26T16:36:42.000Z',
        amountRaw: '20000000000000000000000',
      } : null,
      issues: [],
      attemptsGranted: disqualified ? 0 : 9,
      attemptsUsed: 1,
      attemptsRemaining: disqualified ? 0 : 8,
      topAttemptsCount: 1,
      totalTickets: disqualified ? 0 : 125,
      provisionalTickets: disqualified ? 0 : 125,
    },
  };
}

const leaderboardResponse = {
  success: true,
  campaignId: 'uki-staking-testnet-2026-08',
  calculatedAt: '2026-08-26T16:40:34.657Z',
  poolUkiRaw: '52000000000000000000000',
  playerPoolUkiRaw: '52000000000000000000000',
  allocatedPlayerUkiRaw: '0',
  remainingPlayerPoolUkiRaw: '52000000000000000000000',
  totalRankedEntries: 0,
  myAttempts: 0,
  pagination: { page: 1, pageSize: 100, totalEntries: 0, totalPages: 0 },
  entries: [],
};

describe('useTreasureHuntCompetitionOverview', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refresca el staking al volver a la pestaña y hace visible una descalificación confirmada', async () => {
    let statusReads = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/games/treasure-hunt/competition') {
        statusReads += 1;
        return jsonResponse(statusResponse(statusReads >= 2));
      }
      return jsonResponse(leaderboardResponse);
    });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionOverview({
      autoRefreshMs: 0,
    }));

    await waitFor(() => expect(result.current.status?.eligibility?.disqualified).toBe(false));
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(result.current.status?.eligibility?.disqualified).toBe(true));

    expect(result.current.status?.eligibility?.attemptsRemaining).toBe(0);
    expect(statusReads).toBeGreaterThanOrEqual(2);
  });

  it('actualiza en segundo plano aunque la pestaña permanezca abierta', async () => {
    let disqualified = false;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/games/treasure-hunt/competition') {
        return jsonResponse(statusResponse(disqualified));
      }
      return jsonResponse(leaderboardResponse);
    });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionOverview({
      autoRefreshMs: 25,
    }));

    await waitFor(() => expect(result.current.status?.eligibility?.disqualified).toBe(false));
    disqualified = true;
    await waitFor(() => expect(result.current.status?.eligibility?.disqualified).toBe(true));

    expect(result.current.isLoading).toBe(false);
  });
});
