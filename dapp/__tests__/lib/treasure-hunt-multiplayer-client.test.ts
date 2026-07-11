import {
  MultiplayerClientError,
  TreasureHuntMultiplayerController,
  canResumeLocalPlayerInSuddenDeath,
  createMultiplayerRoomCode,
  createTreasureHuntParentTransport,
  deriveCanonicalDeadlineRuntimeTransition,
  deriveMultiplayerRuntimeHydration,
  getHandshakeRoomCode,
  resolveParentOrigin,
  type MultiplayerTransport,
  type PublicMatch,
} from '../../../games/sybil-slayer/src/lib/multiplayer-client';
import {
  buildFrameAncestorsPolicy,
  resolveConfiguredParentOrigin,
} from '../../../games/sybil-slayer/src/lib/parent-origin';
import {
  getSuddenDeathObjectiveCopy,
  isTreasureHuntMatchNonTerminal,
  isTreasureHuntMultiplayerEnabled,
  shouldBlockLocalGameControls,
} from '../../../games/sybil-slayer/src/lib/multiplayer-feature';
import { InMemoryMatchRepository } from '@/lib/treasure-hunt-multiplayer';
import { TreasureHuntMultiplayerService } from '@/lib/treasure-hunt-multiplayer/service';

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
      lobbyExpiresAt: 30_000,
      roundEndsAt: status === 'waiting' ? null : 31_000,
      suddenDeathEndsAt: status === 'sudden_death' ? 91_000 : null,
      resumeAt: null,
      resumeEpoch: 0,
      winDelta: 500,
      initialCountdownMs: 3_000,
      lobbyTimeoutMs: 30_000,
      roundDurationMs: 30_000,
      suddenDeathTimeoutMs: 60_000,
      terminalRetentionMs: 604_800_000,
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
        seq: 0,
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
  forfeit = jest.fn(async () => ({ match: match(2, 'finished') }));
  release = jest.fn(async () => ({ released: true, match: null }));
  reset = jest.fn(async () => undefined);
  cancelPending = jest.fn();
  cleanup = jest.fn();
}

