import { waitFor } from '@testing-library/react';

import {
  createSingleFlightGameSessionStarter,
  createTreasureHuntMultiplayerBridge,
  resolveTreasureHuntMultiplayerAuthorityLease,
} from '@/hooks/use-treasure-hunt-multiplayer-bridge';
import { markParentIframeNavigation } from '@/lib/parent-iframe-navigation';

const GAME_ORIGIN = 'https://game.example';
const GAME_URL = `${GAME_ORIGIN}/treasure-hunt`;
const AUTHORITY_CLIENT_ID = 'parent-authority-client';

function apiResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function requestMessage(
  source: MessageEventSource,
  origin: string,
  requestId: string,
  command: 'join' | 'get' | 'heartbeat' | 'snapshot' | 'forfeit' | 'release' | 'reset',
  payload: Record<string, unknown> = {},
  clientInstanceId = 'client-1',
) {
  window.dispatchEvent(
    new MessageEvent('message', {
      source,
      origin,
      data: {
        type: 'TH_MULTIPLAYER_REQUEST',
        clientInstanceId,
        requestId,
        command,
        payload,
      },
    }),
  );
}

function createHarness(
  fetchImpl = jest.fn(),
  { initialMarkedLoads = 0 }: { initialMarkedLoads?: number } = {},
) {
  const releaseOrder: string[] = [];
  const postMessage = jest.fn((_message: unknown, _origin: string) => {
    releaseOrder.push('response');
  });
  const contentWindow = { postMessage } as unknown as Window;
  const iframeEvents = new EventTarget();
  const addIframeEventListener = jest.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      iframeEvents.addEventListener(type, listener);
    },
  );
  const removeIframeEventListener = jest.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      iframeEvents.removeEventListener(type, listener);
    },
  );
  const iframeElement = {
    contentWindow,
    addEventListener: addIframeEventListener,
    removeEventListener: removeIframeEventListener,
  } as unknown as HTMLIFrameElement;
  const iframeRef = {
    current: iframeElement,
  } as React.RefObject<HTMLIFrameElement>;
  for (let load = 0; load < initialMarkedLoads; load += 1) {
    markParentIframeNavigation(iframeElement);
  }
  const onRoomJoined = jest.fn();
  const onSessionReleased = jest.fn(() => releaseOrder.push('callback'));
  const cleanup = createTreasureHuntMultiplayerBridge({
    iframeRef,
    gameUrl: GAME_URL,
    currentSessionId: 'parent-game-session',
    authorityClientInstanceId: AUTHORITY_CLIENT_ID,
    fetchImpl: fetchImpl as typeof fetch,
    windowObject: window,
    onRoomJoined,
    onSessionReleased,
  });
  return {
    cleanup,
    addIframeEventListener,
    contentWindow,
    dispatchIframeLoad: () => {
      const dispatched = iframeEvents.dispatchEvent(new Event('load'));
      markParentIframeNavigation(iframeElement);
      return dispatched;
    },
    iframeElement,
    postMessage,
    removeIframeEventListener,
    fetchImpl,
    onRoomJoined,
    onSessionReleased,
    releaseOrder,
  };
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
    jest.useRealTimers();
  });

  it('keeps one cryptographic authority lease across iframe reloads and rotates by session', () => {
    const randomUUID = jest
      .fn()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222');
    const cryptoApi = { randomUUID } as unknown as Crypto;

    const first = resolveTreasureHuntMultiplayerAuthorityLease(null, 'session-1', cryptoApi);
    const iframeReload = resolveTreasureHuntMultiplayerAuthorityLease(
      first,
      'session-1',
      cryptoApi,
    );
    const rotatedSession = resolveTreasureHuntMultiplayerAuthorityLease(
      iframeReload,
      'session-2',
      cryptoApi,
    );

    expect(iframeReload).toBe(first);
    expect(rotatedSession.clientInstanceId).not.toBe(first.clientInstanceId);
    expect(randomUUID).toHaveBeenCalledTimes(2);
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

  it('registers one iframe load listener and removes that exact listener on cleanup', () => {
    const {
      addIframeEventListener,
      cleanup,
      removeIframeEventListener,
    } = createHarness();

    expect(addIframeEventListener).toHaveBeenCalledTimes(1);
    expect(addIframeEventListener).toHaveBeenCalledWith('load', expect.any(Function));
    const loadListener = addIframeEventListener.mock.calls[0][1];

    cleanup();

    expect(removeIframeEventListener).toHaveBeenCalledTimes(1);
    expect(removeIframeEventListener).toHaveBeenCalledWith('load', loadListener);
  });

  it('treats the first load as the baseline for the first JOIN', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(apiResponse({
      success: true,
      playerId: 'player-1',
      slot: 0,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
    }));
    const {
      cleanup,
      contentWindow,
      dispatchIframeLoad,
      postMessage,
    } = createHarness(fetchImpl);

    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'first-join',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'first-join',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'running' }),
        }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('accepts the first late load as baseline but rejects the second navigation', async () => {
    const activeMatch = {
      matchId: 'match-1',
      roomCode: 'ROOM42',
      status: 'running',
    };
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: activeMatch,
      }))
      .mockResolvedValueOnce(apiResponse({ success: true, match: activeMatch }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { ...activeMatch, status: 'finished' },
      }));
    const {
      cleanup,
      contentWindow,
      dispatchIframeLoad,
      postMessage,
    } = createHarness(fetchImpl);

    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-before-first-load',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'heartbeat-after-first-load',
      'heartbeat',
      {},
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'heartbeat-after-first-load',
        success: true,
      }),
      GAME_ORIGIN,
    );

    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'heartbeat-after-second-load',
      'heartbeat',
      {},
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchImpl.mock.calls[2][1]?.body as string)).toEqual({
      action: 'forfeit',
      gameSessionId: 'parent-game-session',
      clientInstanceId: AUTHORITY_CLIENT_ID,
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'heartbeat-after-second-load',
        success: false,
        error: expect.objectContaining({ code: 'STALE_IFRAME' }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('detects the next same-UUID load when GameLayout marked initial load before bridge mount', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }));
    const {
      cleanup,
      contentWindow,
      dispatchIframeLoad,
      postMessage,
    } = createHarness(fetchImpl, { initialMarkedLoads: 1 });

    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-after-marked-load',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-after-observed-reload',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches/match-1',
      '/api/games/treasure-hunt/multiplayer/matches',
    ]);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'join-after-observed-reload',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'finished' }),
        }),
      }),
      GAME_ORIGIN,
    );
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
          clientInstanceId: AUTHORITY_CLIENT_ID,
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
            'http://localhost/games/sybil-slayer?room=ROOM+42',
        }),
      },
      GAME_ORIGIN,
    );
    expect(window.location.pathname).toBe('/games/sybil-slayer');
    expect(window.location.search).toBe('?room=ROOM+42');
    expect(window.location.hash).toBe('');
    expect(onRoomJoined).toHaveBeenCalledWith('ROOM 42');
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('spoofed');
    cleanup();
  });

  it('pins the joined match id for get, heartbeat, snapshot and forfeit commands', async () => {
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
      `/api/games/treasure-hunt/multiplayer/matches/trusted-match?gameSessionId=parent-game-session&clientInstanceId=${AUTHORITY_CLIENT_ID}`,
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
      clientInstanceId: AUTHORITY_CLIENT_ID,
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
      clientInstanceId: AUTHORITY_CLIENT_ID,
      snapshot,
    });
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('attacker-match');
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('spoofed-session');

    requestMessage(contentWindow, GAME_ORIGIN, 'forfeit', 'forfeit', {
      matchId: 'attacker-match',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(5));
    expect(JSON.parse(fetchImpl.mock.calls[4][1]?.body as string)).toEqual({
      action: 'forfeit',
      gameSessionId: 'parent-game-session',
      clientInstanceId: AUTHORITY_CLIENT_ID,
    });
    cleanup();
  });

  it.each(['running', 'sudden_death', 'paused_reconnect'])(
    'forfeits %s canonically before rejoining with a reloaded iframe',
    async (activeStatus) => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'match-1', roomCode: 'ROOM42', status: activeStatus },
        }))
        .mockResolvedValueOnce(apiResponse({
          success: true,
          match: {
            matchId: 'match-1',
            roomCode: 'ROOM42',
            status: 'finished',
            result: { winnerPlayerId: 'player-2', reason: 'forfeit' },
          },
        }))
        .mockResolvedValueOnce(apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: {
            matchId: 'match-1',
            roomCode: 'ROOM42',
            status: 'finished',
            result: { winnerPlayerId: 'player-2', reason: 'forfeit' },
          },
        }));
      const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-old',
        'join',
        { roomCode: 'ROOM42' },
        'client-old',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-reload',
        'join',
        { roomCode: 'ROOM42' },
        'client-new',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

      expect(fetchImpl.mock.calls[1][0]).toBe(
        '/api/games/treasure-hunt/multiplayer/matches/match-1',
      );
      expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({
        action: 'forfeit',
        gameSessionId: 'parent-game-session',
        clientInstanceId: AUTHORITY_CLIENT_ID,
      });
      expect(fetchImpl.mock.calls[2][0]).toBe(
        '/api/games/treasure-hunt/multiplayer/matches',
      );
      expect(JSON.parse(fetchImpl.mock.calls[2][1]?.body as string)).toEqual({
        roomCode: 'ROOM42',
        gameSessionId: 'parent-game-session',
        clientInstanceId: AUTHORITY_CLIENT_ID,
      });
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requestId: 'join-reload',
          success: true,
          data: expect.objectContaining({
            playerId: 'player-1',
            slot: 0,
            match: expect.objectContaining({ status: 'finished' }),
          }),
        }),
        GAME_ORIGIN,
      );
      cleanup();
    },
  );

  it('forfeits an active match when the same iframe UUID JOINs after a load', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }));
    const {
      cleanup,
      contentWindow,
      dispatchIframeLoad,
      postMessage,
    } = createHarness(fetchImpl);

    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-before-load',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-after-load',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches/match-1',
      '/api/games/treasure-hunt/multiplayer/matches',
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({
      action: 'forfeit',
      gameSessionId: 'parent-game-session',
      clientInstanceId: AUTHORITY_CLIENT_ID,
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'join-after-load',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'finished' }),
        }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('allows an initial countdown reload when resume markers are empty', async () => {
    const initialCountdown = {
      success: true,
      playerId: 'player-1',
      slot: 0,
      match: {
        matchId: 'match-1',
        roomCode: 'ROOM42',
        status: 'countdown',
        config: { resumeAt: null, resumeEpoch: 0 },
      },
    };
    const fetchImpl = jest.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(apiResponse(initialCountdown)),
    );
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'initial-countdown',
      'join',
      { roomCode: 'ROOM42' },
      'client-old',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'initial-countdown-reload',
      'join',
      { roomCode: 'ROOM42' },
      'client-new',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches',
    ]);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'initial-countdown-reload',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'countdown' }),
        }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it.each([
    ['resumeAt', { resumeAt: Date.now() + 5_000, resumeEpoch: 0 }],
    ['resumeEpoch', { resumeAt: null, resumeEpoch: 1 }],
  ])('pre-forfeits a known resume countdown identified by %s', async (_marker, config) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: {
          matchId: 'match-1',
          roomCode: 'ROOM42',
          status: 'countdown',
          config,
        },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'resume-countdown',
      'join',
      { roomCode: 'ROOM42' },
      'client-old',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'resume-countdown-reload',
      'join',
      { roomCode: 'ROOM42' },
      'client-new',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls[1][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/match-1',
    );
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toMatchObject({
      action: 'forfeit',
      clientInstanceId: AUTHORITY_CLIENT_ID,
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'resume-countdown-reload',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'finished' }),
        }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it.each(['waiting', 'countdown'])(
    'rejoins %s without forfeit and updates the iframe UUID',
    async (status) => {
      const initialJoin = {
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status },
      };
      const activeJoin = {
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
      };
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(apiResponse(initialJoin))
        .mockResolvedValueOnce(apiResponse(initialJoin))
        .mockResolvedValueOnce(apiResponse(activeJoin));
      const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-old',
        'join',
        { roomCode: 'ROOM42' },
        'client-old',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-reload',
        'join',
        { roomCode: 'ROOM42' },
        'client-new',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-retry-new',
        'join',
        { roomCode: 'ROOM42' },
        'client-new',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));

      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(fetchImpl.mock.calls[1][0]).toBe(
        '/api/games/treasure-hunt/multiplayer/matches',
      );
      expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({
        roomCode: 'ROOM42',
        gameSessionId: 'parent-game-session',
        clientInstanceId: AUTHORITY_CLIENT_ID,
      });
      expect(fetchImpl.mock.calls[2][0]).toBe(
        '/api/games/treasure-hunt/multiplayer/matches',
      );
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requestId: 'join-retry-new',
          success: true,
          data: expect.objectContaining({
            match: expect.objectContaining({ status: 'running' }),
          }),
        }),
        GAME_ORIGIN,
      );
      cleanup();
    },
  );

  it.each(['waiting', 'countdown'])(
    'forfeits before exposing active state when a %s reload JOIN advances canonically',
    async (initialStatus) => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'match-1', roomCode: 'ROOM42', status: initialStatus },
        }))
        .mockResolvedValueOnce(apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
        }))
        .mockResolvedValueOnce(apiResponse({
          success: true,
          match: {
            matchId: 'match-1',
            roomCode: 'ROOM42',
            status: 'finished',
            result: { winnerPlayerId: 'player-2', reason: 'forfeit' },
          },
        }));
      const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-old',
        'join',
        { roomCode: 'ROOM42' },
        'client-old',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-reload',
        'join',
        { roomCode: 'ROOM42' },
        'client-new',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

      expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
        '/api/games/treasure-hunt/multiplayer/matches',
        '/api/games/treasure-hunt/multiplayer/matches',
        '/api/games/treasure-hunt/multiplayer/matches/match-1',
      ]);
      expect(JSON.parse(fetchImpl.mock.calls[2][1]?.body as string)).toEqual({
        action: 'forfeit',
        gameSessionId: 'parent-game-session',
        clientInstanceId: AUTHORITY_CLIENT_ID,
      });
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requestId: 'join-reload',
          success: true,
          data: expect.objectContaining({
            match: expect.objectContaining({ status: 'finished' }),
          }),
        }),
        GAME_ORIGIN,
      );
      cleanup();
    },
  );

  it('post-forfeits when a reload JOIN turns an initial countdown into a resume countdown', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: {
          matchId: 'match-1',
          roomCode: 'ROOM42',
          status: 'countdown',
          config: { resumeAt: null, resumeEpoch: 0 },
        },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: {
          matchId: 'match-1',
          roomCode: 'ROOM42',
          status: 'countdown',
          config: { resumeAt: Date.now() + 5_000, resumeEpoch: 1 },
        },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'initial-countdown',
      'join',
      { roomCode: 'ROOM42' },
      'client-old',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'resume-countdown-reload',
      'join',
      { roomCode: 'ROOM42' },
      'client-new',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches/match-1',
    ]);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'resume-countdown-reload',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'finished' }),
        }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('rechecks the navigation epoch when a load occurs during an active JOIN', async () => {
    const delayedReloadJoin = deferred<Response>();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'waiting' },
      }))
      .mockImplementationOnce(() => delayedReloadJoin.promise)
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }));
    const {
      cleanup,
      contentWindow,
      dispatchIframeLoad,
      postMessage,
    } = createHarness(fetchImpl);

    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-before-race',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-during-load',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    dispatchIframeLoad();
    delayedReloadJoin.resolve(apiResponse({
      success: true,
      playerId: 'player-1',
      slot: 0,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches/match-1',
    ]);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'join-during-load',
        success: true,
        data: expect.objectContaining({
          match: expect.objectContaining({ status: 'finished' }),
        }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('does not forfeit an active retry from the same iframe UUID', async () => {
    const activeJoin = {
      success: true,
      playerId: 'player-1',
      slot: 0,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
    };
    const fetchImpl = jest.fn().mockResolvedValue(apiResponse(activeJoin));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-first', 'join', { roomCode: 'ROOM42' }, 'same-child');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(contentWindow, GAME_ORIGIN, 'join-retry', 'join', { roomCode: 'ROOM42' }, 'same-child');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/games/treasure-hunt/multiplayer/matches',
      '/api/games/treasure-hunt/multiplayer/matches',
    ]);
    cleanup();
  });

  it.each([
    ['get', 'client-new', false],
    ['heartbeat', 'client-old', true],
    ['snapshot', 'client-new', true],
    ['forfeit', 'client-new', false],
  ] as const)(
    'does not proxy stale %s from an unjoined iframe identity',
    async (command, clientInstanceId, dispatchLoad) => {
      const fetchImpl = jest.fn().mockResolvedValue(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'waiting' },
      }));
      const {
        cleanup,
        contentWindow,
        dispatchIframeLoad,
        postMessage,
      } = createHarness(fetchImpl);

      if (dispatchLoad) dispatchIframeLoad();
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-authority',
        'join',
        { roomCode: 'ROOM42' },
        'client-old',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
      if (dispatchLoad) dispatchIframeLoad();
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        `stale-${command}`,
        command,
        command === 'snapshot' ? { snapshot: { seq: 1 } } : {},
        clientInstanceId,
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(postMessage).toHaveBeenLastCalledWith(
        {
          type: 'TH_MULTIPLAYER_RESPONSE',
          requestId: `stale-${command}`,
          success: false,
          error: {
            code: 'STALE_IFRAME',
            message: 'Iframe navigation changed; join the multiplayer match again',
          },
        },
        GAME_ORIGIN,
      );
      cleanup();
    },
  );

  it.each(['get', 'heartbeat', 'snapshot', 'forfeit'] as const)(
    'forces a canonical forfeit before rejecting stale active %s',
    async (command) => {
      const fetchImpl = jest
        .fn()
        .mockResolvedValueOnce(apiResponse({
          success: true,
          playerId: 'player-1',
          slot: 0,
          match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
        }))
        .mockResolvedValueOnce(apiResponse({
          success: true,
          match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
        }));
      const {
        cleanup,
        contentWindow,
        dispatchIframeLoad,
        postMessage,
      } = createHarness(fetchImpl);

      dispatchIframeLoad();
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        'join-active-authority',
        'join',
        { roomCode: 'ROOM42' },
        'same-child',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
      dispatchIframeLoad();
      requestMessage(
        contentWindow,
        GAME_ORIGIN,
        `stale-active-${command}`,
        command,
        command === 'snapshot' ? { snapshot: { seq: 1 } } : {},
        'same-child',
      );
      await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

      expect(fetchImpl).toHaveBeenCalledTimes(2);
      expect(fetchImpl.mock.calls[1][0]).toBe(
        '/api/games/treasure-hunt/multiplayer/matches/match-1',
      );
      expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'POST' });
      expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toEqual({
        action: 'forfeit',
        gameSessionId: 'parent-game-session',
        clientInstanceId: AUTHORITY_CLIENT_ID,
      });
      expect(postMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          requestId: `stale-active-${command}`,
          success: false,
          error: expect.objectContaining({ code: 'STALE_IFRAME' }),
        }),
        GAME_ORIGIN,
      );
      cleanup();
    },
  );

  it('rechecks navigation after an authorized heartbeat await and fails closed', async () => {
    const delayedHeartbeat = deferred<Response>();
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
      }))
      .mockImplementationOnce(() => delayedHeartbeat.promise)
      .mockResolvedValueOnce(apiResponse({
        success: true,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'finished' },
      }));
    const {
      cleanup,
      contentWindow,
      dispatchIframeLoad,
      postMessage,
    } = createHarness(fetchImpl);

    dispatchIframeLoad();
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-before-heartbeat-race',
      'join',
      { roomCode: 'ROOM42' },
      'same-child',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'heartbeat-during-load',
      'heartbeat',
      {},
      'same-child',
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    dispatchIframeLoad();
    delayedHeartbeat.resolve(apiResponse({
      success: true,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
    }));
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toMatchObject({
      action: 'heartbeat',
    });
    expect(JSON.parse(fetchImpl.mock.calls[2][1]?.body as string)).toEqual({
      action: 'forfeit',
      gameSessionId: 'parent-game-session',
      clientInstanceId: AUTHORITY_CLIENT_ID,
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'heartbeat-during-load',
        success: false,
        error: expect.objectContaining({ code: 'STALE_IFRAME' }),
      }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it.each([
    ['API error', apiResponse({ success: false, error: { code: 'FORFEIT_FAILED' } }, 409)],
    ['non-terminal response', apiResponse({
      success: true,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
    })],
  ])('fails closed when pre-join reload forfeit returns %s', async (_label, forfeitResponse) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
      }))
      .mockResolvedValueOnce(forfeitResponse);
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-old', 'join', { roomCode: 'ROOM42' }, 'client-old');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(contentWindow, GAME_ORIGIN, 'join-reload', 'join', { roomCode: 'ROOM42' }, 'client-new');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'join-reload', success: false }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it.each([
    ['API error', apiResponse({ success: false, error: { code: 'FORFEIT_FAILED' } }, 409)],
    ['non-terminal response', apiResponse({
      success: true,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
    })],
  ])('fails closed when post-JOIN reload forfeit returns %s', async (_label, forfeitResponse) => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'countdown' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'running' },
      }))
      .mockResolvedValueOnce(forfeitResponse);
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-old',
      'join',
      { roomCode: 'ROOM42' },
      'client-old',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(
      contentWindow,
      GAME_ORIGIN,
      'join-reload',
      'join',
      { roomCode: 'ROOM42' },
      'client-new',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/match-1',
    );
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'join-reload', success: false }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('responds to release before rotating the parent session and notifies exactly once', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      apiResponse({ success: true, released: true, match: null }),
    );
    const {
      cleanup,
      contentWindow,
      postMessage,
      onSessionReleased,
      releaseOrder,
    } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'release-1', 'release');
    await waitFor(() => expect(onSessionReleased).toHaveBeenCalledTimes(1));

    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/games/treasure-hunt/multiplayer/matches/release',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          gameSessionId: 'parent-game-session',
          clientInstanceId: AUTHORITY_CLIENT_ID,
        }),
      }),
    );
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'release-1',
        success: true,
        data: { released: true, match: null },
      },
      GAME_ORIGIN,
    );
    expect(releaseOrder).toEqual(['response', 'callback']);

    requestMessage(contentWindow, GAME_ORIGIN, 'release-replay', 'release');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(onSessionReleased).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('replays a lost release with the same parent lease after the iframe UUID changes', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('lost release response'))
      .mockResolvedValueOnce(apiResponse({ success: true, released: true, match: null }));
    const firstBridge = createHarness(fetchImpl);
    requestMessage(
      firstBridge.contentWindow,
      GAME_ORIGIN,
      'release-before-reload',
      'release',
      {},
      'ephemeral-child-old',
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(firstBridge.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'release-before-reload', success: false }),
      GAME_ORIGIN,
    ));
    firstBridge.cleanup();

    const reloadedBridge = createHarness(fetchImpl);
    requestMessage(
      reloadedBridge.contentWindow,
      GAME_ORIGIN,
      'release-after-reload',
      'release',
      {},
      'ephemeral-child-new',
    );
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reloadedBridge.onSessionReleased).toHaveBeenCalledTimes(1));
    expect(reloadedBridge.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'release-after-reload', success: true }),
      GAME_ORIGIN,
    );

    expect(fetchImpl.mock.calls.map((call) => JSON.parse(call[1]?.body as string))).toEqual([
      { gameSessionId: 'parent-game-session', clientInstanceId: AUTHORITY_CLIENT_ID },
      { gameSessionId: 'parent-game-session', clientInstanceId: AUTHORITY_CLIENT_ID },
    ]);
    reloadedBridge.cleanup();
  });

  it('serializes release behind a pending join that settles within the bounded barrier', async () => {
    const delayedJoin = deferred<Response>();
    const fetchImpl = jest.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/release')) {
        return Promise.resolve(apiResponse({ success: true, released: true, match: null }));
      }
      return delayedJoin.promise;
    });
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-delayed', 'join', { roomCode: 'ROOM42' });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    requestMessage(contentWindow, GAME_ORIGIN, 'release-after-join', 'release');
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    delayedJoin.resolve(apiResponse({
      success: true,
      playerId: 'player-1',
      slot: 0,
      match: { matchId: 'match-1', roomCode: 'ROOM42', status: 'waiting' },
    }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    expect(fetchImpl.mock.calls[1][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/release',
    );
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'release-after-join', success: true }),
      GAME_ORIGIN,
    ));
    cleanup();
  });

  it('bounds the join barrier and lets durable server CAS resolve a hung join', async () => {
    const fetchImpl = jest.fn((input: RequestInfo | URL) => {
      if (String(input).endsWith('/release')) {
        return Promise.resolve(apiResponse({ success: true, released: true, match: null }));
      }
      return new Promise<Response>(() => undefined);
    });
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-hung', 'join', { roomCode: 'ROOM42' });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    requestMessage(contentWindow, GAME_ORIGIN, 'release-bounded', 'release');
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2), { timeout: 1_500 });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'release-bounded', success: true }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('does not retain a synchronously rejected join in the release barrier', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      apiResponse({ success: true, released: true, match: null }),
    );
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'join-invalid', 'join', {});
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'join-invalid', success: false }),
      GAME_ORIGIN,
    ));
    requestMessage(contentWindow, GAME_ORIGIN, 'release-after-invalid', 'release');
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(fetchImpl.mock.calls[0][0]).toBe(
      '/api/games/treasure-hunt/multiplayer/matches/release',
    );
    cleanup();
  });

  it('keeps a normal parent session when backend reports that no staging lock was released', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      apiResponse({ success: true, released: false, match: null }),
    );
    const { cleanup, contentWindow, postMessage, onSessionReleased } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'release-normal', 'release');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'release-normal',
        success: true,
        data: { released: false, match: null },
      }),
      GAME_ORIGIN,
    );
    expect(onSessionReleased).not.toHaveBeenCalled();
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
      `/api/games/treasure-hunt/multiplayer/matches/trusted-match?gameSessionId=parent-game-session&clientInstanceId=${AUTHORITY_CLIENT_ID}`,
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
      `/api/games/treasure-hunt/multiplayer/matches/match-a?gameSessionId=parent-game-session&clientInstanceId=${AUTHORITY_CLIENT_ID}`,
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('ROOM-B');
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('match-b');
    cleanup();
  });

  it('rejects a duplicate in-flight requestId and releases it after completion', async () => {
    let resolveFirstRequest: ((response: Response) => void) | undefined;
    const firstRequest = new Promise<Response>((resolve) => {
      resolveFirstRequest = resolve;
    });
    const successfulJoin = () =>
      apiResponse({
        success: true,
        playerId: 'player-request-id',
        slot: 0,
        match: { matchId: 'match-request-id', roomCode: 'REQUEST-ID' },
      });
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce(() => firstRequest)
      .mockImplementationOnce(async () => successfulJoin());
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'same-request', 'join', {
      roomCode: 'REQUEST-ID',
    });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    requestMessage(contentWindow, GAME_ORIGIN, 'same-request', 'join', {
      roomCode: 'OTHER-ROOM',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'same-request',
        success: false,
        error: {
          code: 'DUPLICATE_REQUEST_ID',
          message: 'A request with this requestId is already in progress',
        },
      },
      GAME_ORIGIN,
    );

    resolveFirstRequest?.(successfulJoin());
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));

    requestMessage(contentWindow, GAME_ORIGIN, 'same-request', 'join', {
      roomCode: 'REQUEST-ID',
    });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'same-request', success: true }),
      GAME_ORIGIN,
    );
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
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Multiplayer request failed',
          retryable: true,
          httpStatus: 500,
        },
      },
      GAME_ORIGIN,
    );
    expect(JSON.stringify(postMessage.mock.calls)).not.toContain('secret');
    cleanup();
  });

  it('reset aborts and generation-ignores a late join before allowing a new room', async () => {
    let resolveOldJoin: ((response: Response) => void) | undefined;
    const oldJoinSignals: AbortSignal[] = [];
    const fetchImpl = jest
      .fn()
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) oldJoinSignals.push(init.signal);
        return new Promise<Response>((resolve) => {
          resolveOldJoin = resolve;
        });
      })
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'new-player',
        slot: 0,
        match: { matchId: 'new-match', roomCode: 'NEW-ROOM' },
      }));
    const { cleanup, contentWindow, postMessage, onRoomJoined } = createHarness(fetchImpl);

    requestMessage(contentWindow, GAME_ORIGIN, 'old-join', 'join', { roomCode: 'OLD-ROOM' });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    requestMessage(contentWindow, GAME_ORIGIN, 'reset-1', 'reset');
    await waitFor(() => expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'reset-1',
        success: true,
        data: { reset: true },
      },
      GAME_ORIGIN,
    ));
    expect(oldJoinSignals[0]?.aborted).toBe(true);

    requestMessage(contentWindow, GAME_ORIGIN, 'new-join', 'join', { roomCode: 'NEW-ROOM' });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onRoomJoined).toHaveBeenCalledWith('NEW-ROOM'));

    resolveOldJoin?.(apiResponse({
      success: true,
      playerId: 'old-player',
      slot: 0,
      match: { matchId: 'old-match', roomCode: 'OLD-ROOM' },
    }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onRoomJoined).not.toHaveBeenCalledWith('OLD-ROOM');
    expect(window.location.search).toContain('room=NEW-ROOM');
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'old-join', success: true }),
      GAME_ORIGIN,
    );
    cleanup();
  });

  it('rejects non-empty reset payloads without unpinning the current room', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(apiResponse({
      success: true,
      playerId: 'player-1',
      slot: 0,
      match: { matchId: 'match-1', roomCode: 'ROOM-1', status: 'running' },
    }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);
    requestMessage(contentWindow, GAME_ORIGIN, 'join-room-1', 'join', { roomCode: 'ROOM-1' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));

    requestMessage(contentWindow, GAME_ORIGIN, 'bad-reset', 'reset', { matchId: 'spoofed' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'bad-reset',
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'Reset payload must be empty' },
      },
      GAME_ORIGIN,
    );

    requestMessage(contentWindow, GAME_ORIGIN, 'active-reset', 'reset');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));
    expect(postMessage).toHaveBeenLastCalledWith(
      {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'active-reset',
        success: false,
        error: {
          code: 'MATCH_ACTIVE',
          message: 'An active multiplayer match cannot be reset',
        },
      },
      GAME_ORIGIN,
    );

    requestMessage(contentWindow, GAME_ORIGIN, 'other-room', 'join', { roomCode: 'ROOM-2' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(4));
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'other-room',
        success: false,
        error: expect.objectContaining({ code: 'MATCH_PINNED' }),
      }),
      GAME_ORIGIN,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it('unpins a canonically terminal match and permits a second room', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-1', roomCode: 'ROOM-1', status: 'finished' },
      }))
      .mockResolvedValueOnce(apiResponse({
        success: true,
        playerId: 'player-1',
        slot: 0,
        match: { matchId: 'match-2', roomCode: 'ROOM-2', status: 'waiting' },
      }));
    const { cleanup, contentWindow, postMessage } = createHarness(fetchImpl);
    requestMessage(contentWindow, GAME_ORIGIN, 'terminal-join', 'join', { roomCode: 'ROOM-1' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    requestMessage(contentWindow, GAME_ORIGIN, 'terminal-reset', 'reset');
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(2));
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ requestId: 'terminal-reset', success: true }),
      GAME_ORIGIN,
    );
    requestMessage(contentWindow, GAME_ORIGIN, 'second-room', 'join', { roomCode: 'ROOM-2' });
    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(3));
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestId: 'second-room',
        success: true,
        data: expect.objectContaining({ match: expect.objectContaining({ matchId: 'match-2' }) }),
      }),
      GAME_ORIGIN,
    );
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
      idempotencyKeyFactory: () => 'test-idempotency-key-0001',
    });

    const first = starter.start('wallet-user');
    const second = starter.start('wallet-user');
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toEqual({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      idempotencyKey: 'test-idempotency-key-0001',
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
    await starter.start('wallet-user');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries one transient failure and then caches the successful owner session', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce(
        apiResponse({
          success: true,
          sessionId: 'session-after-retry',
          sessionToken: 'retry-token',
          gameId: 'sybil-slayer',
          gameVersion: '1.0.0',
        }),
      );
    const starter = createSingleFlightGameSessionStarter({
      fetchImpl: fetchImpl as typeof fetch,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      idempotencyKeyFactory: () => 'retry-idempotency-key-0001',
      maxAttempts: 2,
      retryDelayMs: 0,
    });

    await expect(starter.start('wallet-user')).resolves.toMatchObject({
      sessionId: 'session-after-retry',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]?.body).toBe(fetchImpl.mock.calls[1][1]?.body);
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toMatchObject({
      idempotencyKey: 'retry-idempotency-key-0001',
    });
    await starter.start('wallet-user');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('cancels a scheduled retry when its wallet generation is reset', async () => {
    const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('temporary network failure'));
    const starter = createSingleFlightGameSessionStarter({
      fetchImpl: fetchImpl as typeof fetch,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      idempotencyKeyFactory: () => 'cancel-idempotency-key-0001',
      maxAttempts: 2,
      retryDelayMs: 10_000,
    });

    const start = starter.start('wallet-a');
    const rejection = expect(start).rejects.toMatchObject({ name: 'AbortError' });
    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    starter.reset();

    await rejection;
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
