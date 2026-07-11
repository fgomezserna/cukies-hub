import React, { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/hooks/use-game-data', () => ({
  useGameData: jest.fn(),
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
  }: {
    iframeRef: React.RefObject<HTMLIFrameElement>;
    gameConfig: { gameUrl: string };
  }) => <iframe ref={iframeRef} src={gameConfig.gameUrl} title="mock-game-frame" />,
}));

import SybilSlayerPage from '@/app/(app)/games/sybil-slayer/page';
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
    window.history.replaceState({}, '', '/games/sybil-slayer?room=INVITED');

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
        name: 'Sybil Slayer',
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
      window.history.replaceState({}, '', '/games/sybil-slayer?room=ROOM-TWO');
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
      window.history.replaceState({}, '', '/games/sybil-slayer?room=ROOM-THREE');
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
      '/games/sybil-slayer?room=INVITED&campaign=summer#score',
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
});
