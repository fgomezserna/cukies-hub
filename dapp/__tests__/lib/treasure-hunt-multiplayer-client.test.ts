import {
  MultiplayerClientError,
  TreasureHuntMultiplayerController,
  createMultiplayerRoomCode,
  createTreasureHuntParentTransport,
  getHandshakeRoomCode,
  resolveParentOrigin,
  type MultiplayerTransport,
  type PublicMatch,
} from '../../../games/sybil-slayer/src/lib/multiplayer-client';

const PARENT_ORIGIN = 'https://hub.example';

function match(
  revision: number,
  status: PublicMatch['status'] = 'waiting',
  overrides: Partial<PublicMatch> = {},
): PublicMatch {
  return {
    matchId: 'match-1',
    roomCode: 'ROOM-1',
    gameId: 'treasure-hunt',
    mode: 'staging_unranked',
    rewardEligible: false,
    rulesVersion: 'v1',
    revision,
    status,
    config: {
      seed: status === 'waiting' ? null : 'shared-seed',
      startAt: status === 'waiting' ? null : 1_000,
      resumeAt: null,
      winDelta: 500,
      initialCountdownMs: 3_000,
      offlineThresholdMs: 3_000,
      reconnectBudgetMs: 15_000,
      reconnectCountdownMs: 3_000,
      eliminationResolutionDelayMs: 250,
      initialHearts: 3,
      maxHearts: 10,
      maxHeartsDelta: 1,
      maxScore: 10_000_000,
      maxElapsedMs: 86_400_000,
      scoreDeltaWindowMs: 1_000,
      maxScoreDeltaPerWindow: 1_000,
      snapshotTimeToleranceMs: 250,
    },
    players: [
      {
        playerId: 'player-1',
        slot: 0,
        score: 0,
        hearts: 3,
        elapsedMs: 0,
        lifecycle: 'waiting',
        presence: 'online',
        reconnectBudgetRemainingMs: 15_000,
      },
    ],
    suddenDeath: null,
    result: null,
    createdAt: 0,
    updatedAt: revision,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakeTransport implements MultiplayerTransport {
  join = jest.fn(async () => ({
    playerId: 'player-1',
    slot: 0 as const,
    inviteUrl: 'https://hub.example/games/sybil-slayer?room=ROOM-1',
    match: match(1),
  }));
  get = jest.fn(async () => ({ match: match(1) }));
  heartbeat = jest.fn(async () => ({ match: match(1) }));
  snapshot = jest.fn(async () => ({ match: match(1, 'running') }));
  cleanup = jest.fn();
}

describe('Treasure Hunt multiplayer parent transport', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('derives an exact parent origin and only falls back to NEXT_PUBLIC_DAPP_ORIGIN', () => {
    expect(resolveParentOrigin('https://hub.example/game?x=1', undefined)).toBe(PARENT_ORIGIN);
    expect(resolveParentOrigin('', 'https://fallback.example/path')).toBe('https://fallback.example');
    expect(() => resolveParentOrigin('', undefined)).toThrow(MultiplayerClientError);
    expect(() => resolveParentOrigin('data:text/plain,nope', undefined)).toThrow(
      'No se pudo determinar el origen seguro del hub',
    );
  });

  it('correlates responses and ignores a wrong source, origin or request id', async () => {
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const transport = createTreasureHuntParentTransport({
      windowObject: window,
      parentOrigin: PARENT_ORIGIN,
      requestIdFactory: () => 'crypto-request-1',
      timeoutMs: 2_000,
    });

    const request = transport.join('ROOM-1');
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_REQUEST',
        requestId: 'crypto-request-1',
        command: 'join',
        payload: { roomCode: 'ROOM-1' },
      },
      PARENT_ORIGIN,
    );

    const response = {
      type: 'TH_MULTIPLAYER_RESPONSE',
      requestId: 'crypto-request-1',
      success: true,
      data: { playerId: 'player-1', slot: 0, inviteUrl: 'https://invite', match: match(1) },
    };
    window.dispatchEvent(new MessageEvent('message', {
      source: { postMessage: jest.fn() } as unknown as Window,
      origin: PARENT_ORIGIN,
      data: response,
    }));
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://evil.example', data: response }));
    window.dispatchEvent(new MessageEvent('message', { source: window, origin: PARENT_ORIGIN, data: { ...response, requestId: 'other' } }));
    expect(await Promise.race([request.then(() => 'resolved'), Promise.resolve('pending')])).toBe('pending');

    window.dispatchEvent(new MessageEvent('message', { source: window.parent, origin: PARENT_ORIGIN, data: response }));
    await expect(request).resolves.toMatchObject({ playerId: 'player-1' });
    transport.cleanup();
  });

  it('times out pending requests and cleanup rejects every pending request', async () => {
    jest.useFakeTimers();
    jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    let requestId = 0;
    const transport = createTreasureHuntParentTransport({
      windowObject: window,
      parentOrigin: PARENT_ORIGIN,
      requestIdFactory: () => `request-${++requestId}`,
      timeoutMs: 500,
    });

    const timedOut = transport.get();
    jest.advanceTimersByTime(500);
    await expect(timedOut).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });

    const pendingA = transport.heartbeat();
    const pendingB = transport.snapshot({ seq: 1, score: 1, hearts: 3, elapsedMs: 1, lifecycle: 'playing' });
    transport.cleanup();
    await expect(pendingA).rejects.toMatchObject({ code: 'CLIENT_CLOSED' });
    await expect(pendingB).rejects.toMatchObject({ code: 'CLIENT_CLOSED' });
  });
});

