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
    postMessage = jest.spyOn(window, 'postMessage').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    process.env.NEXT_PUBLIC_DAPP_ORIGIN = originalParentOrigin;
  });

  it('adopts a new room from the same-session parent handshake without recreating Pusher', async () => {
    const { result, unmount } = renderHook(() => usePusherConnection());
    await act(async () => {
      await jest.advanceTimersByTimeAsync(150);
    });
    expect(mockPusherConstructor).not.toHaveBeenCalled();
    expect(localStorage.getItem('pusher-game-session')).toBeNull();
    expect(localStorage.getItem('pending-game-result')).not.toContain('legacy-token');

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
    expect(localStorage.getItem('pusher-game-session')).toBeNull();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_500);
    });
    expect(mockPusherConstructor).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).not.toHaveBeenCalled();

    unmount();
  });

  it('requests Pusher auth from the allowlisted parent once and never sends the bearer back', async () => {
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

  it('never replays a persisted game result into a different session', async () => {
    localStorage.setItem('pending-game-result', JSON.stringify({
      finalScore: 99,
      sessionId: 'session-from-old-wallet',
      sessionToken: 'legacy-token',
    }));
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
    expect(localStorage.getItem('pending-game-result')).toBeNull();
    unmount();
  });
});
