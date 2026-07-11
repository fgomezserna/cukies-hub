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
    onRoomJoined?: (roomCode: string) => void;
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
        body: JSON.stringify({ gameId: 'sybil-slayer', gameVersion: '1.0.0' }),
      }),
    );

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
          sessionToken: 'parent-session-token',
          sessionId: 'parent-session',
          gameVersion: '1.0.0',
          roomId: 'ROOM-TWO',
          user: {
            id: 'wallet-user',
            name: 'Player One',
            email: 'player@example.test',
          },
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
});
