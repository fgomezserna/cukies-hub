import { act, renderHook } from '@testing-library/react';

import { usePusherConnection } from '../../../games/sybil-slayer/src/hooks/usePusherConnection';

const mockDisconnect = jest.fn();
const mockUnsubscribe = jest.fn();
const mockConnectionBind = jest.fn();
const mockChannelBind = jest.fn();
const mockChannelTrigger = jest.fn();
const mockSubscribe = jest.fn((name: string) => ({
  name,
  state: 'subscribed',
  bind: mockChannelBind,
  trigger: mockChannelTrigger,
}));
const mockPusherConstructor = jest.fn();

jest.mock('pusher-js', () => ({
  __esModule: true,
  default: class MockPusher {
    static logToConsole = false;
    connection = {
      state: 'connected',
      bind: mockConnectionBind,
    };
    subscribe = mockSubscribe;
    unsubscribe = mockUnsubscribe;
    disconnect = mockDisconnect;

    constructor(...args: unknown[]) {
      mockPusherConstructor(...args);
    }
  },
}));

describe('usePusherConnection session refresh', () => {
  const originalParentOrigin = process.env.NEXT_PUBLIC_DAPP_ORIGIN;
  const originalParentWindow = window.parent;
  let postMessage: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_DAPP_ORIGIN = 'https://hub.example';
    localStorage.setItem('pusher-game-session', JSON.stringify({
      gameId: 'sybil-slayer',
      sessionToken: 'token-1',
      sessionId: 'session-1',
      roomId: 'OLD-ROOM',
    }));
    localStorage.setItem('pending-game-result', JSON.stringify({
      finalScore: 10,
      sessionToken: 'legacy-token',
    }));
    const embeddedParent = { postMessage: jest.fn() } as unknown as Window;
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: embeddedParent,
    });
    postMessage = jest.spyOn(embeddedParent, 'postMessage').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParentWindow,
    });
    process.env.NEXT_PUBLIC_DAPP_ORIGIN = originalParentOrigin;
  });

  it('fails closed in an embedded game until the secure parent handshake arrives', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());

    await expect(result.current.requestCompetitionAccess()).resolves.toEqual({
      eligible: false,
      practice: false,
      sessionId: null,
      reason: 'PARENT_HANDSHAKE_REQUIRED',
    });
    expect(postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'TREASURE_HUNT_COMPETITION_START_REQUEST' }),
      expect.anything(),
    );
    unmount();
  });

  it('allows explicit standalone play as practice without manufacturing a Hub session', async () => {
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: window,
    });
    const { result, unmount } = renderHook(() => usePusherConnection());

    await expect(result.current.requestCompetitionAccess()).resolves.toEqual({
      eligible: false,
      practice: true,
      sessionId: null,
      reason: 'STANDALONE_PRACTICE',
    });
    unmount();
  });

  it('adopts a new room from the same-session parent handshake without recreating Pusher', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(mockPusherConstructor).not.toHaveBeenCalled();
    expect(localStorage.getItem('pusher-game-session')).toBeNull();
    expect(localStorage.getItem('pending-game-result') ?? '').not.toContain('legacy-token');

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: {
            gameId: 'sybil-slayer',
            sessionToken: 'token-1',
            sessionId: 'session-1',
            roomId: 'OLD-ROOM',
          },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(mockPusherConstructor).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith('private-game-session-session-1');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: {
            gameId: 'sybil-slayer',
            sessionToken: 'token-1',
            sessionId: 'session-1',
            roomId: 'NEW-ROOM',
          },
        },
      }));
    });

    expect(result.current.hasParentHandshake).toBe(true);
    expect(result.current.sessionData).toMatchObject({
      sessionId: 'session-1',
      roomId: 'NEW-ROOM',
    });
    expect(result.current.sessionData).not.toHaveProperty('sessionToken');
    expect(localStorage.getItem('pusher-game-session')).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_500);
    });
    expect(mockPusherConstructor).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).not.toHaveBeenCalled();

    unmount();
  });

  it('requests Pusher auth from the allowlisted parent once and never sends the bearer back', async () => {
    const consoleSnapshot = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: {
            gameId: 'sybil-slayer',
            sessionToken: 'memory-only-token',
            sessionId: 'session-1',
          },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    const pusherOptions = mockPusherConstructor.mock.calls[0][1] as {
      authorizer: (channel: { name: string }) => {
        authorize: (socketId: string, callback: jest.Mock) => void;
      };
    };
    const callback = jest.fn();
    postMessage.mockClear();
    pusherOptions.authorizer({ name: 'private-game-session-session-1' }).authorize(
      '123.456',
      callback,
    );
    const authRequest = postMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(authRequest).toMatchObject({
      type: 'PUSHER_AUTH_REQUEST',
      socketId: '123.456',
      channelName: 'private-game-session-session-1',
    });
    expect(authRequest).not.toHaveProperty('sessionToken');
    expect(result.current.sessionData).not.toHaveProperty('sessionToken');
    expect(JSON.stringify(consoleSnapshot.mock.calls)).not.toContain('memory-only-token');
    expect(JSON.stringify(localStorage)).not.toContain('memory-only-token');
    act(() => {
      expect(result.current.sendCheckpoint({ score: 10, gameTime: 500 })).toBe(true);
    });
    const checkpointPayload = mockChannelTrigger.mock.calls.find(
      ([eventName]) => eventName === 'client-checkpoint',
    )?.[1];
    expect(checkpointPayload).toMatchObject({ score: 10, gameTime: 500 });
    expect(checkpointPayload).not.toHaveProperty('sessionToken');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'PUSHER_AUTH_RESPONSE',
          authId: authRequest.authId,
          success: true,
          authData: { auth: 'signed-auth' },
        },
      }));
    });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(null, { auth: 'signed-auth' });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(callback).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('single-flights competition access and accepts it only from the trusted parent', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    postMessage.mockClear();
    let first!: Promise<Awaited<ReturnType<typeof result.current.requestCompetitionAccess>>>;
    let replay!: Promise<Awaited<ReturnType<typeof result.current.requestCompetitionAccess>>>;
    act(() => {
      first = result.current.requestCompetitionAccess();
      replay = result.current.requestCompetitionAccess();
    });
    expect(first).toBe(replay);
    const request = postMessage.mock.calls[0][0] as Record<string, unknown>;
    expect(request).toMatchObject({
      type: 'TREASURE_HUNT_COMPETITION_START_REQUEST',
      sessionId: 'session-1',
    });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://evil.example',
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
          requestId: request.requestId,
          sessionId: 'session-1',
          eligible: true,
          attemptId: 'attacker-attempt',
          seed: 'attacker-seed',
          alias: 'Attacker',
          status: 'active',
        },
      }));
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
          requestId: request.requestId,
          sessionId: 'session-1',
          eligible: true,
          attemptId: 'attempt-1',
          seed: 'server-seed',
          alias: 'Hunter-ABC123',
          status: 'active',
        },
      }));
    });

    await expect(first).resolves.toEqual({
      eligible: true,
      practice: false,
      sessionId: 'session-1',
      attemptId: 'attempt-1',
      seed: 'server-seed',
      alias: 'Hunter-ABC123',
      status: 'active',
    });
    await expect(replay).resolves.toMatchObject({ attemptId: 'attempt-1' });
    unmount();
  });

  it('treats a competition start timeout as uncertain instead of practice', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    let access!: Promise<Awaited<ReturnType<typeof result.current.requestCompetitionAccess>>>;
    act(() => {
      access = result.current.requestCompetitionAccess();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(12_000);
    });

    await expect(access).resolves.toEqual({
      eligible: false,
      practice: false,
      sessionId: 'session-1',
      reason: 'COMPETITION_REQUEST_TIMEOUT',
    });
    unmount();
  });

  it('preserves a trusted parent decision that an uncertain start must not become practice', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    let access!: Promise<Awaited<ReturnType<typeof result.current.requestCompetitionAccess>>>;
    act(() => {
      access = result.current.requestCompetitionAccess();
    });
    const request = postMessage.mock.calls.find(
      ([payload]) => payload?.type === 'TREASURE_HUNT_COMPETITION_START_REQUEST',
    )?.[0] as Record<string, unknown>;

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
          requestId: request.requestId,
          sessionId: 'session-1',
          eligible: false,
          practice: false,
          reason: 'COMPETITION_UNAVAILABLE',
        },
      }));
    });

    await expect(access).resolves.toEqual({
      eligible: false,
      practice: false,
      sessionId: 'session-1',
      reason: 'COMPETITION_UNAVAILABLE',
    });
    unmount();
  });

  it('aborts an unresolved competition start when the parent session changes', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    let access!: Promise<Awaited<ReturnType<typeof result.current.requestCompetitionAccess>>>;
    act(() => {
      access = result.current.requestCompetitionAccess();
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-2' },
        },
      }));
    });

    await expect(access).resolves.toEqual({
      eligible: false,
      practice: false,
      sessionId: 'session-1',
      reason: 'SESSION_CHANGED',
    });
    unmount();
  });

  it('persists a stable tokenless result and retries until the dapp ACK arrives', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    mockChannelTrigger.mockImplementation((eventName: string, payload: Record<string, unknown>) => {
      if (eventName === 'client-game-end') {
        expect(localStorage.getItem('pending-game-result')).toContain(String(payload.resultId));
      }
      return true;
    });
    act(() => {
      expect(result.current.sendGameEnd({
        finalScore: 99,
        gameTime: 1_000,
        competitionAttemptId: 'attempt-reload-safe',
      })).toBe(true);
    });

    const firstPayload = mockChannelTrigger.mock.calls.find(
      ([eventName]) => eventName === 'client-game-end',
    )?.[1] as Record<string, unknown>;
    expect(firstPayload.resultId).toEqual(expect.any(String));
    expect(firstPayload).not.toHaveProperty('sessionToken');
    expect(firstPayload).not.toHaveProperty('receipt');
    expect(firstPayload).toHaveProperty('competitionAttemptId', 'attempt-reload-safe');
    expect(localStorage.getItem('pending-game-result')).not.toContain('sessionToken');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });
    const resultPayloads = mockChannelTrigger.mock.calls
      .filter(([eventName]) => eventName === 'client-game-end')
      .map(([, payload]) => payload as Record<string, unknown>);
    expect(resultPayloads).toHaveLength(2);
    expect(resultPayloads[1].resultId).toBe(firstPayload.resultId);

    const ackHandler = mockChannelBind.mock.calls.find(
      ([eventName]) => eventName === 'client-game-end-ack',
    )?.[1] as ((data: { resultId: string }) => void) | undefined;
    expect(ackHandler).toBeDefined();
    act(() => ackHandler?.({ resultId: String(firstPayload.resultId) }));
    expect(localStorage.getItem('pending-game-result')).toContain(String(firstPayload.resultId));
    expect(result.current.hasPendingGameEnd).toBe(true);
    expect(mockChannelTrigger).toHaveBeenCalledWith(
      'client-game-end-ack-confirmed',
      { resultId: firstPayload.resultId },
    );

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_CLEAR',
          sessionId: 'session-1',
          resultId: firstPayload.resultId,
        },
      }));
    });
    expect(localStorage.getItem('pending-game-result')).toBeNull();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
      sessionId: 'session-1',
      resultId: firstPayload.resultId,
    }, 'https://hub.example');

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_CLEAR',
          sessionId: 'session-1',
          resultId: firstPayload.resultId,
        },
      }));
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
      sessionId: 'session-1',
      resultId: firstPayload.resultId,
    }, 'https://hub.example');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(30_000);
    });
    expect(mockChannelTrigger.mock.calls.filter(
      ([eventName]) => eventName === 'client-game-end',
    )).toHaveLength(2);
    unmount();
  });

  it('clears the active wallet session immediately and cancels stale game-end retries', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    mockChannelTrigger.mockImplementationOnce(() => {
      throw new Error('temporary channel failure');
    });
    act(() => {
      expect(result.current.sendGameEnd({ finalScore: 99, gameTime: 1_000 })).toBe(true);
    });
    expect(mockChannelTrigger).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pending-game-result')).toContain('"sessionId":"session-1"');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: { type: 'GAME_SESSION_CLEAR', sessionId: 'older-session' },
      }));
    });
    expect(result.current.sessionData?.sessionId).toBe('session-1');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: { type: 'GAME_SESSION_CLEAR', sessionId: 'session-1' },
      }));
    });
    expect(result.current.sessionData).toBeNull();
    expect(result.current.connectionState).toBe('disconnected');
    expect(mockDisconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10_000);
    });
    expect(mockChannelTrigger).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pending-game-result')).toContain('"sessionId":"session-1"');
    unmount();
  });

  it('never replays a persisted game result into a different session', async () => {
    localStorage.setItem('pending-game-result', JSON.stringify([{
      resultId: 'result-old-wallet',
      finalScore: 99,
      gameTime: 1_000,
      sessionId: 'session-from-old-wallet',
      timestamp: Date.now(),
      sessionToken: 'legacy-token',
    }]));
    const { unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: {
            gameId: 'sybil-slayer',
            sessionToken: 'memory-only-token',
            sessionId: 'session-1',
          },
        },
      }));
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });

    const subscriptionSucceeded = mockChannelBind.mock.calls.find(
      ([eventName]) => eventName === 'pusher:subscription_succeeded',
    )?.[1] as (() => void) | undefined;
    expect(subscriptionSucceeded).toBeDefined();
    act(() => subscriptionSucceeded?.());

    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end',
      expect.anything(),
    );
    expect(localStorage.getItem('pending-game-result')).toContain('result-old-wallet');
    expect(localStorage.getItem('pending-game-result')).not.toContain('legacy-token');
    unmount();
  });

  it('replays the same competition-authoritative result after a full hook reload until final clear', async () => {
    const first = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => jest.advanceTimersByTimeAsync(150));
    act(() => {
      expect(first.result.current.sendGameEnd({
        finalScore: 314,
        gameTime: 12_000,
        competitionAttemptId: 'attempt-before-reload',
      })).toBe(true);
    });
    const originalPayload = mockChannelTrigger.mock.calls.find(
      ([eventName]) => eventName === 'client-game-end',
    )?.[1] as Record<string, unknown>;
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY',
      sessionId: 'session-1',
      resultId: originalPayload.resultId,
      competitionAttemptId: 'attempt-before-reload',
      finalScore: 314,
      gameTime: 12_000,
    }, 'https://hub.example');
    first.unmount();
    await act(async () => jest.advanceTimersByTimeAsync(2_500));

    postMessage.mockClear();
    mockChannelTrigger.mockClear();
    mockChannelBind.mockClear();
    const reloaded = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-1' },
        },
      }));
    });
    await act(async () => jest.advanceTimersByTimeAsync(150));
    // Recovery does not wait for pusher:subscription_succeeded; an ended
    // GameSession is intentionally no longer authorized for that channel.
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY',
      sessionId: 'session-1',
      resultId: originalPayload.resultId,
      competitionAttemptId: 'attempt-before-reload',
      finalScore: 314,
      gameTime: 12_000,
    }, 'https://hub.example');
    expect(localStorage.getItem('pending-game-result')).toContain('attempt-before-reload');

    postMessage.mockClear();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK',
          sessionId: 'session-1',
          resultId: originalPayload.resultId,
        },
      }));
    });
    expect(mockChannelTrigger).toHaveBeenCalledWith(
      'client-game-end-ack-confirmed',
      { resultId: originalPayload.resultId },
    );
    expect(localStorage.getItem('pending-game-result')).toContain(String(originalPayload.resultId));
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY',
      sessionId: 'session-1',
      resultId: originalPayload.resultId,
      competitionAttemptId: 'attempt-before-reload',
      finalScore: 314,
      gameTime: 12_000,
    }, 'https://hub.example');
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK_CONFIRMED',
      sessionId: 'session-1',
      resultId: originalPayload.resultId,
    }, 'https://hub.example');

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_CLEAR',
          sessionId: 'session-1',
          resultId: originalPayload.resultId,
        },
      }));
    });
    expect(localStorage.getItem('pending-game-result')).toBeNull();
    expect(postMessage).toHaveBeenCalledWith({
      type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
      sessionId: 'session-1',
      resultId: originalPayload.resultId,
    }, 'https://hub.example');
    reloaded.unmount();
  });

  it('purges only expired/corrupt pending records and strips nested bearer-like metadata', () => {
    localStorage.setItem('pending-game-result', JSON.stringify([{
      resultId: 'result-expired-123',
      finalScore: 10,
      gameTime: 1_000,
      sessionId: 'session-expired',
      timestamp: Date.now() - (401 * 24 * 60 * 60 * 1_000),
    }, {
      resultId: 'result-current-123',
      finalScore: 20,
      gameTime: 2_000,
      sessionId: 'session-current',
      timestamp: Date.now(),
      metadata: {
        level: 2,
        hearts: 3,
        sessionToken: 'nested-bearer-must-disappear',
      },
    }]));

    const { unmount } = renderHook(() => usePusherConnection());
    const stored = localStorage.getItem('pending-game-result') ?? '';
    expect(stored).not.toContain('result-expired-123');
    expect(stored).toContain('result-current-123');
    expect(stored).not.toContain('nested-bearer-must-disappear');
    expect(JSON.parse(stored)[0].metadata).toEqual({ level: 2, hearts: 3 });
    unmount();
  });

  it('preserves old live results without letting eight other sessions block the current one', async () => {
    const existing = Array.from({ length: 8 }, (_, index) => ({
      resultId: `result-live-${index}`,
      finalScore: index,
      gameTime: index * 1_000,
      sessionId: `session-live-${index}`,
      timestamp: Date.now() - (8 - index),
    }));
    localStorage.setItem('pending-game-result', JSON.stringify(existing));
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-new' },
        },
      }));
    });
    await act(async () => jest.advanceTimersByTimeAsync(150));

    act(() => {
      expect(result.current.sendGameEnd({ finalScore: 99, gameTime: 9_000 })).toBe(true);
    });
    const stored = JSON.parse(localStorage.getItem('pending-game-result') ?? '[]');
    expect(stored).toHaveLength(9);
    expect(stored).toEqual(expect.arrayContaining(existing));
    expect(stored).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: 'session-new', finalScore: 99 }),
    ]));
    unmount();
  });

  it('surfaces storage quota failure and retries the exact in-memory result without allowing replay', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: window.parent,
        origin: 'https://hub.example',
        data: {
          type: 'GAME_SESSION_START',
          payload: { gameId: 'sybil-slayer', sessionId: 'session-quota' },
        },
      }));
    });
    await act(async () => jest.advanceTimersByTimeAsync(150));

    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === 'pending-game-result') throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    act(() => {
      expect(result.current.sendGameEnd({ finalScore: 404, gameTime: 4_000 })).toBe(false);
    });
    expect(result.current.hasPendingGameEnd).toBe(true);
    expect(result.current.gameEndPersistenceError).toContain('Reintentar guardado');
    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end',
      expect.anything(),
    );

    setItemSpy.mockRestore();
    act(() => {
      expect(result.current.retryGameEndPersistence()).toBe(true);
    });
    const stored = JSON.parse(localStorage.getItem('pending-game-result') ?? '[]');
    expect(stored).toEqual([
      expect.objectContaining({
        sessionId: 'session-quota',
        finalScore: 404,
        gameTime: 4_000,
      }),
    ]);
    expect(result.current.gameEndPersistenceError).toBeNull();
    expect(mockChannelTrigger).toHaveBeenCalledWith(
      'client-game-end',
      expect.objectContaining({ finalScore: 404, gameTime: 4_000 }),
    );
    unmount();
  });
});
