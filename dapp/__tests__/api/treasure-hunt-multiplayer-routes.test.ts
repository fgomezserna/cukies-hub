import { MultiplayerDomainError } from '@/lib/treasure-hunt-multiplayer';
import {
  createTreasureHuntMultiplayerHandlers,
  isTreasureHuntMultiplayerFeatureEnabled,
  type MultiplayerGameSession,
} from '@/app/api/games/treasure-hunt/multiplayer/_lib/handlers';
import {
  MultiplayerFixedWindowRateLimiter,
  type MultiplayerRateLimitOperation,
} from '@/app/api/games/treasure-hunt/multiplayer/_lib/rate-limit';
import { InMemoryMatchRepository } from '@/lib/treasure-hunt-multiplayer/repository';
import { TreasureHuntMultiplayerService } from '@/lib/treasure-hunt-multiplayer/service';
import type { Match } from '@/lib/treasure-hunt-multiplayer/types';

const match = {
  matchId: 'match-1',
  roomCode: 'ROOM42',
  status: 'waiting',
  players: [],
};

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function createHarness() {
  const service = {
    createOrJoin: jest.fn().mockResolvedValue({ playerId: 'player-1', slot: 0, match }),
    getForParticipant: jest.fn().mockResolvedValue(match),
    heartbeat: jest.fn().mockResolvedValue(match),
    updateSnapshot: jest.fn().mockResolvedValue(match),
    forfeit: jest.fn().mockResolvedValue(match),
    releaseForParticipant: jest.fn().mockResolvedValue(match),
  };
  const dependencies = {
    isFeatureEnabled: jest.fn(() => true),
    readWalletSession: jest.fn().mockResolvedValue({ userId: 'wallet-user' }),
    findGameSessionBySessionId: jest.fn().mockResolvedValue({
      sessionId: 'game-session-1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'joined',
      multiplayerClientInstanceId: 'client-instance-1',
    }),
    lockGameSessionForMultiplayer: jest.fn().mockResolvedValue(true),
    confirmGameSessionForMultiplayer: jest.fn().mockResolvedValue('confirmed'),
    releaseGameSessionForMultiplayer: jest.fn().mockResolvedValue(true),
    consumeRateLimit: jest.fn(
      (_input: { userId: string; operation: MultiplayerRateLimitOperation }) => true,
    ),
    getService: jest.fn(() => service),
  };
  const handlers = createTreasureHuntMultiplayerHandlers(dependencies);
  return { service, dependencies, handlers };
}

