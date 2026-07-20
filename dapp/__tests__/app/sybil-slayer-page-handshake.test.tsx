import React, { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('lucide-react', () => ({
  X: () => null,
}));

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/use-game-data', () => ({
  useGameData: jest.fn(),
}));

jest.mock('@/hooks/use-treasure-hunt-competition-overview', () => ({
  formatTreasureHuntPercentage: (bps: number) => `${bps / 100}%`,
  TREASURE_HUNT_FALLBACK_RULES: {
    poolBps: 2_500,
    playerRewardBps: 1_000,
    sponsorRewardBps: 2_500,
    maxWinningAttemptsPerWallet: 5,
    cliffMonths: 9,
    vestingMonths: 6,
  },
  useTreasureHuntCompetitionOverview: () => ({
    status: null,
    leaderboard: [],
    isLoading: false,
    error: null,
    reload: jest.fn(),
  }),
}));

jest.mock('@/hooks/use-pusher-game-connection', () => ({
  usePusherGameConnection: jest.fn(),
}));

jest.mock('@/hooks/use-treasure-hunt-multiplayer-bridge', () => {
  const actual = jest.requireActual('@/hooks/use-treasure-hunt-multiplayer-bridge');
  return {
    ...actual,
    useTreasureHuntMultiplayerBridge: jest.fn(),
  };
});

jest.mock('@/components/layout/GameLayout', () => ({
  __esModule: true,
  default: ({
    iframeRef,
    gameConfig,
    children,
    desktopBanner,
  }: {
    iframeRef: React.RefObject<HTMLIFrameElement>;
    gameConfig: { gameUrl: string };
    children?: React.ReactNode;
    desktopBanner?: React.ReactNode;
  }) => <>
    <iframe ref={iframeRef} src={gameConfig.gameUrl} title="mock-game-frame" />
    {children}
    <div data-testid="desktop-banner-slot">{desktopBanner}</div>
  </>,
}));

jest.mock('@/components/games/treasure-hunt-competition-panel', () => ({
  __esModule: true,
  default: () => <div data-testid="competition-panel" />,
}));

import SybilSlayerPage from '@/app/(app)/games/treasure-hunt/page';
import { useGameData } from '@/hooks/use-game-data';
import { usePusherGameConnection } from '@/hooks/use-pusher-game-connection';
import { useTreasureHuntMultiplayerBridge } from '@/hooks/use-treasure-hunt-multiplayer-bridge';
import { useAuth } from '@/providers/auth-provider';

const GAME_ORIGIN = 'https://game.example';
const mockUseAuth = useAuth as unknown as jest.Mock;
const mockUseGameData = useGameData as unknown as jest.Mock;
const mockUsePusherGameConnection = usePusherGameConnection as unknown as jest.Mock;
const mockUseMultiplayerBridge = useTreasureHuntMultiplayerBridge as unknown as jest.Mock;

function latestBridgeOptions() {
  return mockUseMultiplayerBridge.mock.calls.at(-1)?.[0] as {
    currentSessionId: string | null;
    onRoomJoined?: (roomCode: string) => void;
    onSessionReleased?: (sessionId: string) => void;
  };
}

