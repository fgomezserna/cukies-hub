import { act, renderHook, waitFor } from '@testing-library/react';

import { useTreasureHuntCompetitionOverview } from '@/hooks/use-treasure-hunt-competition-overview';

let mockAuthState = { user: null as { id?: string; walletAddress?: string } | null, isLoading: false };

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuthState,
}));

function jsonResponse(value: unknown) {
  return Promise.resolve(new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
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

function statusResponseWithAttempts(attemptsRemaining: number) {
  const response = statusResponse(false);
  return {
    ...response,
    eligibility: {
      ...response.eligibility,
      stakedUkiRaw: attemptsRemaining >= 9
        ? '21999000000000000000000'
        : response.eligibility.stakedUkiRaw,
      totalStakedUkiRaw: attemptsRemaining >= 9
        ? '41999000000000000000000'
        : response.eligibility.totalStakedUkiRaw,
      attemptsGranted: attemptsRemaining + response.eligibility.attemptsUsed,
      attemptsRemaining,
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
  beforeEach(() => {
    mockAuthState = { user: null, isLoading: false };
  });

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

  it('actualiza los cupos al recibir la confirmación de staking', async () => {
    let statusReads = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/games/treasure-hunt/competition') {
        statusReads += 1;
        return jsonResponse(statusResponseWithAttempts(statusReads >= 2 ? 9 : 8));
      }
      return jsonResponse(leaderboardResponse);
    });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionOverview({
      autoRefreshMs: 0,
    }));

    await waitFor(() => expect(result.current.status?.eligibility?.attemptsRemaining).toBe(8));
    act(() => {
      window.dispatchEvent(new Event('cukies:treasure-hunt:competition:refresh'));
    });
    await waitFor(() => expect(result.current.status?.eligibility?.attemptsRemaining).toBe(9));

    expect(statusReads).toBeGreaterThanOrEqual(2);
  });

  it('deduplica dos consumidores de la misma identidad sin compartir respuestas entre wallets', async () => {
    mockAuthState = { user: { id: 'user-a', walletAddress: '0xAa' }, isLoading: false };
    const pendingA = deferred<Response>();
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      if (String(input) === '/api/games/treasure-hunt/competition') return pendingA.promise;
      return jsonResponse(leaderboardResponse);
    });
    global.fetch = fetchMock as typeof fetch;

    const first = renderHook(() => useTreasureHuntCompetitionOverview({
      includeLeaderboard: false,
      autoRefreshMs: 0,
    }));
    const second = renderHook(() => useTreasureHuntCompetitionOverview({
      includeLeaderboard: false,
      autoRefreshMs: 0,
    }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    first.unmount();
    pendingA.resolve(new Response(JSON.stringify(statusResponse(false)), { status: 200 }));
    await waitFor(() => expect(second.result.current.status?.participant?.alias).toBe('CukiePlayer'));
  });

  it('descarta la respuesta de una wallet anterior cuando la identidad cambia durante la petición', async () => {
    mockAuthState = { user: { id: 'user-a', walletAddress: '0xAa' }, isLoading: false };
    const pendingA = deferred<Response>();
    const pendingB = deferred<Response>();
    let statusRequests = 0;
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      if (String(input) !== '/api/games/treasure-hunt/competition') return jsonResponse(leaderboardResponse);
      statusRequests += 1;
      return statusRequests === 1 ? pendingA.promise : pendingB.promise;
    });
    global.fetch = fetchMock as typeof fetch;

    const view = renderHook(() => useTreasureHuntCompetitionOverview({
      includeLeaderboard: false,
      autoRefreshMs: 0,
    }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    mockAuthState = { user: { id: 'user-b', walletAddress: '0xBb' }, isLoading: false };
    view.rerender();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    pendingA.resolve(new Response(JSON.stringify(statusResponse(false)), { status: 200 }));
    await act(async () => undefined);
    expect(view.result.current.status).toBeNull();

    const responseB = statusResponse(false);
    responseB.participant = { ...responseB.participant, alias: 'Wallet B' };
    pendingB.resolve(new Response(JSON.stringify(responseB), { status: 200 }));
    await waitFor(() => expect(view.result.current.status?.participant?.alias).toBe('Wallet B'));
  });

  it('consulta el alias semanal en un scope separado de la competición especial', async () => {
    mockAuthState = { user: { id: 'user-a', walletAddress: '0xAa' }, isLoading: false };
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      expect(String(input)).toBe('/api/games/treasure-hunt/competition?scope=weekly');
      return jsonResponse(statusResponse(false));
    });
    global.fetch = fetchMock as typeof fetch;

    const { result } = renderHook(() => useTreasureHuntCompetitionOverview({
      includeLeaderboard: false,
      participantScope: 'weekly',
      autoRefreshMs: 0,
    }));

    await waitFor(() => expect(result.current.status?.participant?.alias).toBe('CukiePlayer'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