describe('Treasure Hunt multiplayer parent transport', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('derives an exact parent origin and only falls back to NEXT_PUBLIC_DAPP_ORIGIN', () => {
    expect(resolveParentOrigin('https://hub.example/game?x=1', PARENT_ORIGIN, undefined, 'production')).toBe(PARENT_ORIGIN);
    expect(resolveParentOrigin('https://evil.example/embed', PARENT_ORIGIN, undefined, 'production')).toBe(PARENT_ORIGIN);
    expect(resolveParentOrigin('', 'https://fallback.example/path', undefined, 'production')).toBe('https://fallback.example');
    expect(resolveConfiguredParentOrigin(
      'https://secondary.example/game',
      PARENT_ORIGIN,
      'https://secondary.example/path',
      'production',
    )).toBe('https://secondary.example');
    expect(() => resolveParentOrigin('', undefined, undefined, 'production')).toThrow(MultiplayerClientError);
    expect(() => resolveParentOrigin('data:text/plain,nope', undefined, undefined, 'production')).toThrow(
      'No se pudo determinar el origen seguro del hub',
    );
  });

  it('builds frame-ancestors from configured origins and permits localhost only outside production', () => {
    expect(buildFrameAncestorsPolicy('production', PARENT_ORIGIN, 'http://localhost:3000'))
      .toBe("'self' https://hub.example");
    expect(buildFrameAncestorsPolicy('development', PARENT_ORIGIN)).toContain('http://localhost:*');
    expect(buildFrameAncestorsPolicy('development', PARENT_ORIGIN)).toContain(PARENT_ORIGIN);
  });

  it('correlates responses and ignores a wrong source, origin or request id', async () => {
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const transport = createTreasureHuntParentTransport({
      windowObject: window,
      fallbackOrigin: PARENT_ORIGIN,
      nodeEnv: 'production',
      clientInstanceId: 'client-1',
      requestIdFactory: () => 'crypto-request-1',
      timeoutMs: 2_000,
    });

    const request = transport.join('ROOM-1');
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_REQUEST',
        clientInstanceId: 'client-1',
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
      fallbackOrigin: PARENT_ORIGIN,
      nodeEnv: 'production',
      clientInstanceId: 'client-1',
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

  it('sends reset as a correlated empty-payload command', async () => {
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const transport = createTreasureHuntParentTransport({
      windowObject: window,
      fallbackOrigin: PARENT_ORIGIN,
      nodeEnv: 'production',
      clientInstanceId: 'client-1',
      requestIdFactory: () => 'reset-request',
    });

    const reset = transport.reset();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_REQUEST',
        clientInstanceId: 'client-1',
        requestId: 'reset-request',
        command: 'reset',
        payload: {},
      },
      PARENT_ORIGIN,
    );
    window.dispatchEvent(new MessageEvent('message', {
      source: window.parent,
      origin: PARENT_ORIGIN,
      data: {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'reset-request',
        success: true,
        data: { reset: true },
      },
    }));
    await expect(reset).resolves.toBeUndefined();
    transport.cleanup();
  });

  it('sends release with the same client instance as every other command', async () => {
    const postMessage = jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const transport = createTreasureHuntParentTransport({
      windowObject: window,
      fallbackOrigin: PARENT_ORIGIN,
      nodeEnv: 'production',
      clientInstanceId: 'iframe-instance-1',
      requestIdFactory: () => 'release-request',
    });

    const release = transport.release();
    expect(postMessage).toHaveBeenCalledWith(
      {
        type: 'TH_MULTIPLAYER_REQUEST',
        clientInstanceId: 'iframe-instance-1',
        requestId: 'release-request',
        command: 'release',
        payload: {},
      },
      PARENT_ORIGIN,
    );
    window.dispatchEvent(new MessageEvent('message', {
      source: window.parent,
      origin: PARENT_ORIGIN,
      data: {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'release-request',
        success: true,
        data: { released: true, match: null },
      },
    }));
    await expect(release).resolves.toEqual({ released: true, match: null });
    transport.cleanup();
  });

  it('rejects malformed release responses from the parent bridge', async () => {
    jest.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const transport = createTreasureHuntParentTransport({
      windowObject: window,
      fallbackOrigin: PARENT_ORIGIN,
      nodeEnv: 'production',
      clientInstanceId: 'iframe-instance-1',
      requestIdFactory: () => 'bad-release-response',
    });

    const release = transport.release();
    window.dispatchEvent(new MessageEvent('message', {
      source: window.parent,
      origin: PARENT_ORIGIN,
      data: {
        type: 'TH_MULTIPLAYER_RESPONSE',
        requestId: 'bad-release-response',
        success: true,
        data: { released: 'yes', match: null },
      },
    }));
    await expect(release).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    transport.cleanup();
  });
});

