import {
  createCompetitionAttemptCoordinator,
  createReloadSafeGameSessionStarter,
} from '@/lib/treasure-hunt-competition/client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Treasure Hunt competition client coordinator', () => {
  it('single-flights attempt creation and advances server-issued receipts', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        attempt: {
          attemptId: 'attempt-1',
          seed: 'seed-1',
          alias: 'Hunter-ABC123',
          status: 'active',
          nextSequence: 0,
          receipt: 'receipt-0',
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: { accepted: true, status: 'active', nextSequence: 1, receipt: 'receipt-1' },
      }));
    const coordinator = createCompetitionAttemptCoordinator({ fetchImpl });

    const [first, replay] = await Promise.all([
      coordinator.start('game-session-1'),
      coordinator.start('game-session-1'),
    ]);
    const checkpoint = await coordinator.checkpoint('game-session-1', {
      score: 100,
      gameTimeMs: 5_000,
      clientTimestampMs: 1000,
    });

    expect(first).toEqual(replay);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, expect.stringContaining('/attempts'), expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ gameSessionId: 'game-session-1' }),
    }));
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/attempt-1/checkpoint'),
      expect.objectContaining({
        body: JSON.stringify({
          receipt: 'receipt-0',
          sequence: 0,
          score: 100,
          gameTimeMs: 5_000,
          clientTimestampMs: 1000,
        }),
      }),
    );
    expect(checkpoint).toMatchObject({ nextSequence: 1, receipt: 'receipt-1' });
  });

  it('adds an initial checkpoint before finishing a game with no periodic checkpoint', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        attempt: {
          attemptId: 'attempt-2', seed: 'seed-2', alias: 'Hunter-DEF456',
          status: 'active', nextSequence: 0, receipt: 'receipt-0',
        },
      }, 201))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: { accepted: true, status: 'active', nextSequence: 1, receipt: 'receipt-1' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: { accepted: true, status: 'review', nextSequence: 2, receipt: null, score: 200 },
      }));
    const coordinator = createCompetitionAttemptCoordinator({ fetchImpl });
    await coordinator.start('game-session-2');

    const result = await coordinator.finish('game-session-2', {
      score: 200,
      gameTimeMs: 30_000,
      clientTimestampMs: 2000,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(String(fetchImpl.mock.calls[1][0])).toContain('/checkpoint');
    expect(String(fetchImpl.mock.calls[2][0])).toContain('/finish');
    expect(result.status).toBe('review');
    expect(coordinator.hasActiveAttempt('game-session-2')).toBe(false);
  });

  it('does not silently fall back when an active competition request fails', async () => {
    const coordinator = createCompetitionAttemptCoordinator({
      fetchImpl: jest.fn().mockResolvedValue(jsonResponse({
        success: false,
        error: 'GAME_SESSION_NOT_ELIGIBLE',
      }, 403)),
    });

    await expect(coordinator.start('game-session-3')).rejects.toMatchObject({
      code: 'GAME_SESSION_NOT_ELIGIBLE',
      status: 403,
    });
    expect(coordinator.hasActiveAttempt('game-session-3')).toBe(false);
  });

  it('retries the identical checkpoint after a lost response', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        attempt: {
          attemptId: 'attempt-4', seed: 'seed-4', alias: 'Hunter-GHI789',
          status: 'active', nextSequence: 0, receipt: 'receipt-0',
        },
      }, 201))
      .mockRejectedValueOnce(new TypeError('connection reset after write'))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: { accepted: true, replayed: true, status: 'active', nextSequence: 1, receipt: 'receipt-1' },
      }));
    const coordinator = createCompetitionAttemptCoordinator({ fetchImpl });
    await coordinator.start('game-session-4');

    await expect(coordinator.checkpoint('game-session-4', {
      score: 100,
      gameTimeMs: 5_000,
      clientTimestampMs: 1000,
    })).resolves.toMatchObject({ nextSequence: 1, receipt: 'receipt-1' });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[1][0]).toBe(fetchImpl.mock.calls[2][0]);
    expect(fetchImpl.mock.calls[1][1]?.body).toBe(fetchImpl.mock.calls[2][1]?.body);
  });

  it('does not reactivate a start that was reset while in flight', async () => {
    let resolveRequest!: (response: Response) => void;
    const fetchImpl = jest.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }));
    const coordinator = createCompetitionAttemptCoordinator({ fetchImpl });
    const pending = coordinator.start('game-session-5');
    coordinator.reset('game-session-5');
    resolveRequest(jsonResponse({
      success: true,
      attempt: {
        attemptId: 'attempt-5', seed: 'seed-5', alias: 'Hunter-JKL012',
        status: 'active', nextSequence: 0, receipt: 'receipt-0',
      },
    }, 201));

    await expect(pending).rejects.toMatchObject({ code: 'ATTEMPT_CANCELLED' });
    expect(coordinator.hasActiveAttempt('game-session-5')).toBe(false);
  });

  it('rehydrates an active declared attempt after a parent reload and finishes it', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        attempts: [{
          attemptId: 'attempt-reloaded',
          seed: 'seed-reloaded',
          alias: 'Hunter-RELOAD',
          status: 'active',
          nextSequence: 4,
          receipt: 'receipt-reloaded',
          score: 400,
          gameTimeMs: 20_000,
        }],
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        result: {
          accepted: true,
          status: 'review',
          nextSequence: 5,
          receipt: null,
          score: 500,
          gameTimeMs: 30_000,
        },
      }));
    const coordinator = createCompetitionAttemptCoordinator({ fetchImpl });

    await expect(coordinator.finishDeclared('game-session-reloaded', 'attempt-reloaded', {
      score: 500,
      gameTimeMs: 30_000,
      clientTimestampMs: 2_000,
    })).resolves.toMatchObject({ status: 'review', score: 500 });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/attempts?limit=500'),
      expect.objectContaining({ method: 'GET', credentials: 'same-origin' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/attempt-reloaded/finish'),
      expect.objectContaining({
        body: JSON.stringify({
          receipt: 'receipt-reloaded',
          sequence: 4,
          score: 500,
          gameTimeMs: 30_000,
          clientTimestampMs: 2_000,
        }),
      }),
    );
  });

  it('recognizes an already durable review after reload without posting another finish', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      success: true,
      attempts: [{
        attemptId: 'attempt-already-review',
        seed: 'seed-review',
        alias: 'Hunter-REVIEW',
        status: 'review',
        nextSequence: 5,
        receipt: null,
        score: 777,
        gameTimeMs: 31_000,
      }],
    }));
    const coordinator = createCompetitionAttemptCoordinator({ fetchImpl });

    await expect(coordinator.finishDeclared('game-session-review', 'attempt-already-review', {
      score: 777,
      gameTimeMs: 31_000,
    })).resolves.toEqual({
      accepted: true,
      status: 'review',
      nextSequence: 5,
      receipt: null,
      score: 777,
      gameTimeMs: 31_000,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never accepts a different score when recovering a terminal declared attempt', async () => {
    const coordinator = createCompetitionAttemptCoordinator({
      fetchImpl: jest.fn().mockResolvedValue(jsonResponse({
        success: true,
        attempts: [{
          attemptId: 'attempt-mismatch', seed: 'seed', alias: 'Hunter-MISMATCH',
          status: 'review', nextSequence: 2, receipt: null, score: 10, gameTimeMs: 100,
        }],
      })),
    });

    await expect(coordinator.finishDeclared('game-session-mismatch', 'attempt-mismatch', {
      score: 11,
      gameTimeMs: 100,
    })).rejects.toMatchObject({ code: 'COMPETITION_RESULT_MISMATCH' });
  });
});

