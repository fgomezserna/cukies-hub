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
    jest.spyOn(window, 'postMessage').mockImplementation(() => undefined);
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
    expect(JSON.parse(localStorage.getItem('pusher-game-session') ?? '{}')).toMatchObject({
      sessionId: 'session-1',
      roomId: 'NEW-ROOM',
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync(2_500);
    });
    expect(mockPusherConstructor).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).not.toHaveBeenCalled();

    unmount();
  });
});
