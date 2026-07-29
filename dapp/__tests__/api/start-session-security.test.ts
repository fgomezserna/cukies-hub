jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    gameSession: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/game-session-store', () => ({
  createGameSessionDirectly: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/games/start-session/route';
import { createGameSessionDirectly } from '@/lib/game-session-store';
import { prisma } from '@/lib/prisma';
import { readWalletSession } from '@/lib/wallet-auth';

const mockReadWalletSession = readWalletSession as unknown as jest.Mock;
const mockFindUser = prisma.user.findUnique as unknown as jest.Mock;
const mockCreateGameSessionDirectly = createGameSessionDirectly as unknown as jest.Mock;
const mockFindGameSession = prisma.gameSession.findUnique as unknown as jest.Mock;

function request(body: unknown) {
  return new NextRequest('http://localhost/api/games/start-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/games/start-session security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadWalletSession.mockResolvedValue({ userId: 'cookie-user' });
    mockFindUser.mockResolvedValue({ id: 'cookie-user' });
    mockFindGameSession.mockResolvedValue(null);
    mockCreateGameSessionDirectly.mockResolvedValue(undefined);
  });

  it('returns 401 without a wallet session and performs no database lookup', async () => {
    mockReadWalletSession.mockResolvedValue(null);

    const response = await POST(request({ gameId: 'sybil-slayer' }));

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it('rejects a client userId that differs from the signed wallet identity', async () => {
    const response = await POST(
      request({ gameId: 'sybil-slayer', gameVersion: '1.0.0', userId: 'spoofed-user' }),
    );

    expect(response.status).toBe(403);
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{bad-json'],
    ['missing gameId', {}],
    ['unsupported gameId', { gameId: 'unknown-game' }],
    ['invalid idempotency key', { gameId: 'sybil-slayer', idempotencyKey: 'short' }],
  ])('returns 400 for %s', async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it.each(['hyppie-road', 'tower-builder'])('keeps the existing %s caller supported', async (gameId) => {
    const response = await POST(request({ gameId, gameVersion: '1.0.0' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateGameSessionDirectly).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cookie-user',
        gameId,
      }),
    );
    expect(json).toMatchObject({ success: true, gameId });
    expect(json.sessionId).toMatch(/^game_[0-9a-f]{64}$/);
  });

  it('creates the supported game session for the cookie user, not request identity', async () => {
    const response = await POST(
      request({ gameId: 'sybil-slayer', gameVersion: '1.2.3', userId: 'cookie-user' }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockFindUser).toHaveBeenCalledWith({
      where: { id: 'cookie-user' },
      select: { id: true },
    });
    expect(mockCreateGameSessionDirectly).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cookie-user',
        gameId: 'sybil-slayer',
        gameVersion: '1.2.3',
      }),
    );
    expect(json).toMatchObject({
      success: true,
      gameId: 'sybil-slayer',
      gameVersion: '1.2.3',
    });
    expect(json.sessionToken).toMatch(/^session_[A-Za-z0-9_-]{43}$/);
    expect(json.sessionId).toMatch(/^game_[0-9a-f]{64}$/);
  });

  it('returns the same stored session for sequential requests with the same key', async () => {
    const body = {
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      idempotencyKey: 'sequential-idempotency-key-0001',
    };
    const firstResponse = await POST(request(body));
    const first = await firstResponse.json();
    mockFindGameSession.mockResolvedValue({
      sessionId: first.sessionId,
      sessionToken: first.sessionToken,
      userId: 'cookie-user',
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    const secondResponse = await POST(request(body));
    const second = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(second).toEqual(first);
    expect(mockCreateGameSessionDirectly).toHaveBeenCalledTimes(1);
  });

  it('creates a different opaque session for a different idempotency key', async () => {
    const first = await (
      await POST(
        request({
          gameId: 'sybil-slayer',
          idempotencyKey: 'different-idempotency-key-0001',
        }),
      )
    ).json();
    const second = await (
      await POST(
        request({
          gameId: 'sybil-slayer',
          idempotencyKey: 'different-idempotency-key-0002',
        }),
      )
    ).json();

    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(mockCreateGameSessionDirectly).toHaveBeenCalledTimes(2);
  });

  it('resumes an opaque session only for the authenticated wallet and never needs a persisted bearer', async () => {
    const sessionId = `game_${'a'.repeat(64)}`;
    mockFindGameSession.mockResolvedValue({
      sessionId,
      sessionToken: `session_${'b'.repeat(43)}`,
      userId: 'cookie-user',
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    const response = await POST(request({
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      resumeSessionId: sessionId,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      sessionId,
      sessionToken: `session_${'b'.repeat(43)}`,
    });
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it('does not disclose or resume a session owned by another wallet', async () => {
    const sessionId = `game_${'c'.repeat(64)}`;
    mockFindGameSession.mockResolvedValue({
      sessionId,
      sessionToken: `session_${'d'.repeat(43)}`,
      userId: 'another-user',
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    const response = await POST(request({
      gameId: 'sybil-slayer',
      resumeSessionId: sessionId,
    }));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Game session could not be resumed',
    });
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed id', { gameId: 'sybil-slayer', resumeSessionId: 'session-1' }],
    ['ambiguous resume and create', {
      gameId: 'sybil-slayer',
      resumeSessionId: `game_${'e'.repeat(64)}`,
      idempotencyKey: 'resume-must-not-also-create-0001',
    }],
  ])('rejects %s', async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it('recovers a concurrent Mongo duplicate-key race by returning the winning session', async () => {
    let stored:
      | {
          sessionId: string;
          sessionToken: string;
          userId: string;
          gameId: string;
          gameVersion: string | null;
        }
      | null = null;
    mockFindGameSession.mockImplementation(async () => stored);
    mockCreateGameSessionDirectly.mockImplementation(async (data) => {
      if (stored) {
        throw { code: 11000 };
      }
      stored = {
        sessionId: data.sessionId,
        sessionToken: data.sessionToken,
        userId: data.userId,
        gameId: data.gameId,
        gameVersion: data.gameVersion,
      };
    });
    const body = {
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      idempotencyKey: 'concurrent-idempotency-key-0001',
    };

    const [firstResponse, secondResponse] = await Promise.all([
      POST(request(body)),
      POST(request(body)),
    ]);
    const [first, second] = await Promise.all([firstResponse.json(), secondResponse.json()]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      success: true,
      sessionId: expect.stringMatching(/^game_[0-9a-f]{64}$/),
      sessionToken: expect.stringMatching(/^session_[A-Za-z0-9_-]{43}$/),
    });
    expect(mockCreateGameSessionDirectly).toHaveBeenCalledTimes(2);
  });

  it('fails generically when a duplicate-key race has no readable winner', async () => {
    mockCreateGameSessionDirectly.mockRejectedValue({
      code: 11000,
      keyValue: { sessionToken: 'must-not-leak' },
    });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(
      request({
        gameId: 'sybil-slayer',
        idempotencyKey: 'missing-race-winner-key-0001',
      }),
    );
    const json = await response.json();
    errorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(json).toEqual({ success: false, error: 'Internal server error' });
    expect(JSON.stringify(json)).not.toContain('must-not-leak');
  });

  it('returns 409 when a duplicate-key race resolves to an incompatible session', async () => {
    mockFindGameSession
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        sessionId: `game_${'a'.repeat(64)}`,
        sessionToken: `session_${'b'.repeat(43)}`,
        userId: 'another-user',
        gameId: 'sybil-slayer',
        gameVersion: '1.0.0',
      });
    mockCreateGameSessionDirectly.mockRejectedValue({ code: 11000 });

    const response = await POST(
      request({
        gameId: 'sybil-slayer',
        idempotencyKey: 'incompatible-race-winner-0001',
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Game session conflict',
    });
  });

  it('returns a generic 409 for an incoherent deterministic session collision', async () => {
    mockFindGameSession.mockResolvedValue({
      sessionId: `game_${'a'.repeat(64)}`,
      sessionToken: `session_${'b'.repeat(43)}`,
      userId: 'another-user',
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    const response = await POST(
      request({
        gameId: 'sybil-slayer',
        idempotencyKey: 'collision-idempotency-key-0001',
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: 'Game session conflict',
    });
    expect(mockCreateGameSessionDirectly).not.toHaveBeenCalled();
  });

  it('uses non-deterministic cryptographic identifiers for consecutive sessions', async () => {
    const first = await (await POST(request({ gameId: 'sybil-slayer' }))).json();
    const second = await (await POST(request({ gameId: 'sybil-slayer' }))).json();

    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(first.sessionId).not.toBe(second.sessionId);
  });

  it('redacts unexpected failures from the response', async () => {
    mockFindUser.mockRejectedValue(new Error('mongodb://user:secret@example.test'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await POST(request({ gameId: 'sybil-slayer' }));
    const json = await response.json();
    errorSpy.mockRestore();

    expect(response.status).toBe(500);
    expect(json).toEqual({ success: false, error: 'Internal server error' });
    expect(JSON.stringify(json)).not.toContain('secret');
  });
});