describe('Treasure Hunt multiplayer controller', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('joins idempotently by room, stores canonical identity/invite and ignores stale revisions', async () => {
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({ transport });

    await Promise.all([controller.join('ROOM-1'), controller.join('ROOM-1')]);
    expect(transport.join).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      playerId: 'player-1',
      slot: 0,
      inviteUrl: expect.stringContaining('ROOM-1'),
      match: { revision: 1 },
    });

    controller.applyServerMatch(match(3, 'countdown'));
    controller.applyServerMatch(match(2, 'waiting'));
    expect(controller.getState().match?.revision).toBe(3);
    controller.dispose();
  });

  it('single-flights poll and heartbeat and cancels all scheduled work on reset', async () => {
    jest.useFakeTimers();
    const transport = new FakeTransport();
    const pendingGet = deferred<{ match: PublicMatch }>();
    const pendingHeartbeat = deferred<{ match: PublicMatch }>();
    transport.get.mockImplementation(() => pendingGet.promise);
    transport.heartbeat.mockImplementation(() => pendingHeartbeat.promise);
    const controller = new TreasureHuntMultiplayerController({
      transport,
      pollIntervalMs: 600,
      heartbeatIntervalMs: 1_500,
    });
    await controller.join('ROOM-1');

    jest.advanceTimersByTime(3_000);
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(transport.heartbeat).not.toHaveBeenCalled();

    pendingGet.resolve({ match: match(2) });
    await Promise.resolve();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(3_000);
    expect(transport.heartbeat).toHaveBeenCalledTimes(1);

    const getCallsBeforeReset = transport.get.mock.calls.length;
    controller.reset();
    pendingHeartbeat.resolve({ match: match(2) });
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    expect(transport.get).toHaveBeenCalledTimes(getCallsBeforeReset);
    expect(transport.heartbeat).toHaveBeenCalledTimes(1);
    expect(controller.getState().match).toBeNull();
    controller.dispose();
  });

  it('does not let a late snapshot response repopulate state after reset', async () => {
    const transport = new FakeTransport();
    const pendingSnapshot = deferred<{ match: PublicMatch }>();
    transport.snapshot.mockImplementation(() => pendingSnapshot.promise);
    const controller = new TreasureHuntMultiplayerController({ transport, now: () => 2_000 });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));
    controller.publishSnapshot({ score: 1, hearts: 3, lifecycle: 'playing' });
    expect(transport.snapshot).toHaveBeenCalledTimes(1);

    controller.reset();
    pendingSnapshot.resolve({ match: match(99, 'finished') });
    await Promise.resolve();
    await Promise.resolve();
    expect(controller.getState()).toEqual(expect.objectContaining({ match: null, playerId: null }));
    controller.dispose();
  });

  it('publishes whitelisted, sequenced, deduplicated snapshots only while the server is active', async () => {
    jest.useFakeTimers();
    let now = 2_000;
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({
      transport,
      now: () => now,
      snapshotThrottleMs: 250,
    });
    await controller.join('ROOM-1');

    controller.publishSnapshot({ score: 7, hearts: 3, lifecycle: 'playing' });
    expect(transport.snapshot).not.toHaveBeenCalled();

    controller.applyServerMatch(match(2, 'running'));
    controller.publishSnapshot({ score: 7, hearts: 3, lifecycle: 'playing' });
    await Promise.resolve();
    expect(transport.snapshot).toHaveBeenCalledTimes(1);
    expect(transport.snapshot).toHaveBeenCalledWith({
      seq: 1,
      score: 7,
      hearts: 3,
      elapsedMs: 1_000,
      lifecycle: 'playing',
    });
    const sentSnapshot = (transport.snapshot as jest.Mock).mock.calls[0][0] as object;
    expect(Object.keys(sentSnapshot)).toEqual([
      'seq',
      'score',
      'hearts',
      'elapsedMs',
      'lifecycle',
    ]);

    controller.publishSnapshot({ score: 7, hearts: 3, lifecycle: 'playing' });
    now += 500;
    jest.advanceTimersByTime(500);
    await Promise.resolve();
    expect(transport.snapshot).toHaveBeenCalledTimes(1);

    controller.applyServerMatch(match(3, 'paused_reconnect'));
    controller.publishSnapshot({ score: 8, hearts: 3, lifecycle: 'playing' });
    jest.advanceTimersByTime(1_000);
    expect(transport.snapshot).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('sets the shared seed once before the initial start and emits a separate resume signal', async () => {
    const calls: string[] = [];
    let lastStartSignal = 0;
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({
      transport,
      onSeed: (seed) => calls.push(`seed:${seed}`),
      onState: (state) => {
        if (state.startSignal > lastStartSignal) {
          calls.push('start');
          lastStartSignal = state.startSignal;
        }
      },
    });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'countdown'));
    controller.applyServerMatch(match(3, 'running'));
    controller.applyServerMatch(match(4, 'running'));
    expect(calls.slice(-2)).toEqual(['seed:shared-seed', 'start']);
    expect(calls.filter((call) => call.startsWith('seed:'))).toHaveLength(1);

    controller.applyServerMatch(match(5, 'paused_reconnect'));
    controller.applyServerMatch(match(6, 'countdown', {
      config: { ...match(6, 'countdown').config, resumeAt: 5_000 },
    }));
    controller.applyServerMatch(match(7, 'running'));
    expect(controller.getState().resumeSignal).toBe(1);
    expect(calls.filter((call) => call.startsWith('seed:'))).toHaveLength(1);
    controller.dispose();
  });
});

describe('multiplayer client helpers', () => {
  it('takes invitation rooms only from the trusted parent handshake shape', () => {
    expect(getHandshakeRoomCode({ roomId: ' INVITED ' })).toBe('INVITED');
    expect(getHandshakeRoomCode({ roomId: '' })).toBeNull();
    expect(getHandshakeRoomCode({ room: 'QUERY-SPOOF' } as never)).toBeNull();
  });

  it('creates room codes using Web Crypto without Math.random', () => {
    const random = jest.spyOn(Math, 'random');
    expect(createMultiplayerRoomCode({ randomUUID: () => 'uuid-123' } as Crypto)).toBe('room-uuid-123');
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