describe('Treasure Hunt multiplayer controller', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets pristine local state without requiring a parent bridge request', async () => {
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({ transport });

    await expect(controller.reset()).resolves.toBeUndefined();
    expect(transport.reset).not.toHaveBeenCalled();
    expect(transport.cancelPending).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual(expect.objectContaining({ match: null, roomCode: null }));
    controller.dispose();
  });

  it('releases a parent session exactly once until local reset', async () => {
    const transport = new FakeTransport();
    transport.join.mockRejectedValue(new MultiplayerClientError('MATCH_FULL', 'full'));
    const controller = new TreasureHuntMultiplayerController({ transport });

    await expect(controller.join('ROOM-1')).rejects.toMatchObject({ code: 'MATCH_FULL' });
    await expect(controller.release()).resolves.toBe(true);
    await expect(controller.release()).resolves.toBe(true);
    expect(transport.release).toHaveBeenCalledTimes(1);

    await controller.reset();
    await expect(controller.release()).resolves.toBe(false);
    await expect(controller.join('ROOM-2')).rejects.toMatchObject({ code: 'MATCH_FULL' });
    await expect(controller.release()).resolves.toBe(true);
    expect(transport.release).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it('keeps released:false retryable and only latches after canonical release success', async () => {
    const transport = new FakeTransport();
    transport.join.mockRejectedValue(new MultiplayerClientError('MATCH_FULL', 'full'));
    transport.release
      .mockResolvedValueOnce({ released: false, match: null })
      .mockResolvedValueOnce({ released: true, match: null });
    const controller = new TreasureHuntMultiplayerController({ transport });

    await expect(controller.join('ROOM-1')).rejects.toMatchObject({ code: 'MATCH_FULL' });
    await expect(controller.release()).resolves.toBe(false);
    await expect(controller.release()).resolves.toBe(true);
    await expect(controller.release()).resolves.toBe(true);
    expect(transport.release).toHaveBeenCalledTimes(2);
    controller.dispose();
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

  it.each([Number.NaN, -2, 1.5])(
    'rejects a canonical player snapshot with unsafe sequence %p',
    async (unsafeSequence) => {
      const transport = new FakeTransport();
      transport.join.mockResolvedValueOnce({
        playerId: 'player-1',
        slot: 0,
        inviteUrl: 'https://hub.example/?room=ROOM-1',
        match: match(1, 'waiting', {
          players: [{ ...match(1).players[0], seq: unsafeSequence }],
        }),
      });
      const controller = new TreasureHuntMultiplayerController({ transport });

      await expect(controller.join('ROOM-1')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
      expect(controller.getState().match).toBeNull();
      controller.dispose();
    },
  );

  it('accepts the real service projection with the initial -1 snapshot sentinel', async () => {
    const repository = new InMemoryMatchRepository();
    const service = new TreasureHuntMultiplayerService(repository, {
      clock: { now: () => 100 },
      idFactory: {
        createMatchId: () => 'real-match-1',
        createPlayerId: () => 'real-player-1',
        createSeed: () => 'real-seed-1',
      },
    });
    const created = await service.createOrJoin({
      roomCode: 'REAL-ROOM',
      userId: 'real-user-1',
      gameSessionId: 'real-session-1',
      clientInstanceId: 'real-client-1',
    });
    expect(created.match.players[0].seq).toBe(-1);
    expect(created.slot).toBe(0);

    const transport = new FakeTransport();
    transport.join.mockResolvedValueOnce({
      playerId: created.playerId,
      slot: 0,
      inviteUrl: 'https://hub.example/?room=REAL-ROOM',
      match: created.match,
    });
    const controller = new TreasureHuntMultiplayerController({ transport });

    await expect(controller.join('REAL-ROOM')).resolves.toBeUndefined();
    expect(controller.getState().match?.players[0]).toMatchObject({
      playerId: created.playerId,
      seq: -1,
      lifecycle: 'waiting',
    });
    controller.dispose();
  });

  it('keeps heartbeat running while a GET remains pending beyond offlineThreshold', async () => {
    jest.useFakeTimers();
    const transport = new FakeTransport();
    const pendingGet = deferred<{ match: PublicMatch }>();
    transport.get.mockImplementation(() => pendingGet.promise);
    const controller = new TreasureHuntMultiplayerController({
      transport,
      pollIntervalMs: 600,
      heartbeatIntervalMs: 1_000,
    });
    await controller.join('ROOM-1');

    await jest.advanceTimersByTimeAsync(3_500);
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(transport.heartbeat.mock.calls.length).toBeGreaterThanOrEqual(3);

    const heartbeatCallsBeforeReset = transport.heartbeat.mock.calls.length;
    pendingGet.resolve({ match: match(2) });
    const getCallsBeforeReset = transport.get.mock.calls.length;
    controller.applyServerMatch(match(3, 'finished'));
    await controller.reset();
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    expect(transport.get).toHaveBeenCalledTimes(getCallsBeforeReset);
    expect(transport.heartbeat).toHaveBeenCalledTimes(heartbeatCallsBeforeReset);
    expect(controller.getState().match).toBeNull();
    controller.dispose();
  });

  it('keeps local state until bridge reset ACK, then joins a second room and ignores a late old join', async () => {
    const transport = new FakeTransport();
    const oldJoin = deferred<{
      playerId: string;
      slot: 0;
      inviteUrl: string;
      match: PublicMatch;
    }>();
    const bridgeReset = deferred<undefined>();
    transport.join
      .mockImplementationOnce(() => oldJoin.promise)
      .mockResolvedValueOnce({
        playerId: 'player-1',
        slot: 0,
        inviteUrl: 'https://hub.example/?room=ROOM-2',
        match: match(1, 'waiting', { roomCode: 'ROOM-2', matchId: 'match-2' }),
      });
    transport.reset.mockImplementationOnce(() => bridgeReset.promise);
    const controller = new TreasureHuntMultiplayerController({ transport });

    const oldJoinPromise = controller.join('ROOM-OLD');
    expect(transport.join).toHaveBeenCalledTimes(1);
    const reset = controller.reset();
    const nextJoin = controller.join('ROOM-2');
    await Promise.resolve();

    expect(transport.reset).toHaveBeenCalledTimes(1);
    expect(transport.cancelPending).not.toHaveBeenCalled();
    expect(transport.join).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toMatchObject({
      roomCode: 'ROOM-OLD',
      joining: true,
    });

    bridgeReset.resolve(undefined);
    await reset;
    await nextJoin;
    expect(transport.cancelPending).toHaveBeenCalledTimes(1);
    expect(transport.join).toHaveBeenCalledTimes(2);

    oldJoin.resolve({
      playerId: 'old-player',
      slot: 0,
      inviteUrl: 'https://hub.example/?room=ROOM-OLD',
      match: match(99, 'waiting', { roomCode: 'ROOM-OLD', matchId: 'old-match' }),
    });
    await oldJoinPromise;
    expect(controller.getState()).toMatchObject({
      roomCode: 'ROOM-2',
      playerId: 'player-1',
      match: { matchId: 'match-2' },
    });
    controller.dispose();
  });

  it.each(['MATCH_ACTIVE', 'REQUEST_TIMEOUT'])(
    'preserves canonical state and seed when bridge reset rejects with %s',
    async (code) => {
      const transport = new FakeTransport();
      const onSeed = jest.fn();
      transport.reset.mockRejectedValueOnce(
        new MultiplayerClientError(code, 'bridge reset rejected'),
      );
      const controller = new TreasureHuntMultiplayerController({ transport, onSeed });
      await controller.join('ROOM-1');
      controller.applyServerMatch(match(2, 'running'));
      controller.applyServerMatch(match(3, 'finished'));
      const beforeReset = controller.getState();

      await expect(controller.reset()).rejects.toMatchObject({ code });
      expect(transport.cancelPending).not.toHaveBeenCalled();
      expect(controller.getState()).toEqual(beforeReset);

      controller.applyServerMatch(match(4, 'running', {
        config: { ...match(4, 'running').config, seed: 'untrusted-replacement-seed' },
      }));
      expect(controller.getState().match?.config.seed).toBe('shared-seed');
      expect(onSeed).toHaveBeenCalledTimes(1);
      controller.dispose();
    },
  );

  it('rejects local reset while the canonical match is active', async () => {
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({ transport });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));

    await expect(controller.reset()).rejects.toMatchObject({ code: 'MATCH_ACTIVE' });
    expect(transport.reset).not.toHaveBeenCalled();
    expect(controller.getState().match?.status).toBe('running');
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

    controller.applyServerMatch(match(3, 'finished'));
    await controller.reset();
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
      snapshotThrottleMs: 500,
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

  it('never lets the client publish the server-owned finished lifecycle', async () => {
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({
      transport,
      now: () => 5_000,
      snapshotThrottleMs: 0,
    });

    await controller.join('room-a');
    controller.applyServerMatch(match(2, 'running'));
    controller.publishSnapshot({ score: 77, hearts: 2, lifecycle: 'finished' });
    await Promise.resolve();

    expect(transport.snapshot).toHaveBeenCalledWith(
      expect.objectContaining({ score: 77, hearts: 2, lifecycle: 'playing' }),
    );
  });

  it('continues from the canonical snapshot sequence and rehydrates local state', async () => {
    const transport = new FakeTransport();
    transport.join.mockResolvedValueOnce({
      playerId: 'player-1',
      slot: 0,
      inviteUrl: 'https://hub.example/?room=ROOM-1',
      match: match(7, 'running', {
        players: [{
          ...match(7, 'running').players[0],
          seq: 41,
          score: 900,
          hearts: 2,
          elapsedMs: 12_000,
          lifecycle: 'playing',
        }],
      }),
    });
    const controller = new TreasureHuntMultiplayerController({
      transport,
      now: () => 13_000,
    });
    await controller.join('ROOM-1');

    expect(controller.getState().match?.players[0]).toMatchObject({
      seq: 41,
      score: 900,
      hearts: 2,
      elapsedMs: 12_000,
      lifecycle: 'playing',
    });
    expect(deriveMultiplayerRuntimeHydration(
      controller.getState().match!.players[0],
      20_000,
      30,
    )).toEqual({
      status: 'playing',
      score: 900,
      hearts: 2,
      elapsedMs: 12_000,
      gameStartTime: 8_000,
      timer: 18,
      gameOverReason: undefined,
    });
    controller.publishSnapshot({ score: 901, hearts: 2, lifecycle: 'playing' });
    await Promise.resolve();
    expect(transport.snapshot).toHaveBeenCalledWith(expect.objectContaining({
      seq: 42,
      score: 901,
      hearts: 2,
      elapsedMs: 12_000,
    }));
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
      config: { ...match(6, 'countdown').config, resumeAt: 5_000, resumeEpoch: 1 },
    }));
    controller.applyServerMatch(match(7, 'running', {
      config: { ...match(7, 'running').config, resumeEpoch: 1 },
    }));
    expect(controller.getState().resumeSignal).toBe(1);
    expect(calls.filter((call) => call.startsWith('seed:'))).toHaveLength(1);
    controller.dispose();
  });

  it('emits one resume signal when polling skips the reconnect countdown state', async () => {
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({ transport });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));
    controller.applyServerMatch(match(3, 'paused_reconnect'));
    controller.applyServerMatch(match(4, 'running', {
      config: { ...match(4, 'running').config, resumeEpoch: 1 },
    }));
    controller.applyServerMatch(match(5, 'running', {
      config: { ...match(5, 'running').config, resumeEpoch: 1 },
    }));
    expect(controller.getState().resumeSignal).toBe(1);

    controller.applyServerMatch(match(6, 'paused_reconnect'));
    controller.applyServerMatch(match(7, 'running', {
      config: { ...match(7, 'running').config, resumeEpoch: 2 },
    }));
    expect(controller.getState().resumeSignal).toBe(2);
    controller.dispose();
  });

  it('emits resume from a monotonic epoch even when every intermediate pause state was skipped', async () => {
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({ transport });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));
    controller.applyServerMatch(match(3, 'running', {
      config: { ...match(3, 'running').config, resumeEpoch: 1 },
    }));
    controller.applyServerMatch(match(4, 'running', {
      config: { ...match(4, 'running').config, resumeEpoch: 1 },
    }));

    expect(controller.getState().resumeSignal).toBe(1);
    controller.dispose();
  });

  it('stops polling after a permanent 404 instead of retrying every cadence', async () => {
    jest.useFakeTimers();
    const transport = new FakeTransport();
    transport.get.mockRejectedValue(
      new MultiplayerClientError('MATCH_NOT_FOUND', 'missing', false, 404),
    );
    const controller = new TreasureHuntMultiplayerController({
      transport,
      pollIntervalMs: 250,
      retryJitter: () => 0.5,
    });
    await controller.join('ROOM-1');
    await jest.advanceTimersByTimeAsync(5_000);
    expect(transport.get).toHaveBeenCalledTimes(1);
    expect(transport.heartbeat).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('does not retry a permanently rejected snapshot every 500ms', async () => {
    jest.useFakeTimers();
    const transport = new FakeTransport();
    transport.snapshot.mockRejectedValue(
      new MultiplayerClientError('PLAYER_NOT_FOUND', 'missing', false, 404),
    );
    const controller = new TreasureHuntMultiplayerController({ transport, now: () => 2_000 });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));
    controller.publishSnapshot({ score: 10, hearts: 3, lifecycle: 'playing' });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(transport.snapshot).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('backs off transient snapshot failures instead of retrying every throttle cadence', async () => {
    jest.useFakeTimers();
    const transport = new FakeTransport();
    transport.snapshot.mockRejectedValue(
      new MultiplayerClientError('RATE_LIMITED', 'slow down', true, 429),
    );
    transport.get.mockResolvedValue({ match: match(2, 'running') });
    transport.heartbeat.mockResolvedValue({ match: match(2, 'running') });
    const controller = new TreasureHuntMultiplayerController({
      transport,
      now: () => 2_000,
      snapshotThrottleMs: 500,
      retryJitter: () => 0.5,
    });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));
    controller.publishSnapshot({ score: 10, hearts: 3, lifecycle: 'playing' });
    await Promise.resolve();

    await jest.advanceTimersByTimeAsync(999);
    expect(transport.snapshot).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(transport.snapshot).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1_999);
    expect(transport.snapshot).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(transport.snapshot).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it('resets snapshot backoff after a successful retry', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(2_000);
    const transport = new FakeTransport();
    const rateLimit = new MultiplayerClientError('RATE_LIMITED', 'slow down', true, 429);
    transport.snapshot
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValueOnce({ match: match(3, 'running') })
      .mockRejectedValueOnce(rateLimit)
      .mockResolvedValue({ match: match(4, 'running') });
    transport.get.mockResolvedValue({ match: match(2, 'running') });
    transport.heartbeat.mockResolvedValue({ match: match(2, 'running') });
    const controller = new TreasureHuntMultiplayerController({
      transport,
      snapshotThrottleMs: 500,
      retryJitter: () => 0.5,
    });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));

    controller.publishSnapshot({ score: 10, hearts: 3, lifecycle: 'playing' });
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1_000);
    expect(transport.snapshot).toHaveBeenCalledTimes(2);

    controller.publishSnapshot({ score: 20, hearts: 3, lifecycle: 'playing' });
    await jest.advanceTimersByTimeAsync(500);
    expect(transport.snapshot).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(999);
    expect(transport.snapshot).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(transport.snapshot).toHaveBeenCalledTimes(4);
    controller.dispose();
  });

  it('backs off transient 429 polling failures with jitter', async () => {
    jest.useFakeTimers();
    const transport = new FakeTransport();
    transport.get.mockRejectedValue(
      new MultiplayerClientError('RATE_LIMITED', 'slow down', true, 429),
    );
    const controller = new TreasureHuntMultiplayerController({
      transport,
      pollIntervalMs: 250,
      retryJitter: () => 0.5,
    });
    await controller.join('ROOM-1');

    await jest.advanceTimersByTimeAsync(1_749);
    expect(transport.get).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    expect(transport.get).toHaveBeenCalledTimes(3);
    controller.dispose();
  });

  it('lets a recent snapshot satisfy presence before the 2s heartbeat cadence', async () => {
    jest.useFakeTimers();
    let now = 0;
    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({
      transport,
      now: () => now,
      pollIntervalMs: 750,
      heartbeatIntervalMs: 2_000,
    });
    await controller.join('ROOM-1');
    controller.applyServerMatch(match(2, 'running'));

    now = 1_900;
    jest.advanceTimersByTime(1_900);
    controller.publishSnapshot({ score: 1, hearts: 3, lifecycle: 'playing' });
    await Promise.resolve();
    now = 2_000;
    await jest.advanceTimersByTimeAsync(100);
    expect(transport.heartbeat).not.toHaveBeenCalled();

    now = 3_900;
    await jest.advanceTimersByTimeAsync(1_900);
    expect(transport.heartbeat).toHaveBeenCalledTimes(1);
    controller.dispose();
  });
});

