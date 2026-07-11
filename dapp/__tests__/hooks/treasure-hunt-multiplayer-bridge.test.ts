import { waitFor } from '@testing-library/react';

import {
  createSingleFlightGameSessionStarter,
  createTreasureHuntMultiplayerBridge,
} from '@/hooks/use-treasure-hunt-multiplayer-bridge';

const GAME_ORIGIN = 'https://game.example';
const GAME_URL = `${GAME_ORIGIN}/treasure-hunt`;

function apiResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestMessage(
  source: MessageEventSource,
  origin: string,
  requestId: string,
  command: 'join' | 'get' | 'heartbeat' | 'snapshot',
  payload: Record<string, unknown> = {},
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      source,
      origin,
      data: {
        type: 'TH_MULTIPLAYER_REQUEST',
        requestId,
        command,
        payload,
      },
    }),
  );
}

function createHarness(fetchImpl = jest.fn()) {
  const postMessage = jest.fn();
  const contentWindow = { postMessage } as unknown as Window;
  const iframeRef = {
    current: { contentWindow },
  } as React.RefObject<HTMLIFrameElement>;
  const onRoomJoined = jest.fn();
  const cleanup = createTreasureHuntMultiplayerBridge({
    iframeRef,
    gameUrl: GAME_URL,
    currentSessionId: 'parent-game-session',
    fetchImpl: fetchImpl as typeof fetch,
    windowObject: window,
    onRoomJoined,
  });
  return { cleanup, contentWindow, postMessage, fetchImpl, onRoomJoined };
}

