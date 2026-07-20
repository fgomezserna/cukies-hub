import { act, renderHook } from '@testing-library/react';

import { usePusherGameConnection } from '@/hooks/use-pusher-game-connection';
import {
  routeGameCheckpoint,
  routeGameEnd,
} from '@/lib/treasure-hunt-competition/client';

const mockChannelBindings = new Map<string, (data: any) => unknown>();
const mockChannelTrigger = jest.fn((_eventName: string, _payload?: any) => true);
const mockChannelBind = jest.fn((eventName: string, handler: (data: any) => unknown) => {
  mockChannelBindings.set(eventName, handler);
});
const mockUnsubscribe = jest.fn();
const mockDisconnect = jest.fn();
const mockSubscribe = jest.fn(() => ({
  name: 'private-game-session-session-1',
  state: 'subscribed',
  bind: mockChannelBind,
  trigger: mockChannelTrigger,
}));

jest.mock('pusher-js', () => class MockPusher {
  connection = { state: 'connected' };
  subscribe = mockSubscribe;
  unsubscribe = mockUnsubscribe;
  disconnect = mockDisconnect;
});

jest.mock('@/lib/treasure-hunt-competition/client', () => ({
  routeGameCheckpoint: jest.fn(),
  routeGameEnd: jest.fn(),
}));

const mockRouteGameEnd = routeGameEnd as jest.MockedFunction<typeof routeGameEnd>;
const mockRouteGameCheckpoint = routeGameCheckpoint as jest.MockedFunction<
  typeof routeGameCheckpoint
>;