describe('multiplayer client helpers', () => {
  it('takes invitation rooms only from the trusted parent handshake shape', () => {
    expect(getHandshakeRoomCode({ roomId: ' INVITED ' })).toBe('INVITED');
    expect(getHandshakeRoomCode({ roomId: '' })).toBeNull();
    expect(getHandshakeRoomCode({ room: 'QUERY-SPOOF' } as never)).toBeNull();
  });

  it('blocks invitation autojoin and direct join when production flag is off', async () => {
    const productionDisabled = isTreasureHuntMultiplayerEnabled({ NODE_ENV: 'production' });
    expect(productionDisabled).toBe(false);
    expect(getHandshakeRoomCode({ roomId: 'INVITED' }, productionDisabled)).toBeNull();

    const transport = new FakeTransport();
    const controller = new TreasureHuntMultiplayerController({
      transport,
      enabled: productionDisabled,
    });
    await expect(controller.join('INVITED')).rejects.toMatchObject({ code: 'FEATURE_DISABLED' });
    expect(transport.join).not.toHaveBeenCalled();
    controller.dispose();
  });

  it('locks local pause/reset while canonical multiplayer is active, but not after result', () => {
    expect(shouldBlockLocalGameControls(false, false)).toBe(false);
    expect(shouldBlockLocalGameControls(true, false)).toBe(true);
    expect(shouldBlockLocalGameControls(true, true)).toBe(false);
    expect(shouldBlockLocalGameControls(false, false, true)).toBe(true);
  });

  it('treats waiting and countdown as pinned matches for local mode controls', () => {
    expect(isTreasureHuntMatchNonTerminal('waiting')).toBe(true);
    expect(isTreasureHuntMatchNonTerminal('countdown')).toBe(true);
    expect(isTreasureHuntMatchNonTerminal('running')).toBe(true);
    expect(isTreasureHuntMatchNonTerminal('finished')).toBe(false);
    expect(isTreasureHuntMatchNonTerminal('abandoned')).toBe(false);
    expect(isTreasureHuntMatchNonTerminal(null)).toBe(false);
  });

  it('describes the sudden-death target from the local player perspective', () => {
    expect(getSuddenDeathObjectiveCopy('player-1', 'player-1', 1_500))
      .toBe('Debes superar 1500 pts');
    expect(getSuddenDeathObjectiveCopy('player-2', 'player-1', 1_500))
      .toBe('El rival debe superar 1500 pts');
  });

  it('extends the chaser engine from second 25 without reviving the eliminated leader', () => {
    const basePlayer = match(1, 'sudden_death').players[0];
    const chaser = {
      ...basePlayer,
      playerId: 'player-chaser',
      score: 500,
      hearts: 2,
      lifecycle: 'playing' as const,
    };
    const leader = {
      ...basePlayer,
      playerId: 'player-leader',
      score: 600,
      hearts: 0,
      lifecycle: 'eliminated' as const,
    };
    const suddenDeath = {
      leaderPlayerId: leader.playerId,
      chasingPlayerId: chaser.playerId,
      targetScore: leader.score,
    };

    expect(canResumeLocalPlayerInSuddenDeath({
      matchStatus: 'sudden_death',
      suddenDeath,
      localPlayerId: chaser.playerId,
      localPlayer: chaser,
    })).toBe(true);
    expect(canResumeLocalPlayerInSuddenDeath({
      matchStatus: 'sudden_death',
      suddenDeath,
      localPlayerId: leader.playerId,
      localPlayer: leader,
    })).toBe(false);
    expect(deriveCanonicalDeadlineRuntimeTransition({
      deadlineAt: 85_000,
      now: 25_000,
      currentStatus: 'playing',
      allowTimeGameOverResume: true,
    })).toEqual({ timer: 60, shouldResume: false });
    expect(deriveCanonicalDeadlineRuntimeTransition({
      deadlineAt: 85_000,
      now: 30_000,
      currentStatus: 'gameOver',
      gameOverReason: 'time',
      allowTimeGameOverResume: true,
    })).toEqual({ timer: 55, shouldResume: true });
    expect(deriveCanonicalDeadlineRuntimeTransition({
      deadlineAt: 85_000,
      now: 30_000,
      currentStatus: 'gameOver',
      gameOverReason: 'hearts',
      allowTimeGameOverResume: true,
    })).toEqual({ timer: 55, shouldResume: false });
  });

  it('revives both surviving players for a tied round sudden death at second 30', () => {
    const first = {
      ...match(1, 'sudden_death').players[0],
      playerId: 'player-1',
      score: 400,
      hearts: 2,
      lifecycle: 'playing' as const,
    };
    const second = { ...first, playerId: 'player-2' };

    for (const player of [first, second]) {
      expect(canResumeLocalPlayerInSuddenDeath({
        matchStatus: 'sudden_death',
        suddenDeath: null,
        localPlayerId: player.playerId,
        localPlayer: player,
      })).toBe(true);
    }
    expect(deriveCanonicalDeadlineRuntimeTransition({
      deadlineAt: 90_000,
      now: 30_000,
      currentStatus: 'gameOver',
      gameOverReason: 'time',
      allowTimeGameOverResume: true,
    })).toEqual({ timer: 60, shouldResume: true });
  });

  it('creates room codes using Web Crypto without Math.random', () => {
    const random = jest.spyOn(Math, 'random');
    expect(createMultiplayerRoomCode({ randomUUID: () => 'uuid-123' } as Crypto)).toBe('room-uuid-123');
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