describe('Treasure Hunt multiplayer parent bridge', () => {
  beforeEach(() => {
    window.history.replaceState(
      { preserved: true },
      '',
      '/games/sybil-slayer?lang=es&campaign=launch&session_token=secret#fragment',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('ignores messages from a different iframe source or origin', async () => {
    const { cleanup, contentWindow, fetchImpl, postMessage } = createHarness();

    requestMessage(contentWindow, 'https://evil.example', 'bad-origin', 'join', {
      roomCode: 'ROOM42',
    });
    requestMessage({ postMessage: jest.fn() } as unknown as Window, GAME_ORIGIN, 'bad-source', 'join', {
      roomCode: 'ROOM42',
    });

    await Promise.resolve();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
    cleanup();
  });

  it('uses only the parent session, replies to the exact origin and returns a sanitized invite URL', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM 42' },
      }),
    );
    const { cleanup, contentWindow, postMessage, onRoomJoined } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-1', 'join', {
      roomCode: 'ROOM 42',
      gameSessionId: 'spoofed-session',
      userId: 'spoofed-user',
      playerId: 'spoofed-player',
    });

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/games/treasure-hunt/multiplayer/matches',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          roomCode: 'ROOM 42',
          gameSessionId: 'parent-game-session',
        }),
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'join-1',
        success: true,
        data: expect.objectContaining({
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'match-1', roomCode: 'ROOM 42' },
          inviteUrl:
            'http://localhost/games/sybil-slayer?lang=es&campaign=launch&room=ROOM+42',
        }),
      },
      GAME_ORIGIN,
    );
    expect(window.location.pathname).toBe('/games/sybil-slayer');
    expect(window.location.search).toBe('?lang=es&campaign=launch&room=ROOM+42');
    expect(window.location.hash).toBe('');
    expect(onRoomJoined).toHaveBeenCalledWith('ROOM 42');
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('spoofed');
    cleanup();
  });

  it('pins the joined match id for get, heartbeat and snapshot commands', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'trusted-match', roomCode: 'ROOM42' },
        }),
      )
      .mockResolvedValue(apiResponse({ success: true, match: { matchId: 'trusted-match' } }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join', 'join', { roomCode: 'ROOM42' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));

    requestMessage(contentWindow, GAME_ORIGIN, 'get', 'get', { matchId: 'attacker-match' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(fetchImpl.mock.calls[1][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/trusted-match?gameSessionId=parent-game-session',
    );

    requestMessage(contentWindow, GAME_ORIGIN, 'heartbeat', 'heartbeat', {
      matchId: 'attacker-match',
      gameSessionId: 'spoofed-session',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));
    expect(fetchImpl.mock.calls[2][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/trusted-match',
    );
    expect(JSON.parse(fetchImpl.mock.calls[2][1]?.body as string)).toEqual({
      action: 'heartbeat',
      gameSessionId: 'parent-game-session',
    });

    const snapshot = { seq: 1, score: 10, hearts: 3, elapsedMs: 100, lifecycle: 'playing' };
    requestMessage(contentWindow, GAME_ORIGIN, 'snapshot', 'snapshot', {
      matchId: 'attacker-match',
      snapshot,
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(4));
    expect(JSON.parse(fetchImpl.mock.calls[3][1]?.body as string)).toEqual({
      action: 'snapshot',
      gameSessionId: 'parent-game-session',
      snapshot,
    });
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('attacker-match');
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('spoofed-session');
    cleanup();
  });

  it('never lets a second join move the bridge to a different room or match', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'trusted-match', roomCode: 'TRUSTED' },
        }),
      )
      .mockResolvedValue(apiResponse({ success: true, match: { matchId: 'trusted-match' } }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-trusted', 'join', {
      roomCode: 'TRUSTED',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));

    requestMessage(contentWindow, GAME_ORIGIN, 'join-attacker', 'join', {
      roomCode: 'ATTACKER',
      matchId: 'attacker-match',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'join-attacker',
        success: false,
        error: {
          code: 'MATCH_PINNED',
          message: 'Multiplayer bridge is already pinned to another room',
        },
      },
      GAME_ORIGIN,
    );

    requestMessage(contentWindow, GAME_ORIGIN, 'get-after-attacker', 'get', {
      matchId: 'attacker-match',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));
    expect(fetchImpl.mock.calls[1][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/trusted-match?gameSessionId=parent-game-session',
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('ATTACKER');
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('attacker-match');
    cleanup();
  });

  it('serializes concurrent joins before the first room fetch resolves', async () => {
    let resolveFirstJoin: ((response: Response) => void) | undefined;
    const firstJoin = new Promise<Response>((resolve) => {
      resolveFirstJoin = resolve;
    });
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(() => firstJoin)
      .mockResolvedValue(apiResponse({ success: true, match: { matchId: 'match-a' } }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-a', 'join', { roomCode: 'ROOM-A' });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    requestMessage(contentWindow, GAME_ORIGIN, 'join-b', 'join', { roomCode: 'ROOM-B' });
    requestMessage(contentWindow, GAME_ORIGIN, 'join-a-duplicate', 'join', {
      roomCode: 'ROOM-A',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0]).toEqual([
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'join-b',
        success: false,
        error: {
          code: 'JOIN_IN_PROGRESS',
          message: 'A multiplayer room join is already in progress',
        },
      },
      GAME_ORIGIN,
    ]);
    expect(postMessage.mock.calls[1]).toEqual([
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'join-a-duplicate',
        success: false,
        error: {
          code: 'JOIN_IN_PROGRESS',
          message: 'A multiplayer room join is already in progress',
        },
      },
      GAME_ORIGIN,
    ]);

    resolveFirstJoin?.(
      apiResponse({
        success: true,
        playerId: 'player-a',
        slot: 0,
        match: { matchId: 'match-a', roomCode: 'ROOM-A' },
      }),
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));
    expect(postMessage.mock.calls[2][0]).toMatchObject({
      requestId: 'join-a',
      success: true,
      data: { match: { matchId: 'match-a', roomCode: 'ROOM-A' } },
    });

    requestMessage(contentWindow, GAME_ORIGIN, 'get-a', 'get', { matchId: 'match-b' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(4));
    expect(fetchImpl.mock.calls[1][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/match-a?gameSessionId=parent-game-session',
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('ROOM-B');
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('match-b');
    cleanup();
  });

  it('clears a failed pending join so the same room can retry', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          playerId: 'player-retry',
          slot: 0,
          match: { matchId: 'match-retry', roomCode: 'RETRY' },
        }),
      );
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-failed', 'join', { roomCode: 'RETRY' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls[0][0]).toMatchObject({
      requestId: 'join-failed',
      success: false,
      error: { code: 'REQUEST_FAILED' },
    });

    requestMessage(contentWindow, GAME_ORIGIN, 'join-retry', 'join', { roomCode: 'RETRY' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(postMessage.mock.calls[1][0]).toMatchObject({
      requestId: 'join-retry',
      success: true,
      data: { match: { matchId: 'match-retry', roomCode: 'RETRY' } },
    });
    cleanup();
  });

  it('rejects match operations before join without issuing an API request', async () => {
    const { cleanup, contentWindow, postMessage, fetchImpl } = createHarness();
    requestMessage(contentWindow, GAME_ORIGIN, 'get-before-join', 'get', {
      matchId: 'attacker-match',
    });

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'get-before-join',
        success: false,
        error: {
          code: 'MATCH_NOT_JOINED',
          message: 'Multiplayer match is not joined',
        },
      },
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('aborts in-flight requests and removes the listener during cleanup', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchImpl = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
    });
    const { cleanup, contentWindow, postMessage, onRoomJoined } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'pending', 'join', { roomCode: 'ROOM42' });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    cleanup();

    expect(capturedSignal?.aborted).toBe(true);
    resolveFetch?.(
      apiResponse({
        success: true,
        playerId: 'late-player',
        slot: 0,
        match: { matchId: 'late-match', roomCode: 'LATE-ROOM' },
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRoomJoined).not.toHaveBeenCalled();
    expect(window.location.search).not.toContain('LATE-ROOM');

    requestMessage(contentWindow, GAME_ORIGIN, 'after-cleanup', 'join', { roomCode: 'ROOM42' });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('redacts unexpected API errors sent back to the iframe', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      apiResponse(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'DATABASE_URL=mongodb://user:secret@example.test',
          },
        },
        500,
      ),
    );
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);
    requestMessage(contentWindow, GAME_ORIGIN, 'failure', 'join', { roomCode: 'ROOM42' });

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'failure',
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Multiplayer request failed' },
      },
      GAME_ORIGIN,
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('secret');
    cleanup();
  });
});

describe('game session single-flight starter', () => {
  it('deduplicates concurrent starts and never sends client identity', async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchImpl = jest.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        }),
    );
    const starter = createSingleFlightGameSessionStarter({
      fetchImpl: fetchImpl as typeof fetch,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    const first = starter.start();
    const second = starter.start();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    resolveRequest?.(
      apiResponse({
        success: true,
        sessionId: 'session-1',
        sessionToken: 'session_token',
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }),
    );

    await expect(first).resolves.toMatchObject({ sessionId: 'session-1' });
    await expect(second).resolves.toMatchObject({ sessionId: 'session-1' });
    await starter.start();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
