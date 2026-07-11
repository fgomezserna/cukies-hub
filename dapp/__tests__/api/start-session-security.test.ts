jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    gameSession: { create: jest.fn(), findUnique: jest.fn() },
  },
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/games/start-session/route';
import { prisma } from '@/lib/prisma';
import { readWalletSession } from '@/lib/wallet-auth';

const mockReadWalletSession = readWalletSession as unknown as jest.Mock;
const mockFindUser = prisma.user.findUnique as unknown as jest.Mock;
const mockCreateGameSession = prisma.gameSession.create as unknown as jest.Mock;
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
    mockCreateGameSession.mockImplementation(async ({ data }) => ({ id: 'mongo-id', ...data }));
  });

  it('returns 401 without a wallet session and performs no database lookup', async () => {
    mockReadWalletSession.mockResolvedValue(null);

    const response = await POST(request({ gameId: 'sybil-slayer' }));

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockCreateGameSession).not.toHaveBeenCalled();
  });

  it('rejects a client userId that differs from the signed wallet identity', async () => {
    const response = await POST(
      request({ gameId: 'sybil-slayer', gameVersion: '1.0.0', userId: 'spoofed-user' }),
    );

    expect(response.status).toBe(403);
    expect(mockCreateGameSession).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', '{bad-json'],
    ['missing gameId', {}],
    ['unsupported gameId', { gameId: 'unknown-game' }],
    ['invalid idempotency key', { gameId: 'sybil-slayer', idempotencyKey: 'short' }],
  ])('returns 400 for %s', async (_label, body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(mockCreateGameSession).not.toHaveBeenCalled();
  });

  it.each(['hyppie-road', 'tower-builder'])('keeps the existing %s caller supported', async (gameId) => {
    const response = await POST(request({ gameId, gameVersion: '1.0.0' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateGameSession).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'cookie-user',
        gameId,
        isActive: true,
      }),
    });
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
    expect(mockCreateGameSession).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'cookie-user',
        gameId: 'sybil-slayer',
        gameVersion: '1.2.3',
        isActive: true,
      }),
    });
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
    expect(mockCreateGameSession).toHaveBeenCalledTimes(1);
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
    expect(mockCreateGameSession).toHaveBeenCalledTimes(2);
  });

  it('recovers a concurrent P2002 race by returning the winning session', async () => {
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
    mockCreateGameSession.mockImplementation(async ({ data }) => {
      if (stored) {
        throw { code: 'P2002' };
      }
      stored = {
        sessionId: data.sessionId,
        sessionToken: data.sessionToken,
        userId: data.userId,
        gameId: data.gameId,
        gameVersion: data.gameVersion,
      };
      return { id: 'winner-id', ...data };
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
    expect(mockCreateGameSession).toHaveBeenCalledTimes(2);
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
    expect(mockCreateGameSession).not.toHaveBeenCalled();
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
