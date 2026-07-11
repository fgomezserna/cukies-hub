import { MultiplayerDomainError } from '@/lib/treasure-hunt-multiplayer';
import { createTreasureHuntMultiplayerHandlers } from '@/app/api/games/treasure-hunt/multiplayer/_lib/handlers';

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

function createHarness() {
  const service = {
    createOrJoin: jest.fn().mockResolvedValue({ playerId: 'player-1', slot: 0, match }),
    getForParticipant: jest.fn().mockResolvedValue(match),
    heartbeat: jest.fn().mockResolvedValue(match),
    updateSnapshot: jest.fn().mockResolvedValue(match),
  };
  const dependencies = {
    readWalletSession: jest.fn().mockResolvedValue({ userId: 'wallet-user' }),
    findGameSessionBySessionId: jest.fn().mockResolvedValue({
      sessionId: 'game-session-1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
    }),
    getService: jest.fn(() => service),
  };
  const handlers = createTreasureHuntMultiplayerHandlers(dependencies);
  return { service, dependencies, handlers };
}

describe('Treasure Hunt multiplayer API handlers', () => {
  it('requires the signed wallet session before looking up a game session', async () => {
    const { handlers, dependencies, service } = createHarness();
    dependencies.readWalletSession.mockResolvedValue(null);

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
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
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1?gameSessionId=game-session-1',
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
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'GAME_SESSION_NOT_FOUND' },
    });
  });

  it('derives service identity from the wallet cookie and validated session', async () => {
    const { handlers, service } = createHarness();

    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
      }),
    );

    expect(response.status).toBe(200);
    expect(service.createOrJoin).toHaveBeenCalledWith({
      roomCode: 'ROOM42',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
    });
    expect(await response.json()).toEqual({
      success: true,
      playerId: 'player-1',
      slot: 0,
      match,
    });
  });

  it.each(['userId', 'playerId'])('rejects client-controlled %s identity', async (field) => {
    const { handlers, service } = createHarness();
    const response = await handlers.createOrJoin(
      jsonRequest('http://localhost/api/games/treasure-hunt/multiplayer/matches', {
        roomCode: 'ROOM42',
        gameSessionId: 'game-session-1',
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
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1?gameSessionId=game-session-1',
      ),
      'match-1',
    );

    expect(service.getForParticipant).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: 'PLAYER_NOT_FOUND' },
    });
  });

  it('dispatches heartbeat with server-derived identity', async () => {
    const { handlers, service } = createHarness();
    const response = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'heartbeat', gameSessionId: 'game-session-1', matchId: 'spoofed' },
      ),
      'match-1',
    );

    expect(response.status).toBe(200);
    expect(service.heartbeat).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
    });
    expect(await response.json()).toEqual({ success: true, match });
  });

  it('dispatches snapshots and requires the snapshot field', async () => {
    const { handlers, service } = createHarness();
    const snapshot = { seq: 1, score: 10, hearts: 3, elapsedMs: 100, lifecycle: 'playing' };

    const response = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'snapshot', gameSessionId: 'game-session-1', snapshot },
      ),
      'match-1',
    );
    expect(service.updateSnapshot).toHaveBeenCalledWith({
      matchId: 'match-1',
      userId: 'wallet-user',
      gameSessionId: 'game-session-1',
      snapshot,
    });
    expect(response.status).toBe(200);

    const missing = await handlers.operate(
      jsonRequest(
        'http://localhost/api/games/treasure-hunt/multiplayer/matches/match-1',
        { action: 'snapshot', gameSessionId: 'game-session-1' },
      ),
      'match-1',
    );
    expect(missing.status).toBe(400);
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
      });

    const domainResponse = await domainHarness.handlers.createOrJoin(request());
    expect(domainResponse.status).toBe(409);
    expect(await domainResponse.json()).toMatchObject({ error: { code: 'MATCH_FULL' } });

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
