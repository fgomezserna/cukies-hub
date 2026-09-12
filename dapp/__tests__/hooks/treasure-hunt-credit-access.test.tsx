import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';

import { useTreasureHuntCreditAccess } from '@/hooks/use-treasure-hunt-credit-access';

const WALLET = '0x1111111111111111111111111111111111111111';

let mockAuthState = {
  user: { walletAddress: WALLET },
  isLoading: false,
};

jest.mock('@/providers/auth-provider', () => ({
  useAuth: () => mockAuthState,
}));

function statusResponse(
  materialization = { balance: 'ready', pool: 'ready' },
  overrides: Partial<{
    balanceBlocked: boolean;
    balanceAvailableCredits: number;
    poolAvailableCredits: number;
  }> = {},
  ownCukie?: {
    status: 'ready' | 'partial' | 'unknown';
    periodId: string | null;
    periodStartsAt: string | null;
    periodEndsAt: string | null;
    totalGamesRemaining: number | null;
    eligibleCukies: number | null;
    unknownCukies: number;
  },
) {
  return new Response(JSON.stringify({
    data: {
      rule: {
        version: 'credits-v1',
        costs: [{ costCode: 'treasure-hunt:start', credits: 10, active: true }],
      },
      balance: {
        poolDepositedCredits: 0,
        availableCredits: overrides.balanceAvailableCredits ?? 0,
        reservedCredits: 0,
        spentCredits: 0,
        blocked: overrides.balanceBlocked ?? false,
      },
      pool: {
        availableCredits: overrides.poolAvailableCredits ?? 50,
        reservedCredits: 0,
        blocked: false,
      },
      materialization,
      currentRun: {
        routes: [
          { status: 'open' },
          { status: 'open' },
        ],
      },
      ...(ownCukie ? { ownCukie } : {}),
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useTreasureHuntCreditAccess', () => {
  beforeEach(() => {
    mockAuthState = {
      user: { walletAddress: WALLET },
      isLoading: false,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('conserva query.data tras un refetch fallido pero invalida fuente y CTA', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(statusResponse())
      .mockRejectedValueOnce(new Error('credits db unavailable'));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTreasureHuntCreditAccess(), { wrapper });

    await waitFor(() => expect(result.current.canPlay).toBe(true));
    expect(result.current.creditSource).toBe('pool');

    await act(async () => {
      await result.current.reload();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(['treasure-hunt-credit-access', WALLET])).toBeDefined();
    expect(result.current.ready).toBe(false);
    expect(result.current.creditSource).toBeNull();
    expect(result.current.canPlay).toBe(false);
    expect(result.current.blocked).toBe(true);
    expect(result.current.costCredits).toBeNull();
    expect(result.current.ownAvailableCredits).toBeNull();
    expect(result.current.poolAvailableCredits).toBeNull();
  });

  it('trata una proyección stale como no verificable aunque el endpoint responda 200', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      statusResponse({ balance: 'ready', pool: 'stale' }),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTreasureHuntCreditAccess(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.ready).toBe(false);
    expect(result.current.availabilityReason).toBe('projection_unavailable');
    expect(result.current.creditSource).toBeNull();
    expect(result.current.canPlay).toBe(false);
    expect(result.current.ownAvailableCredits).toBeNull();
    expect(result.current.poolAvailableCredits).toBeNull();
  });

  it('no selecciona una fuente ni habilita CTA con balance bloqueado aunque el pool cubra el coste', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(
      statusResponse(
        { balance: 'ready', pool: 'ready' },
        { balanceBlocked: true, balanceAvailableCredits: 0, poolAvailableCredits: 50 },
      ),
    );
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTreasureHuntCreditAccess(), { wrapper });

    await waitFor(() => expect(result.current.blocked).toBe(true));
    expect(result.current.ownAvailableCredits).toBe(0);
    expect(result.current.poolAvailableCredits).toBe(50);
    expect(result.current.creditSource).toBeNull();
    expect(result.current.canPlay).toBe(false);
    expect(result.current.isError).toBe(false);
  });

  it('acepta y conserva la disponibilidad OWN parcial del endpoint', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(statusResponse(
      { balance: 'ready', pool: 'ready' },
      {},
      {
        status: 'partial',
        periodId: 'th-day:2026-09-12T14:00:00.000Z',
        periodStartsAt: '2026-09-12T14:00:00.000Z',
        periodEndsAt: '2026-09-13T14:00:00.000Z',
        totalGamesRemaining: 62,
        eligibleCukies: 11,
        unknownCukies: 1,
      },
    ));
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    const wrapper = ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useTreasureHuntCreditAccess(), { wrapper });

    await waitFor(() => expect(result.current.ownCukieAvailability?.status).toBe('partial'));
    expect(result.current.ownCukieAvailability).toMatchObject({
      totalGamesRemaining: 62,
      eligibleCukies: 11,
      unknownCukies: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('includeOwnCukie=1'),
      expect.any(Object),
    );
  });
});