describe('SybilSlayerPage game-session handshake', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState({}, '', '/games/treasure-hunt?room=INVITED');

    mockUseAuth.mockReturnValue({
      isLoading: false,
      user: {
        id: 'wallet-user',
        username: 'Player One',
        email: 'player@example.test',
      },
    });
    mockUseGameData.mockReturnValue({
      gameConfig: {
        id: 'config-1',
        gameId: 'sybil-slayer',
        name: 'Treasure Hunt',
        description: 'Test game',
        gameUrl: `${GAME_ORIGIN}/treasure-hunt`,
        ranks: [],
        leaderboardTitle: 'Leaderboard',
        isActive: true,
        isInMaintenance: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      gameStats: null,
      leaderboardData: null,
      loading: false,
      error: null,
      refetch: jest.fn(),
    });
    mockUsePusherGameConnection.mockReturnValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('single-flights start-session and resends the current room only for the trusted iframe', async () => {
    let resolveStartSession: ((response: Response) => void) | undefined;
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveStartSession = resolve;
        }),
    );
    global.fetch = fetchMock as typeof fetch;

    const view = render(
      <StrictMode>
        <SybilSlayerPage />
      </StrictMode>,
    );
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/games/start-session',
      expect.objectContaining({
        method: 'POST',
        body: expect.any(String),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/),
    });

    view.rerender(
      <StrictMode>
        <SybilSlayerPage />
      </StrictMode>,
    );
    act(() => {
      window.history.replaceState({}, '', '/games/treasure-hunt?room=ROOM-TWO');
      latestBridgeOptions().onRoomJoined?.('ROOM-TWO');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveStartSession?.(
        new Response(
          JSON.stringify({
            success: true,
            sessionId: 'parent-session',
            sessionToken: 'parent-session-token',
            gameId: 'sybil-slayer',
            gameVersion: '1.0.0',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    postMessage.mockClear();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frameWindow,
          origin: 'https://evil.example',
          data: { type: 'GAME_READY' },
        }),
      );
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          origin: GAME_ORIGIN,
          data: { type: 'GAME_READY' },
        }),
      );
    });
    expect(postMessage).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frameWindow,
          origin: GAME_ORIGIN,
          data: { type: 'GAME_READY' },
        }),
      );
    });
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'GAME_SESSION_START',
        payload: {
          gameId: 'sybil-slayer',
          sessionId: 'parent-session',
          gameVersion: '1.0.0',
          roomId: 'ROOM-TWO',
          userId: 'wallet-user',
        },
      },
      GAME_ORIGIN,
    );

    postMessage.mockClear();
    act(() => {
      window.history.replaceState({}, '', '/games/treasure-hunt?room=ROOM-THREE');
      latestBridgeOptions().onRoomJoined?.('ROOM-THREE');
    });
    await waitFor(() =>
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'GAME_SESSION_START',
          payload: expect.objectContaining({
            sessionId: 'parent-session',
            roomId: 'ROOM-THREE',
          }),
        }),
        GAME_ORIGIN,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('preserves an invite for the first wallet but clears it before another wallet handshakes', async () => {
    window.history.replaceState(
      { navigation: 'test' },
      '',
      '/games/treasure-hunt?room=INVITED&campaign=summer#score',
    );
    mockUseAuth.mockReturnValue({ isLoading: false, user: null });
    const sessionResponse = (sessionId: string) => new Response(
      JSON.stringify({
        success: true,
        sessionId,
        sessionToken: `${sessionId}-token`,
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(sessionResponse('session-a'))
      .mockResolvedValueOnce(sessionResponse('session-b'));
    global.fetch = fetchMock as typeof fetch;

    const view = render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    expect(fetchMock).not.toHaveBeenCalled();

    mockUseAuth.mockReturnValue({
      isLoading: false,
      user: { id: 'wallet-a', username: 'Wallet A', email: 'a@example.test' },
    });
    view.rerender(<SybilSlayerPage />);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe('session-a'));

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: { type: 'GAME_READY' },
      }));
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GAME_SESSION_START',
        payload: expect.objectContaining({
          sessionId: 'session-a',
          roomId: 'INVITED',
          userId: 'wallet-a',
        }),
      }),
      GAME_ORIGIN,
    );
    expect(new URLSearchParams(window.location.search).get('room')).toBe('INVITED');

    postMessage.mockClear();
    mockUseAuth.mockReturnValue({
      isLoading: false,
      user: { id: 'wallet-b', username: 'Wallet B', email: 'b@example.test' },
    });
    view.rerender(<SybilSlayerPage />);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe('session-b'));
    expect(new URLSearchParams(window.location.search).get('room')).toBeNull();
    expect(new URLSearchParams(window.location.search).get('campaign')).toBe('summer');
    expect(window.location.hash).toBe('#score');

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: { type: 'GAME_READY' },
      }));
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GAME_SESSION_START',
        payload: expect.objectContaining({
          sessionId: 'session-b',
          roomId: null,
          userId: 'wallet-b',
        }),
      }),
      GAME_ORIGIN,
    );
  });

  it('aborts wallet A, ignores its late response, starts wallet B and clears B on disconnect', async () => {
    const pendingRequests: Array<{
      resolve: (response: Response) => void;
      signal: AbortSignal | null;
    }> = [];
    const fetchMock = jest.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          pendingRequests.push({ resolve, signal: init?.signal ?? null });
        }),
    );
    global.fetch = fetchMock as typeof fetch;
    mockUseAuth.mockReturnValue({
      isLoading: false,
      user: { id: 'wallet-a', username: 'Wallet A', email: 'a@example.test' },
    });

    const view = render(
      <StrictMode>
        <SybilSlayerPage />
      </StrictMode>,
    );
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    mockUseAuth.mockReturnValue({
      isLoading: false,
      user: { id: 'wallet-b', username: 'Wallet B', email: 'b@example.test' },
    });
    view.rerender(
      <StrictMode>
        <SybilSlayerPage />
      </StrictMode>,
    );

    await waitFor(() => expect(pendingRequests[0].signal?.aborted).toBe(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(latestBridgeOptions()).toMatchObject({ currentSessionId: null });

    await act(async () => {
      pendingRequests[0].resolve(
        new Response(
          JSON.stringify({
            success: true,
            sessionId: 'session-a',
            sessionToken: 'token-a',
            gameId: 'sybil-slayer',
            gameVersion: '1.0.0',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      await Promise.resolve();
    });
    expect(localStorage.getItem('session_token_session-a')).toBeNull();
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('session-a');

    await act(async () => {
      pendingRequests[1].resolve(
        new Response(
          JSON.stringify({
            success: true,
            sessionId: 'session-b',
            sessionToken: 'token-b',
            gameId: 'sybil-slayer',
            gameVersion: '1.0.0',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    });
    expect(localStorage.getItem('session_token_session-b')).toBeNull();
    expect(latestBridgeOptions()).toMatchObject({ currentSessionId: 'session-b' });
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('session-a');

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frameWindow,
          origin: GAME_ORIGIN,
          data: { type: 'GAME_READY' },
        }),
      );
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'GAME_SESSION_START',
        payload: expect.objectContaining({
          sessionId: 'session-b',
          userId: 'wallet-b',
        }),
      }),
      GAME_ORIGIN,
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('token-b');

    postMessage.mockClear();
    mockUseAuth.mockReturnValue({ isLoading: false, user: null });
    view.rerender(
      <StrictMode>
        <SybilSlayerPage />
      </StrictMode>,
    );
    expect(localStorage.getItem('session_token_session-b')).toBeNull();
    expect(latestBridgeOptions()).toMatchObject({ currentSessionId: null });
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'GAME_SESSION_CLEAR', sessionId: 'session-b' },
      GAME_ORIGIN,
    );

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: frameWindow,
          origin: GAME_ORIGIN,
          data: { type: 'GAME_READY' },
        }),
      );
    });
    expect(postMessage).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('authorizes only the active session channel using the parent memory bearer', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        sessionId: 'parent-session',
        sessionToken: 'parent-memory-token',
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ auth: 'signed-auth' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe('parent-session'));

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'PUSHER_AUTH_REQUEST',
          authId: 'bad-channel',
          socketId: '123.456',
          channelName: 'private-game-session-attacker',
          sessionToken: 'attacker-token',
        },
      }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'PUSHER_AUTH_REQUEST',
          authId: 'valid-auth',
          socketId: '123.456',
          channelName: 'private-game-session-parent-session',
          sessionToken: 'attacker-token',
        },
      }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toBe('/api/pusher/auth');
    const authBody = new URLSearchParams(fetchMock.mock.calls[1][1]?.body as string);
    expect(authBody.get('session_token')).toBe('parent-memory-token');
    expect(authBody.get('channel_name')).toBe('private-game-session-parent-session');
    expect(authBody.toString()).not.toContain('attacker-token');
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PUSHER_AUTH_RESPONSE',
        authId: 'valid-auth',
        success: true,
      }),
      GAME_ORIGIN,
    ));
    expect(mockUsePusherGameConnection).toHaveBeenLastCalledWith(
      'parent-session',
      expect.objectContaining({ sessionToken: 'parent-memory-token' }),
      expect.any(Object),
    );
    expect(localStorage.getItem('session_token_parent-session')).toBeNull();
  });

  it('requires a signed wallet in the Hub instead of silently starting practice', () => {
    mockUseAuth.mockReturnValue({ isLoading: false, user: null });
    const fetchMock = jest.fn();
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_REQUEST',
          requestId: 'wallet-required-request',
          sessionId: null,
        },
      }));
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
      requestId: 'wallet-required-request',
      sessionId: null,
      eligible: false,
      practice: false,
      reason: 'SIGNED_WALLET_REQUIRED',
    }, GAME_ORIGIN);
  });

  it('keeps the opaque resume id through real auth hydration from loading to wallet', async () => {
    const sessionId = `game_${'1'.repeat(64)}`;
    sessionStorage.setItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
      JSON.stringify([{ ownerKey: 'wallet-user', sessionId }]),
    );
    mockUseAuth.mockReturnValue({ isLoading: true, user: null });
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `session_${'2'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    global.fetch = fetchMock as typeof fetch;

    const view = render(<SybilSlayerPage />);
    expect(fetchMock).not.toHaveBeenCalled();
    mockUseAuth.mockReturnValue({
      isLoading: false,
      user: { id: 'wallet-user', username: 'Player One', email: 'player@example.test' },
    });
    view.rerender(<SybilSlayerPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      resumeSessionId: sessionId,
    });
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
  });

  it('starts a ranked 1P attempt only for the trusted iframe and returns no receipt', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        sessionId: 'competition-session',
        sessionToken: 'parent-memory-token',
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        attempt: {
          attemptId: 'attempt-1',
          seed: 'server-seed',
          alias: 'Hunter-ABC123',
          status: 'active',
          nextSequence: 0,
          receipt: 'parent-only-receipt',
        },
      }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe('competition-session'));

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: 'https://evil.example',
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_REQUEST',
          requestId: 'evil-request-id',
          sessionId: 'competition-session',
        },
      }));
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_REQUEST',
          requestId: 'trusted-request-id',
          sessionId: 'competition-session',
        },
      }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/games/treasure-hunt/competition/attempts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ gameSessionId: 'competition-session' }),
      }),
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
        requestId: 'trusted-request-id',
        sessionId: 'competition-session',
        eligible: true,
        practice: false,
        attemptId: 'attempt-1',
        seed: 'server-seed',
        alias: 'Hunter-ABC123',
        status: 'active',
      },
      GAME_ORIGIN,
    ));
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('parent-only-receipt');
    expect(mockUsePusherGameConnection).toHaveBeenLastCalledWith(
      'competition-session',
      expect.any(Object),
      expect.objectContaining({
        competitionCoordinator: expect.objectContaining({
          hasActiveAttempt: expect.any(Function),
          finish: expect.any(Function),
        }),
      }),
    );
  });

  it('fails an expired resumed session closed and rotates it before the next play', async () => {
    const staleSessionId = `game_${'3'.repeat(64)}`;
    const freshSessionId = `game_${'4'.repeat(64)}`;
    sessionStorage.setItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
      JSON.stringify([{ ownerKey: 'wallet-user', sessionId: staleSessionId }]),
    );
    const sessionResponse = (sessionId: string) => new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `token-${sessionId}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(sessionResponse(staleSessionId))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error: 'GAME_SESSION_NOT_ELIGIBLE',
        message: 'Session expired',
      }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(sessionResponse(freshSessionId));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(staleSessionId));

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_REQUEST',
          requestId: 'expired-session-request',
          sessionId: staleSessionId,
        },
      }));
    });

    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
      requestId: 'expired-session-request',
      sessionId: staleSessionId,
      eligible: false,
      practice: false,
      reason: 'GAME_SESSION_RESTART_REQUIRED',
    }, GAME_ORIGIN));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'GAME_SESSION_CLEAR',
      sessionId: staleSessionId,
    }, GAME_ORIGIN);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(freshSessionId));
  });

  it('rotates to a fresh normal GameSession only after the bridge confirms release', async () => {
    const sessionResponse = (sessionId: string, sessionToken: string) => new Response(
      JSON.stringify({
        success: true,
        sessionId,
        sessionToken,
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(sessionResponse('staging-session', 'staging-token'))
      .mockResolvedValueOnce(sessionResponse('fresh-single-session', 'fresh-token'));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const postMessage = jest.spyOn(iframe.contentWindow as Window, 'postMessage')
      .mockImplementation(() => undefined);

    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe('staging-session'));
    postMessage.mockClear();
    act(() => latestBridgeOptions().onSessionReleased?.('staging-session'));

    expect(postMessage).toHaveBeenCalledWith(
      { type: 'GAME_SESSION_CLEAR', sessionId: 'staging-session' },
      GAME_ORIGIN,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe('fresh-single-session'));
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('fresh-token');
  });

  it('resumes the same parent GameSession after a full page remount without storing its bearer', async () => {
    const sessionId = `game_${'a'.repeat(64)}`;
    const sessionToken = `session_${'b'.repeat(43)}`;
    const sessionResponse = () => new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = jest.fn()
      .mockImplementationOnce(async () => sessionResponse())
      .mockImplementationOnce(async () => sessionResponse());
    global.fetch = fetchMock as typeof fetch;

    const first = render(<SybilSlayerPage />);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
    const stored = sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    );
    expect(stored).toContain(sessionId);
    expect(stored).not.toContain(sessionToken);
    first.unmount();

    render(<SybilSlayerPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      resumeSessionId: sessionId,
    });
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
    expect(JSON.stringify(sessionStorage)).not.toContain(sessionToken);
  });

  it('remounts the competition panel after a confirmed review result and clears that exact result', async () => {
    const sessionId = `game_${'c'.repeat(64)}`;
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `session_${'d'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const postMessage = jest.spyOn(iframe.contentWindow as Window, 'postMessage')
      .mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
    expect(screen.getByTestId('desktop-banner-slot')).toHaveTextContent(
      'Competición activa · Torneo de Preventa UKI',
    );
    expect(screen.queryByTestId('competition-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mi participación' }));
    const panelBefore = screen.getByTestId('competition-panel');
    expect(screen.getByRole('dialog')).toContainElement(panelBefore);
    const options = mockUsePusherGameConnection.mock.calls.at(-1)?.[2] as {
      onSessionEnd: (result: Record<string, unknown>) => Promise<void>;
    };

    await act(async () => {
      await options.onSessionEnd({
        resultId: 'result-review-123',
        finalScore: 900,
        isValid: false,
        source: 'competition',
        status: 'review',
        clearConfirmationRequired: true,
      });
    });

    expect(screen.getByTestId('competition-panel')).not.toBe(panelBefore);
    expect(postMessage).toHaveBeenCalledWith({
      type: 'GAME_SESSION_CLEAR',
      sessionId,
      resultId: 'result-review-123',
    }, GAME_ORIGIN);
  });

  it('uses confirmed exact CLEAR for a modern persisted result even when practice routes through legacy', async () => {
    const sessionId = `game_${'7'.repeat(64)}`;
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `session_${'8'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const postMessage = jest.spyOn(iframe.contentWindow as Window, 'postMessage')
      .mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
    const options = mockUsePusherGameConnection.mock.calls.at(-1)?.[2] as {
      onSessionEnd: (result: Record<string, unknown>) => Promise<void>;
    };

    await act(async () => {
      await options.onSessionEnd({
        resultId: 'result-modern-practice',
        finalScore: 55,
        isValid: false,
        source: 'legacy',
        status: null,
        clearConfirmationRequired: true,
      });
    });

    expect(postMessage).toHaveBeenCalledWith({
      type: 'GAME_SESSION_CLEAR',
      sessionId,
      resultId: 'result-modern-practice',
    }, GAME_ORIGIN);
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:pending-session-clear:v1',
    )).toContain('result-modern-practice');
    expect(latestBridgeOptions().currentSessionId).toBe(sessionId);
  });

  it('accepts a duplicate persisted callback after another transport already cleared the result', async () => {
    const endedSessionId = `game_${'7'.repeat(64)}`;
    const freshSessionId = `game_${'8'.repeat(64)}`;
    const sessionResponse = (sessionId: string) => new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `token-${sessionId}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(sessionResponse(endedSessionId))
      .mockResolvedValueOnce(sessionResponse(freshSessionId));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(endedSessionId));
    const endedSessionOptions = mockUsePusherGameConnection.mock.calls.at(-1)?.[2] as {
      onSessionEnd: (result: Record<string, unknown>) => Promise<void>;
      onGameEndPersisted: (result: Record<string, unknown>) => boolean;
    };
    const resultId = 'result-cleared-by-recovery';

    await act(async () => {
      await endedSessionOptions.onSessionEnd({
        resultId,
        finalScore: 55,
        isValid: false,
        source: 'competition',
        status: 'review',
        clearConfirmationRequired: true,
      });
    });
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
          sessionId: endedSessionId,
          resultId,
        },
      }));
    });
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(freshSessionId));

    expect(endedSessionOptions.onGameEndPersisted({
      resultId,
      clearConfirmationRequired: true,
    })).toBe(true);
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:pending-session-clear:v1',
    )).toBeNull();
  });

  it('replays a modern practice CLEAR after parent reload between backend ACK and ACK confirmation', async () => {
    const sessionId = `game_${'9'.repeat(64)}`;
    const sessionResponse = () => new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `session_${'a'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = jest.fn()
      .mockImplementationOnce(async () => sessionResponse())
      .mockImplementationOnce(async () => sessionResponse());
    global.fetch = fetchMock as typeof fetch;
    const first = render(<SybilSlayerPage />);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
    const firstOptions = mockUsePusherGameConnection.mock.calls.at(-1)?.[2] as {
      onGameEndPersisted: (result: Record<string, unknown>) => boolean;
    };

    expect(firstOptions.onGameEndPersisted({
      resultId: 'result-practice-before-confirm',
      clearConfirmationRequired: true,
    })).toBe(true);
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:pending-session-clear:v1',
    )).toContain('result-practice-before-confirm');
    first.unmount();

    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toMatchObject({
      resumeSessionId: sessionId,
    });
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: { type: 'GAME_READY' },
      }));
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'GAME_SESSION_CLEAR',
      sessionId,
      resultId: 'result-practice-before-confirm',
    }, GAME_ORIGIN);
  });

  it('recovers and ACKs a competition result after reload even when the ended session cannot reconnect Pusher', async () => {
    const sessionId = `game_${'e'.repeat(64)}`;
    sessionStorage.setItem('cukies:treasure-hunt:parent-session:v1:sybil-slayer', JSON.stringify({
      ownerKey: 'wallet-user',
      sessionId,
    }));
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        sessionId,
        sessionToken: `session_${'f'.repeat(43)}`,
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
        attempts: [{
          attemptId: 'attempt-reload-review',
          gameSessionId: sessionId,
          seed: 'seed-reload',
          alias: 'Hunter-RELOAD',
          status: 'review',
          nextSequence: 3,
          receipt: null,
          score: 808,
          gameTimeMs: 30_000,
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(sessionId));
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      resumeSessionId: sessionId,
    });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY',
          sessionId,
          resultId: 'result-after-reload',
          competitionAttemptId: 'attempt-reload-review',
          finalScore: 808,
          gameTime: 30_000,
        },
      }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1][0]).toContain(
      '/api/games/treasure-hunt/competition/attempts?limit=500',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK',
      sessionId,
      resultId: 'result-after-reload',
    }, GAME_ORIGIN));
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:pending-session-clear:v1',
    )).toContain('result-after-reload');

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK_CONFIRMED',
          sessionId,
          resultId: 'result-after-reload',
        },
      }));
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      type: 'GAME_SESSION_CLEAR',
      sessionId,
      resultId: 'result-after-reload',
    }, GAME_ORIGIN));
  });

  it('replays an exact pending clear after parent reload and forgets the session only after iframe confirmation', async () => {
    const oldSessionId = `game_${'5'.repeat(64)}`;
    const freshSessionId = `game_${'6'.repeat(64)}`;
    const resultId = 'result-final-clear-123';
    sessionStorage.setItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
      JSON.stringify([{ ownerKey: 'wallet-user', sessionId: oldSessionId }]),
    );
    sessionStorage.setItem(
      'cukies:treasure-hunt:pending-session-clear:v1',
      JSON.stringify([{ ownerUserId: 'wallet-user', sessionId: oldSessionId, resultId }]),
    );
    const sessionResponse = (sessionId: string) => new Response(JSON.stringify({
      success: true,
      sessionId,
      sessionToken: `token-${sessionId}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(sessionResponse(oldSessionId))
      .mockResolvedValueOnce(sessionResponse(freshSessionId));
    global.fetch = fetchMock as typeof fetch;
    render(<SybilSlayerPage />);
    const iframe = screen.getByTitle('mock-game-frame') as HTMLIFrameElement;
    const frameWindow = iframe.contentWindow as Window;
    const postMessage = jest.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(oldSessionId));

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: { type: 'GAME_READY' },
      }));
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'GAME_SESSION_CLEAR',
      sessionId: oldSessionId,
      resultId,
    }, GAME_ORIGIN);
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    )).toContain(oldSessionId);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: frameWindow,
        origin: GAME_ORIGIN,
        data: {
          type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
          sessionId: oldSessionId,
          resultId,
        },
      }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(latestBridgeOptions().currentSessionId).toBe(freshSessionId));
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    )).not.toContain(oldSessionId);
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:pending-session-clear:v1',
    )).toBeNull();
  });
});
