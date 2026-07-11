jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    gameSession: { create: jest.fn() },
  },
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/games/start-session/route';
import { prisma } from '@/lib/prisma';
import { readWalletSession } from '@/lib/wallet-auth';

const mockReadWalletSession = readWalletSession as unknown as jest.Mock;
const mockFindUser = prisma.user.findUnique as unknown as jest.Mock;
const mockCreateGameSession = prisma.gameSession.create as unknown as jest.Mock;

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
    expect(json.sessionId).toMatch(new RegExp(`^game_${gameId}_[0-9a-f-]{36}$`));
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
    expect(json.sessionId).toMatch(
      /^game_sybil-slayer_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
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