describe('usePusherGameConnection game-end ACK', () => {
  const authData = {
    isAuthenticated: true,
    user: { id: 'user-1' },
    sessionToken: 'session-token',
  };
  const onSessionEnd = jest.fn();
  const options = {
    gameId: 'sybil-slayer',
    onSessionEnd,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockChannelBindings.clear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits a tokenless ACK only after the backend accepts the result and deduplicates retries', async () => {
    let resolveBackend!: (value: any) => void;
    let markerCalls = 0;
    const onGameEndPersisted = jest.fn(() => {
      markerCalls += 1;
      if (markerCalls === 1) {
        expect(mockChannelTrigger).not.toHaveBeenCalledWith(
          'client-game-end-ack',
          expect.anything(),
        );
      }
      return true;
    });
    mockRouteGameEnd.mockReturnValue(new Promise((resolve) => {
      resolveBackend = resolve;
    }));

    const { unmount } = renderHook(() => usePusherGameConnection(
      'session-1',
      authData,
      { ...options, onGameEndPersisted },
    ));
    const handler = mockChannelBindings.get('client-game-end');
    expect(handler).toBeDefined();

    const gameEnd = {
      resultId: 'result-stable-123',
      finalScore: 777,
      gameTime: 30_000,
    };
    let processing!: Promise<unknown>;
    act(() => {
      processing = Promise.resolve(handler?.(gameEnd));
    });

    expect(mockRouteGameEnd).toHaveBeenCalledWith(expect.objectContaining({
      gameSessionId: 'session-1',
      sessionToken: 'session-token',
      gameEnd,
    }));
    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end-ack',
      expect.anything(),
    );

    await act(async () => {
      resolveBackend({
        source: 'competition',
        success: true,
        finalScore: 777,
        isValid: true,
        result: { status: 'valid' },
      });
      await processing;
    });

    expect(mockChannelTrigger).toHaveBeenCalledWith('client-game-end-ack', {
      resultId: 'result-stable-123',
    });
    expect(onGameEndPersisted).toHaveBeenCalledWith({
      resultId: 'result-stable-123',
      clearConfirmationRequired: true,
    });
    const acknowledgement = mockChannelTrigger.mock.calls.find(
      ([eventName]) => eventName === 'client-game-end-ack',
    )?.[1];
    expect(acknowledgement).not.toHaveProperty('sessionToken');
    expect(acknowledgement).not.toHaveProperty('receipt');
    expect(onSessionEnd).not.toHaveBeenCalled();

    const ackConfirmed = mockChannelBindings.get('client-game-end-ack-confirmed');
    await act(async () => {
      await ackConfirmed?.({ resultId: 'result-stable-123' });
    });
    expect(onSessionEnd).toHaveBeenCalledWith({
      resultId: 'result-stable-123',
      finalScore: 777,
      isValid: true,
      source: 'competition',
      status: 'valid',
      clearConfirmationRequired: true,
    });

    await act(async () => {
      await handler?.(gameEnd);
    });
    expect(mockRouteGameEnd).toHaveBeenCalledTimes(1);
    expect(mockChannelTrigger.mock.calls.filter(
      ([eventName]) => eventName === 'client-game-end-ack',
    )).toHaveLength(2);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('does not ACK a backend failure and accepts the same result retry later', async () => {
    mockRouteGameEnd
      .mockResolvedValueOnce({
        source: 'legacy',
        success: false,
        finalScore: 500,
        isValid: false,
        result: { error: 'temporary failure' },
      })
      .mockResolvedValueOnce({
        source: 'legacy',
        success: true,
        finalScore: 500,
        isValid: true,
        result: { success: true },
      });

    const { unmount } = renderHook(() => usePusherGameConnection(
      'session-1',
      authData,
      options,
    ));
    const handler = mockChannelBindings.get('client-game-end');
    const gameEnd = {
      resultId: 'result-retry-456',
      finalScore: 500,
      gameTime: 20_000,
    };

    await act(async () => {
      await handler?.(gameEnd);
    });
    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end-ack',
      expect.anything(),
    );
    expect(onSessionEnd).not.toHaveBeenCalled();

    await act(async () => {
      await handler?.(gameEnd);
    });
    expect(mockRouteGameEnd).toHaveBeenCalledTimes(2);
    expect(mockChannelTrigger).toHaveBeenCalledWith('client-game-end-ack', {
      resultId: 'result-retry-456',
    });
    expect(onSessionEnd).not.toHaveBeenCalled();
    const ackConfirmed = mockChannelBindings.get('client-game-end-ack-confirmed');
    await act(async () => {
      await ackConfirmed?.({ resultId: 'result-retry-456' });
    });
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    unmount();
  });

  it('withholds modern ACK until its reload-safe clear marker can be persisted', async () => {
    mockRouteGameEnd.mockResolvedValue({
      source: 'legacy',
      success: true,
      finalScore: 500,
      isValid: true,
      result: { success: true },
    });
    const onGameEndPersisted = jest.fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const { unmount } = renderHook(() => usePusherGameConnection(
      'session-1',
      authData,
      { ...options, onGameEndPersisted },
    ));
    const handler = mockChannelBindings.get('client-game-end');
    const modernPracticeResult = {
      resultId: 'result-marker-retry',
      finalScore: 500,
      gameTime: 20_000,
    };

    await act(async () => {
      await handler?.(modernPracticeResult);
    });
    expect(mockRouteGameEnd).toHaveBeenCalledTimes(1);
    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end-ack',
      expect.anything(),
    );

    await act(async () => {
      await handler?.(modernPracticeResult);
    });
    expect(mockRouteGameEnd).toHaveBeenCalledTimes(1);
    expect(onGameEndPersisted).toHaveBeenCalledTimes(2);
    expect(mockChannelTrigger).toHaveBeenCalledWith('client-game-end-ack', {
      resultId: 'result-marker-retry',
    });
    unmount();
  });

  it('routes an old iframe payload once with a deterministic legacy id and completes without ACK', async () => {
    mockRouteGameEnd.mockResolvedValue({
      source: 'legacy',
      success: true,
      finalScore: 321,
      isValid: true,
      result: { success: true },
    });
    const { unmount } = renderHook(() => usePusherGameConnection(
      'session-1',
      authData,
      options,
    ));
    const handler = mockChannelBindings.get('client-game-end');
    const legacyPayload = { finalScore: 321, gameTime: 12_000 };

    await act(async () => {
      await handler?.(legacyPayload);
      await handler?.(legacyPayload);
    });

    expect(mockRouteGameEnd).toHaveBeenCalledTimes(1);
    expect(mockRouteGameEnd).toHaveBeenCalledWith(expect.objectContaining({
      gameSessionId: 'session-1',
      gameEnd: legacyPayload,
    }));
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith({
      resultId: 'legacy-session-1',
      finalScore: 321,
      isValid: true,
      source: 'legacy',
      status: null,
      clearConfirmationRequired: false,
    });
    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end-ack',
      expect.anything(),
    );
    unmount();
  });

  it('never treats a declared competition result without resultId as legacy rollout traffic', async () => {
    const { unmount } = renderHook(() => usePusherGameConnection(
      'session-1',
      authData,
      options,
    ));
    const handler = mockChannelBindings.get('client-game-end');

    await act(async () => {
      await handler?.({
        finalScore: 321,
        gameTime: 12_000,
        competitionAttemptId: 'attempt-declared',
      });
    });

    expect(mockRouteGameEnd).not.toHaveBeenCalled();
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(mockChannelTrigger).not.toHaveBeenCalledWith(
      'client-game-end-ack',
      expect.anything(),
    );
    unmount();
  });

  it('treats a terminal checkpoint arriving after game-end as an expected transport race', async () => {
    mockRouteGameCheckpoint.mockRejectedValue({
      name: 'CompetitionClientError',
      code: 'ATTEMPT_NOT_ACTIVE',
      status: 409,
    });
    const { unmount } = renderHook(() => usePusherGameConnection(
      'session-1',
      authData,
      options,
    ));
    const handler = mockChannelBindings.get('client-checkpoint');

    await act(async () => {
      await handler?.({ score: 0, gameTime: 30_000, timestamp: Date.now() });
    });

    expect(mockRouteGameCheckpoint).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalledWith(
      '❌ [PUSHER] Error processing checkpoint:',
      expect.anything(),
    );
    unmount();
  });
});