describe('Treasure Hunt multiplayer API handlers', () => {
  it('requires an exact true feature flag in production', () => {
    expect(isTreasureHuntMultiplayerFeatureEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      isTreasureHuntMultiplayerFeatureEnabled({
        NODE_ENV: 'production',
        TREASURE_HUNT_MULTIPLAYER_ENABLED: 'false',
      }),
    ).toBe(false);
    expect(
      isTreasureHuntMultiplayerFeatureEnabled({
        NODE_ENV: 'production',
        TREASURE_HUNT_MULTIPLAYER_ENABLED: 'true',
      }),
    ).toBe(true);
    expect(isTreasureHuntMultiplayerFeatureEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('fails closed at the feature gate before wallet, Prisma or match persistence', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.isFeatureEnabled.mockReturnValue(false);

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
    expect(dependencies.readWalletSession).not.toHaveBeenCalled();
    expect(dependencies.findGameSessionBySessionId).not.toHaveBeenCalled();
    expect(dependencies.lockGameSessionForMultiplayer).not.toHaveBeenCalled();
    expect(dependencies.getService).not.toHaveBeenCalled();
    expect(service.createOrJoin).not.toHaveBeenCalled();
  });

  it('requires the signed wallet session before looking up a game session', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.readWalletSession.mockResolvedValue(null);

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'UNAUTHENTICATED' },
    });
    expect(dependencies.findGameSessionBySessionId).not.toHaveBeenCalled();
    expect(service.createOrJoin).not.toHaveBeenCalled();
  });

  it('returns 401 from get and match operations before parsing attacker input', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.readWalletSession.mockResolvedValue(null);

    const getResponse = await handlers.get(
      new Request(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1?gameSessionId=game-session-1&clientInstanceId=client-instance-1',
      ),
      'match-1',
    );
    const operationResponse = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        '{bad-json',
      ),
      'match-1',
    );

    expect(getResponse.status).toBe(401);
    expect(operationResponse.status).toBe(401);
    expect(dependencies.findGameSessionBySessionId).not.toHaveBeenCalled();
    expect(service.getForParticipant).not.toHaveBeenCalled();
    expect(service.heartbeat).not.toHaveBeenCalled();
    expect(service.updateSnapshot).not.toHaveBeenCalled();
  });

  it.each([
    ['not owned', { userId: 'someone-else', gameId: 'sybil-slayer', isActive: true }],
    ['inactive', { userId: 'wallet-user', gameId: 'sybil-slayer', isActive: false }],
    ['wrong game', { userId: 'wallet-user', gameId: 'hyppie-road', isActive: true }],
  ])('rejects a %s game session without invoking the service', async (_label, overrides) => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.findGameSessionBySessionId.mockResolvedValue({
      sessionId: 'game-session-1',
      ...overrides,
    });

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      }),
    );

    expect(response.status).toBe(403);
    expect(service.createOrJoin).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain('sessionToken');
  });

  it('returns 404 for an unknown game session', async () => {
    const { handlers, dependencies } = createHarness();
    dependencies.findGameSessionBySessionId.mockResolvedValue(null);

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'missing-session',
        clientInstanceId: 'client-instance-1',
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  it('rejects an inactive locked multiplayer session before every match operation', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.findGameSessionBySessionId.mockResolvedValue({
      sessionId: 'game-session-1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: false,
      mode: 'staging_unranked',
      rewardEligible: false,
    });

    const getResponse = await handlers.get(
      new Request(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1?gameSessionId=game-session-1&clientInstanceId=client-instance-1',
      ),
      'match-1',
    );
    const operationResponse = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'heartbeat', gameSessionId: 'game-session-1', clientInstanceId: 'client-instance-1' },
      ),
      'match-1',
    );

    expect(getResponse.status).toBe(403);
    expect(operationResponse.status).toBe(403);
    expect(dependencies.getService).not.toHaveBeenCalled();
    expect(service.getForParticipant).not.toHaveBeenCalled();
    expect(service.heartbeat).not.toHaveBeenCalled();
  });

  it('rejects stale get, heartbeat, snapshot and forfeit clients before match persistence', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.findGameSessionBySessionId.mockResolvedValue({
      sessionId: 'game-session-1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'joined',
      multiplayerClientInstanceId: 'parent-authority-client',
    });

    const staleGet = await handlers.get(
      new Request(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1?gameSessionId=game-session-1&clientInstanceId=stale-iframe-client',
      ),
      'match-1',
    );
    const staleHeartbeat = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        {
          action: 'heartbeat',
          gameSessionId: 'game-session-1',
          clientInstanceId: 'stale-iframe-client',
        },
      ),
      'match-1',
    );
    const staleForfeit = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        {
          action: 'forfeit',
          gameSessionId: 'game-session-1',
          clientInstanceId: 'stale-iframe-client',
        },
      ),
      'match-1',
    );
    const staleSnapshot = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        {
          action: 'snapshot',
          gameSessionId: 'game-session-1',
          clientInstanceId: 'stale-iframe-client',
          snapshot: { seq: 1, score: 10, hearts: 3, elapsedMs: 100, lifecycle: 'playing' },
        },
      ),
      'match-1',
    );

    expect([
      staleGet.status,
      staleHeartbeat.status,
      staleSnapshot.status,
      staleForfeit.status,
    ]).toEqual([403, 403, 403, 403]);
    expect(service.getForParticipant).not.toHaveBeenCalled();
    expect(service.heartbeat).not.toHaveBeenCalled();
    expect(service.updateSnapshot).not.toHaveBeenCalled();
    expect(service.forfeit).not.toHaveBeenCalled();
  });

  it('derives service identity from the wallet cookie and validated session', async () => {
    const { handlers, dependencies, service } = createHarness();

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      }),
    );

    expect(response.status).toBe(200);
    expect(dependencies.lockGameSessionForMultiplayer).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(dependencies.lockGameSessionForMultiplayer.mock.invocationCallOrder[0]).toBeLessThan(
      service.createOrJoin.mock.invocationCallOrder[0],
    );
    expect(service.createOrJoin).toHaveBeenCalledWith({
      roomCode: 'ROOM42',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(dependencies.confirmGameSessionForMultiplayer).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(service.createOrJoin.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.confirmGameSessionForMultiplayer.mock.invocationCallOrder[0],
    );
    expect(await response.json()).toEqual({
      success: true,
      playerId: 'player-1',
      slot: 0,
      match,
    });
  });

  it('does not lock invalid input and never creates a match when the lock fails', async () => {
    const invalidHarness = createHarness();
    const invalid = await invalidHarness.handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      }),
    );
    expect(invalid.status).toBe(400);
    expect(invalidHarness.dependencies.lockGameSessionForMultiplayer).not.toHaveBeenCalled();

    const deniedHarness = createHarness();
    deniedHarness.dependencies.lockGameSessionForMultiplayer.mockResolvedValue(false);
    const denied = await deniedHarness.handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      }),
    );
    expect(denied.status).toBe(403);
    expect(deniedHarness.service.createOrJoin).not.toHaveBeenCalled();
  });

  it('returns a generic 429 before touching the match repository', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.consumeRateLimit.mockReturnValue(false);

    const response = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'heartbeat', gameSessionId: 'game-session-1', clientInstanceId: 'client-instance-1' },
      ),
      'match-1',
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests' },
    });
    expect(dependencies.getService).not.toHaveBeenCalled();
    expect(dependencies.findGameSessionBySessionId).not.toHaveBeenCalled();
    expect(service.heartbeat).not.toHaveBeenCalled();
  });

  it('requires clientInstanceId before rate limiting or Prisma authorization', async () => {
    const { handlers, dependencies, service } = createHarness();

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      }),
    );

    expect(response.status).toBe(400);
    expect(dependencies.consumeRateLimit).not.toHaveBeenCalled();
    expect(dependencies.findGameSessionBySessionId).not.toHaveBeenCalled();
    expect(service.createOrJoin).not.toHaveBeenCalled();
  });

  it.each(['userId', 'playerId'])('rejects client-controlled %s identity', async (field) => {
    const { handlers, service } = createHarness();
    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
        [field]: 'spoofed',
      }),
    );

    expect(response.status).toBe(400);
    expect(service.createOrJoin).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{bad-json'],
    ['missing fields', {}],
  ])('maps %s to a 400 response', async (_label, body) => {
    const { handlers } = createHarness();
    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', body),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_REQUEST' } });
  });

  it('uses participant-authorized get and maps a non-participant to 404', async () => {
    const { handlers, service } = createHarness();
    service.getForParticipant.mockRejectedValue(
      new MultiplayerDomainError('PLAYER_NOT_FOUND', 'Player is not in this match', 404),
    );

    const response = await handlers.get(
      new Request(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1?gameSessionId=game-session-1&clientInstanceId=client-instance-1',
      ),
      'match-1',
    );

    expect(service.getForParticipant).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });

  it('dispatches heartbeat with server-derived identity', async () => {
    const { handlers, service } = createHarness();
    const response = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'heartbeat', gameSessionId: 'game-session-1', clientInstanceId: 'client-instance-1', matchId: 'spoofed' },
      ),
      'match-1',
    );

    expect(response.status).toBe(200);
    expect(service.heartbeat).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(await response.json()).toEqual({ success: true, match });
  });

  it('dispatches snapshots and requires the snapshot field', async () => {
    const { handlers, service } = createHarness();
    const snapshot = { seq: 1, score: 10, hearts: 3, elapsedMs: 100, lifecycle: 'playing' };

    const response = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'snapshot', gameSessionId: 'game-session-1', clientInstanceId: 'client-instance-1', snapshot },
      ),
      'match-1',
    );
    expect(service.updateSnapshot).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      snapshot,
    });
    expect(response.status).toBe(200);

    const missing = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'snapshot', gameSessionId: 'game-session-1', clientInstanceId: 'client-instance-1' },
      ),
      'match-1',
    );
    expect(missing.status).toBe(400);
  });

  it('dispatches authoritative self-forfeit with server-derived identity', async () => {
    const { handlers, service } = createHarness();
    const response = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'forfeit', gameSessionId: 'game-session-1', clientInstanceId: 'client-instance-1' },
      ),
      'match-1',
    );

    expect(response.status).toBe(200);
    expect(service.forfeit).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(await response.json()).toEqual({ success: true, match });
  });

  it('replays a lost release acknowledgement with the exact lease and still heals a late match', async () => {
    const { handlers, dependencies, service } = createHarness();
    service.releaseForParticipant.mockResolvedValue(null);
    dependencies.releaseGameSessionForMultiplayer
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    dependencies.findGameSessionBySessionId.mockResolvedValue({
      sessionId: 'game-session-1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: false,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'released',
      multiplayerClientInstanceId: 'client-instance-1',
    });

    const request = (clientInstanceId: string) =>
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/release',
        {
          gameSessionId: 'game-session-1',
          clientInstanceId,
        },
      );
    const firstResponse = await handlers.release(request('client-instance-1'));
    const replayResponse = await handlers.release(request('client-instance-1'));
    const staleResponse = await handlers.release(request('client-instance-after-reload'));

    expect(service.releaseForParticipant).toHaveBeenCalledTimes(2);
    expect(dependencies.releaseGameSessionForMultiplayer).toHaveBeenCalledTimes(3);
    await expect(firstResponse.json()).resolves.toEqual({
      success: true,
      released: true,
      match: null,
    });
    expect(replayResponse.status).toBe(200);
    expect(staleResponse.status).toBe(403);
  });

  it('durably releases a normal session so a delayed join cannot acquire it later', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.findGameSessionBySessionId.mockResolvedValue({
      sessionId: 'game-session-1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: null,
      rewardEligible: null,
      multiplayerState: 'idle',
      multiplayerClientInstanceId: null,
    });

    const response = await handlers.release(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/release',
        {
          gameSessionId: 'game-session-1',
          clientInstanceId: 'client-instance-1',
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, released: true, match });
    expect(dependencies.releaseGameSessionForMultiplayer).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(service.releaseForParticipant).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
  });

  it('persists the release tombstone before forfeiting an active match', async () => {
    const { handlers, dependencies, service } = createHarness();

    const response = await handlers.release(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/release',
        {
          gameSessionId: 'game-session-1',
          clientInstanceId: 'client-instance-1',
        },
      ),
    );

    expect(service.releaseForParticipant).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(dependencies.releaseGameSessionForMultiplayer.mock.invocationCallOrder[0]).toBeLessThan(
      service.releaseForParticipant.mock.invocationCallOrder[0],
    );
    expect(await response.json()).toEqual({ success: true, released: true, match });
  });

  it('releases a staging session even when joining failed before a match existed', async () => {
    const { handlers, dependencies, service } = createHarness();
    service.releaseForParticipant.mockResolvedValue(null);

    const response = await handlers.release(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/release',
        {
          gameSessionId: 'game-session-1',
          clientInstanceId: 'client-instance-1',
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, released: true, match: null });
    expect(dependencies.releaseGameSessionForMultiplayer).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
  });

  it('compensates a JOIN that commits after a concurrent durable RELEASE', async () => {
    const { handlers, dependencies, service } = createHarness();
    const delayedJoin = deferred<{ playerId: string; slot: 0; match: typeof match }>();
    const joinStarted = deferred<void>();
    service.createOrJoin.mockImplementationOnce(() => {
      joinStarted.resolve();
      return delayedJoin.promise;
    });
    service.releaseForParticipant.mockResolvedValueOnce(null).mockResolvedValueOnce(match);
    dependencies.confirmGameSessionForMultiplayer.mockResolvedValueOnce('released');

    const joinPromise = handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
        clientInstanceId: 'client-instance-1',
      }),
    );
    await joinStarted.promise;
    expect(service.createOrJoin).toHaveBeenCalledTimes(1);

    const releaseResponse = await handlers.release(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches/release', {
        gameSessionId: 'game-session-1',
        clientInstanceId: 'client-instance-1',
      }),
    );
    expect(await releaseResponse.json()).toEqual({ success: true, released: true, match: null });

    delayedJoin.resolve({ playerId: 'player-1', slot: 0, match });
    const joinResponse = await joinPromise;
    expect(joinResponse.status).toBe(409);
    expect(await joinResponse.json()).toMatchObject({
      success: false,
      error: { code: 'JOIN_RELEASED' },
    });
    expect(service.releaseForParticipant).toHaveBeenLastCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(service.releaseForParticipant).toHaveBeenCalledTimes(2);
  });

  it('keeps GameSession and match authority coherent when RELEASE wins during repository.create', async () => {
    const createEntered = deferred<void>();
    const allowCreate = deferred<void>();
    class DelayedCreateRepository extends InMemoryMatchRepository {
      override async create(candidate: Match) {
        createEntered.resolve();
        await allowCreate.promise;
        return super.create(candidate);
      }
    }

    const repository = new DelayedCreateRepository();
    const service = new TreasureHuntMultiplayerService(repository, {
      clock: { now: () => 1_000 },
      idFactory: {
        createMatchId: () => 'match-race',
        createPlayerId: () => 'player-race',
        createSeed: () => 'seed-race',
      },
    });
    const gameSession: MultiplayerGameSession = {
      sessionId: 'game-session-race',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'standard',
      rewardEligible: true,
      multiplayerState: 'idle',
      multiplayerClientInstanceId: null,
    };
    const dependencies = {
      isFeatureEnabled: () => true,
      readWalletSession: async () => ({ userId: 'wallet-user' }),
      findGameSessionBySessionId: async () => ({ ...gameSession }),
      lockGameSessionForMultiplayer: async (identity: {
        userId: string;
        gameSessionId: string;
        clientInstanceId: string;
      }) => {
        const unclaimed =
          (gameSession.multiplayerState == null || gameSession.multiplayerState === 'idle') &&
          (gameSession.multiplayerClientInstanceId == null ||
            gameSession.multiplayerClientInstanceId === identity.clientInstanceId);
        const exactInProgress =
          gameSession.multiplayerState === 'joining' &&
          gameSession.multiplayerClientInstanceId === identity.clientInstanceId;
        const exactJoined =
          gameSession.multiplayerState === 'joined' &&
          gameSession.multiplayerClientInstanceId === identity.clientInstanceId;
        if (
          identity.userId !== gameSession.userId ||
          identity.gameSessionId !== gameSession.sessionId ||
          !gameSession.isActive ||
          !(unclaimed || exactInProgress || exactJoined)
        ) return false;
        Object.assign(gameSession, {
          mode: 'staging_unranked',
          rewardEligible: false,
          multiplayerState: 'joining',
          multiplayerClientInstanceId: identity.clientInstanceId,
        });
        return true;
      },
      confirmGameSessionForMultiplayer: async (identity: {
        userId: string;
        gameSessionId: string;
        clientInstanceId: string;
      }) => {
        if (
          !gameSession.isActive ||
          gameSession.multiplayerState !== 'joining' ||
          gameSession.multiplayerClientInstanceId !== identity.clientInstanceId
        ) return 'released' as const;
        Object.assign(gameSession, { multiplayerState: 'joined' });
        return 'confirmed' as const;
      },
      releaseGameSessionForMultiplayer: async (identity: {
        userId: string;
        gameSessionId: string;
        clientInstanceId: string;
      }) => {
        const exactClaim =
          (gameSession.multiplayerState === 'joining' ||
            gameSession.multiplayerState === 'joined') &&
          gameSession.multiplayerClientInstanceId === identity.clientInstanceId;
        const unclaimed =
          (gameSession.multiplayerState == null || gameSession.multiplayerState === 'idle') &&
          (gameSession.multiplayerClientInstanceId == null ||
            gameSession.multiplayerClientInstanceId === identity.clientInstanceId);
        if (gameSession.isActive && (exactClaim || unclaimed)) {
          Object.assign(gameSession, {
            isActive: false,
            mode: 'staging_unranked',
            rewardEligible: false,
            multiplayerState: 'released',
            multiplayerClientInstanceId: identity.clientInstanceId,
          });
          return true;
        }
        return Boolean(
          !gameSession.isActive &&
            gameSession.multiplayerState === 'released' &&
            gameSession.multiplayerClientInstanceId === identity.clientInstanceId,
        );
      },
      consumeRateLimit: () => true,
      getService: () => service,
    };
    const handlers = createTreasureHuntMultiplayerHandlers(dependencies);

    const joinPromise = handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM-RACE',
        gameSessionId: 'game-session-race',
        clientInstanceId: 'client-race',
      }),
    );
    await createEntered.promise;

    const fencedJoinResponse = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM-RACE',
        gameSessionId: 'game-session-race',
        clientInstanceId: 'client-race-new-iframe',
      }),
    );
    expect(fencedJoinResponse.status).toBe(403);
    expect(gameSession).toMatchObject({
      multiplayerState: 'joining',
      multiplayerClientInstanceId: 'client-race',
    });

    const releaseResponse = await handlers.release(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches/release', {
        gameSessionId: 'game-session-race',
        clientInstanceId: 'client-race',
      }),
    );
    expect(await releaseResponse.json()).toEqual({ success: true, released: true, match: null });

    allowCreate.resolve();
    const joinResponse = await joinPromise;
    expect(joinResponse.status).toBe(409);
    const compensated = await repository.findByGameSession('wallet-user', 'game-session-race');
    expect(gameSession).toMatchObject({
      isActive: false,
      multiplayerState: 'released',
      multiplayerClientInstanceId: 'client-race',
    });
    expect(compensated).toMatchObject({
      status: 'abandoned',
      activeUserIds: [],
      result: { reason: 'abandoned', winnerPlayerId: null },
    });
  });

  it('preserves domain status/code and redacts unexpected errors', async () => {
    const domainHarness = createHarness();
    domainHarness.service.createOrJoin.mockRejectedValue(
      new MultiplayerDomainError('MATCH_FULL', 'Room is full', 409),
    );
    const request = () =>
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
      });

    const domainResponse = await domainHarness.handlers.createOrJoin(request());
    expect(domainResponse.status).toBe(409);
    expect(await domainResponse.json()).toMatchObject({ error: { code: 'MATCH_FULL' } });
    expect(domainHarness.dependencies.releaseGameSessionForMultiplayer).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });
    expect(domainHarness.service.releaseForParticipant).toHaveBeenCalledWith({
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      clientInstanceId: 'client-instance-1',
    });

    const failureHarness = createHarness();
    failureHarness.service.createOrJoin.mockRejectedValue(
      new Error('DATABASE_URL=mongodb://user:secret@example.test'),
    );
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const failureResponse = await failureHarness.handlers.createOrJoin(request());
    const failureJson = await failureResponse.json();
    errorSpy.mockRestore();

    expect(failureResponse.status).toBe(500);
    expect(failureJson).toEqual({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(failureJson)).not.toContain('secret');
  });
});

