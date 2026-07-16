import {
  routeGameCheckpoint,
  routeGameEnd,
  type CompetitionAttemptCoordinator,
} from '@/lib/treasure-hunt-competition/client';

function coordinator(overrides: Partial<CompetitionAttemptCoordinator> = {}) {
  return {
    hasActiveAttempt: jest.fn(() => true),
    checkpoint: jest.fn(async () => ({
      accepted: true,
      status: 'active' as const,
      nextSequence: 2,
      receipt: 'receipt-2',
    })),
    finish: jest.fn(async () => ({
      accepted: true,
      status: 'valid' as const,
      nextSequence: 3,
      receipt: null,
      score: 999,
    })),
    finishDeclared: jest.fn(async () => ({
      accepted: true,
      status: 'review' as const,
      nextSequence: 3,
      receipt: null,
      score: 999,
      gameTimeMs: 30_000,
    })),
    ...overrides,
  } as unknown as CompetitionAttemptCoordinator;
}

describe('Treasure Hunt competition game event router', () => {
  it('never calls the legacy checkpoint endpoint for a claimed competition session', async () => {
    const competitionCoordinator = coordinator();
    const fetchImpl = jest.fn();

    await expect(routeGameCheckpoint({
      gameSessionId: 'session-1',
      sessionToken: 'legacy-bearer',
      competitionCoordinator,
      fetchImpl: fetchImpl as typeof fetch,
      checkpoint: { score: 500, gameTime: 5_000, timestamp: 1_000 },
    })).resolves.toMatchObject({ source: 'competition', success: true });

    expect(competitionCoordinator.checkpoint).toHaveBeenCalledWith('session-1', {
      score: 500,
      gameTimeMs: 5_000,
      clientTimestampMs: 1_000,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not fall through to legacy if competition finish fails', async () => {
    const competitionCoordinator = coordinator({
      finish: jest.fn(async () => {
        throw new Error('authority conflict');
      }),
    });
    const fetchImpl = jest.fn();

    await expect(routeGameEnd({
      gameSessionId: 'session-1',
      sessionToken: 'legacy-bearer',
      competitionCoordinator,
      fetchImpl: fetchImpl as typeof fetch,
      gameEnd: { finalScore: 999, gameTime: 30_000 },
    })).rejects.toThrow('authority conflict');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps practice sessions on the legacy path', async () => {
    const competitionCoordinator = coordinator({
      hasActiveAttempt: jest.fn(() => false),
    });
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify({
      success: true,
      finalScore: 123,
      isValid: true,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(routeGameEnd({
      gameSessionId: 'session-practice',
      sessionToken: 'legacy-bearer',
      competitionCoordinator,
      fetchImpl: fetchImpl as typeof fetch,
      gameEnd: { finalScore: 123, gameTime: 30_000 },
    })).resolves.toMatchObject({ source: 'legacy', success: true, isValid: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/games/end-session', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('legacy-bearer'),
    }));
  });

  it('recovers a declared competition result after reload and never falls through to legacy', async () => {
    const competitionCoordinator = coordinator({
      hasActiveAttempt: jest.fn(() => false),
    });
    const fetchImpl = jest.fn();

    await expect(routeGameEnd({
      gameSessionId: 'session-reloaded',
      sessionToken: 'legacy-bearer',
      competitionCoordinator,
      fetchImpl: fetchImpl as typeof fetch,
      gameEnd: {
        finalScore: 999,
        gameTime: 30_000,
        competitionAttemptId: 'attempt-reloaded',
      },
    })).resolves.toMatchObject({
      source: 'competition',
      success: true,
      result: { status: 'review' },
    });
    expect(competitionCoordinator.finishDeclared).toHaveBeenCalledWith(
      'session-reloaded',
      'attempt-reloaded',
      expect.objectContaining({ score: 999, gameTimeMs: 30_000 }),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when declared competition authority is malformed', async () => {
    const competitionCoordinator = coordinator({
      hasActiveAttempt: jest.fn(() => false),
    });
    const fetchImpl = jest.fn();

    await expect(routeGameEnd({
      gameSessionId: 'session-reloaded',
      sessionToken: 'legacy-bearer',
      competitionCoordinator,
      fetchImpl: fetchImpl as typeof fetch,
      gameEnd: {
        finalScore: 999,
        gameTime: 30_000,
        competitionAttemptId: null,
      },
    })).rejects.toThrow('Invalid declared competition result authority');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