describe('reload-safe parent GameSession starter', () => {
  beforeEach(() => sessionStorage.clear());

  it('stores only an opaque id and resumes the same authenticated session after reload', async () => {
    const sessionId = `game_${'a'.repeat(64)}`;
    const responseBody = {
      success: true,
      sessionId,
      sessionToken: `session_${'b'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    };
    const firstFetch = jest.fn().mockResolvedValue(jsonResponse(responseBody));
    const firstStarter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl: firstFetch,
      storage: sessionStorage,
      idempotencyKeyFactory: () => 'fresh-session-idempotency-0001',
    });

    await expect(firstStarter.start('wallet-user')).resolves.toMatchObject({ sessionId });
    const persisted = JSON.stringify(sessionStorage);
    expect(persisted).toContain(sessionId);
    expect(persisted).not.toContain(responseBody.sessionToken);

    const reloadFetch = jest.fn().mockResolvedValue(jsonResponse(responseBody));
    const reloadedStarter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl: reloadFetch,
      storage: sessionStorage,
      idempotencyKeyFactory: () => 'must-not-be-used-on-resume',
    });
    await expect(reloadedStarter.start('wallet-user')).resolves.toMatchObject({ sessionId });
    expect(JSON.parse(reloadFetch.mock.calls[0][1]?.body as string)).toEqual({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      resumeSessionId: sessionId,
    });
  });

  it('persists a pending idempotency key before the request and reuses it after remount', async () => {
    const pendingKey = 'reload-pending-idempotency-0001';
    const firstFetch = jest.fn().mockRejectedValue(new TypeError('response lost'));
    const firstStarter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl: firstFetch,
      storage: sessionStorage,
      idempotencyKeyFactory: () => pendingKey,
      maxAttempts: 1,
    });

    await expect(firstStarter.start('wallet-user')).rejects.toThrow('response lost');
    expect(JSON.parse(firstFetch.mock.calls[0][1]?.body as string)).toMatchObject({
      idempotencyKey: pendingKey,
    });
    const pendingState = sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    );
    expect(pendingState).toContain(pendingKey);
    expect(pendingState).not.toContain('sessionToken');
    expect(pendingState).not.toContain('bearer');

    const sessionId = `game_${'6'.repeat(64)}`;
    const unusedFactory = jest.fn(() => 'must-not-rotate-uncertain-key');
    const reloadFetch = jest.fn().mockResolvedValue(jsonResponse({
      success: true,
      sessionId,
      sessionToken: `session_${'7'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }));
    const reloadedStarter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl: reloadFetch,
      storage: sessionStorage,
      idempotencyKeyFactory: unusedFactory,
      maxAttempts: 1,
    });

    await expect(reloadedStarter.start('wallet-user')).resolves.toMatchObject({ sessionId });
    expect(unusedFactory).not.toHaveBeenCalled();
    expect(JSON.parse(reloadFetch.mock.calls[0][1]?.body as string)).toMatchObject({
      idempotencyKey: pendingKey,
    });
    const completedState = sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    );
    expect(completedState).toContain(sessionId);
    expect(completedState).not.toContain(pendingKey);
    expect(completedState).not.toContain(`session_${'7'.repeat(43)}`);
  });

  it('rotates a pending key after a definitive response without deleting another owner', async () => {
    const ownerAPendingKey = 'wallet-a-pending-key-0001';
    const ownerBPendingKey = 'wallet-b-pending-key-0001';
    sessionStorage.setItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
      JSON.stringify([
        { ownerKey: 'wallet-a', idempotencyKey: ownerAPendingKey },
        { ownerKey: 'wallet-b', idempotencyKey: ownerBPendingKey },
      ]),
    );
    const freshSessionId = `game_${'8'.repeat(64)}`;
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({
        success: false,
        error: 'INVALID_GAME_SESSION',
      }, 400))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        sessionId: freshSessionId,
        sessionToken: `session_${'9'.repeat(43)}`,
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }));
    const freshKeyFactory = jest.fn(() => 'wallet-a-rotated-key-0002');
    const starter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl,
      storage: sessionStorage,
      idempotencyKeyFactory: freshKeyFactory,
      maxAttempts: 1,
    });

    await expect(starter.start('wallet-a')).rejects.toMatchObject({
      code: 'INVALID_GAME_SESSION',
      status: 400,
    });
    const afterDefinitiveFailure = sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    );
    expect(afterDefinitiveFailure).not.toContain(ownerAPendingKey);
    expect(afterDefinitiveFailure).toContain(ownerBPendingKey);

    await expect(starter.start('wallet-a')).resolves.toMatchObject({
      sessionId: freshSessionId,
    });
    expect(freshKeyFactory).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toMatchObject({
      idempotencyKey: 'wallet-a-rotated-key-0002',
    });
    const completedState = sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    );
    expect(completedState).toContain(ownerBPendingKey);
    expect(completedState).toContain(freshSessionId);
  });

  it('fails closed at the owner cap without evicting stored wallet entries', async () => {
    const storedEntries = Array.from({ length: 16 }, (_, index) => ({
      ownerKey: `wallet-${index}`,
      idempotencyKey: `pending-idempotency-key-${index.toString().padStart(4, '0')}`,
    }));
    const serialized = JSON.stringify(storedEntries);
    sessionStorage.setItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
      serialized,
    );
    const fetchImpl = jest.fn();
    const starter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl,
      storage: sessionStorage,
      idempotencyKeyFactory: () => 'seventeenth-owner-key-0001',
    });

    await expect(starter.start('wallet-16')).rejects.toMatchObject({
      code: 'IDEMPOTENCY_PERSIST_FAILED',
      status: 500,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    )).toBe(serialized);
  });

  it('never reuses an invalid stored key and preserves another valid owner entry', async () => {
    const otherOwnerSession = `game_${'a'.repeat(64)}`;
    sessionStorage.setItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
      JSON.stringify([
        { ownerKey: 'wallet-a', idempotencyKey: 'short' },
        { ownerKey: 'wallet-b', sessionId: otherOwnerSession },
      ]),
    );
    const newSessionId = `game_${'b'.repeat(64)}`;
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      success: true,
      sessionId: newSessionId,
      sessionToken: `session_${'c'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }));
    const starter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl,
      storage: sessionStorage,
      idempotencyKeyFactory: () => 'validated-replacement-key-0001',
    });

    await starter.start('wallet-a');
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toMatchObject({
      idempotencyKey: 'validated-replacement-key-0001',
    });
    const completedState = sessionStorage.getItem(
      'cukies:treasure-hunt:parent-session:v1:sybil-slayer',
    );
    expect(completedState).not.toContain('short');
    expect(completedState).toContain(newSessionId);
    expect(completedState).toContain(otherOwnerSession);
  });

  it('falls back to one fresh idempotent creation when a stored session is no longer resumable', async () => {
    const staleId = `game_${'c'.repeat(64)}`;
    const freshId = `game_${'d'.repeat(64)}`;
    sessionStorage.setItem('cukies:treasure-hunt:parent-session:v1:sybil-slayer', JSON.stringify({
      ownerKey: 'wallet-user',
      sessionId: staleId,
    }));
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ success: false, error: 'Game session could not be resumed' }, 404))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        sessionId: freshId,
        sessionToken: `session_${'e'.repeat(43)}`,
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      }));
    const starter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl,
      storage: sessionStorage,
      idempotencyKeyFactory: () => 'fresh-after-stale-session-0001',
    });

    await expect(starter.start('wallet-user')).resolves.toMatchObject({ sessionId: freshId });
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toMatchObject({
      resumeSessionId: staleId,
    });
    expect(JSON.parse(fetchImpl.mock.calls[1][1]?.body as string)).toMatchObject({
      idempotencyKey: 'fresh-after-stale-session-0001',
    });
  });

  it('keeps opaque resume ids isolated per wallet owner across wallet switches', async () => {
    const walletASession = `game_${'1'.repeat(64)}`;
    const walletBSession = `game_${'2'.repeat(64)}`;
    sessionStorage.setItem('cukies:treasure-hunt:parent-session:v1:sybil-slayer', JSON.stringify([
      { ownerKey: 'wallet-a', sessionId: walletASession },
      { ownerKey: 'wallet-b', sessionId: walletBSession },
    ]));
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({
      success: true,
      sessionId: walletASession,
      sessionToken: `session_${'3'.repeat(43)}`,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    }));
    const starter = createReloadSafeGameSessionStarter({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      fetchImpl,
      storage: sessionStorage,
    });

    await starter.start('wallet-a');
    expect(JSON.parse(fetchImpl.mock.calls[0][1]?.body as string)).toMatchObject({
      resumeSessionId: walletASession,
    });
    expect(sessionStorage.getItem('cukies:treasure-hunt:parent-session:v1:sybil-slayer'))
      .toContain(walletBSession);
  });
});