describe('MultiplayerFixedWindowRateLimiter', () => {
  it('limits each operation by wallet and resets its window', () => {
    let now = 1_000;
    const limiter = new MultiplayerFixedWindowRateLimiter(60_000, () => now);
    const identity = { userId: 'wallet-user' };

    for (let request = 0; request < 12; request += 1) {
      expect(limiter.consume({ ...identity, operation: 'join' })).toBe(true);
    }
    expect(limiter.consume({ ...identity, operation: 'join' })).toBe(false);
    expect(limiter.consume({ ...identity, operation: 'heartbeat' })).toBe(true);
    expect(
      limiter.consume({ ...identity, userId: 'other-wallet', operation: 'join' }),
    ).toBe(true);

    now += 60_000;
    expect(limiter.consume({ ...identity, operation: 'join' })).toBe(true);
  });

  it('cannot be bypassed by rotating gameSessionId for the same wallet', async () => {
    const { handlers, dependencies } = createHarness();
    const limiter = new MultiplayerFixedWindowRateLimiter();
    dependencies.consumeRateLimit.mockImplementation((input) => limiter.consume(input));
    dependencies.findGameSessionBySessionId.mockImplementation(async (sessionId) => ({
      sessionId,
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
    }));

    const responses = [];
    for (let request = 0; request < 13; request += 1) {
      const gameSessionId = request % 2 === 0 ? 'game-session-1' : 'game-session-2';
      responses.push(
        await handlers.createOrJoin(
          jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
            roomCode: 'ROOM42',
            gameSessionId,
            clientInstanceId: `client-instance-${request}`,
          }),
        ),
      );
    }

    expect(responses.slice(0, 12).map((response) => response.status)).toEqual(
      Array(12).fill(200),
    );
    expect(responses[12]?.status).toBe(429);
    expect(dependencies.findGameSessionBySessionId).toHaveBeenCalledTimes(12);
  });
});
