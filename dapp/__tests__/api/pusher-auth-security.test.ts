jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameSession: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/pusher-server', () => ({
  pusherServer: { authorizeChannel: jest.fn() },
}));

import { NextRequest } from 'next/server';

import { POST as authorizePusher, OPTIONS as pusherOptions } from '@/app/api/pusher/auth/route';
import { POST as retiredSimpleAuth } from '@/app/api/pusher/auth-simple/route';
import { prisma } from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher-server';
import { readWalletSession } from '@/lib/wallet-auth';

const mockReadWalletSession = readWalletSession as unknown as jest.Mock;
const mockFindGameSession = prisma.gameSession.findUnique as unknown as jest.Mock;
const mockAuthorizeChannel = pusherServer.authorizeChannel as unknown as jest.Mock;

function request(
  overrides: Record<string, string> = {},
  headers: Record<string, string> = {},
) {
  const params = new URLSearchParams({
    socket_id: '123.456',
    channel_name: 'private-game-session-game_session_1',
    session_token: 'session_memory_only_token_123456',
    ...overrides,
  });
  return new NextRequest('http://localhost/api/pusher/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: params.toString(),
  });
}

describe('POST /api/pusher/auth security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadWalletSession.mockResolvedValue({ userId: 'wallet-user' });
    mockFindGameSession.mockResolvedValue({
      sessionId: 'game_session_1',
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
    });
    mockAuthorizeChannel.mockReturnValue({ auth: 'signed-auth' });
  });

  it('requires the wallet session before looking up the bearer', async () => {
    mockReadWalletSession.mockResolvedValue(null);
    const response = await authorizePusher(request());
    expect(response.status).toBe(401);
    expect(mockFindGameSession).not.toHaveBeenCalled();
  });

  it('rejects cross-origin browser requests before reading wallet state', async () => {
    const crossOriginRequest = request();
    crossOriginRequest.headers.set('Origin', 'https://attacker.example');
    const response = await authorizePusher(crossOriginRequest);
    expect(response.status).toBe(403);
    expect(mockReadWalletSession).not.toHaveBeenCalled();
    expect(mockFindGameSession).not.toHaveBeenCalled();
  });

  it('accepts the public origin forwarded by the trusted reverse proxy', async () => {
    const response = await authorizePusher(request({}, {
      Origin: 'https://cukieshub.eurekand.com',
      'X-Forwarded-Host': 'cukieshub.eurekand.com',
      'X-Forwarded-Proto': 'https',
    }));

    expect(response.status).toBe(200);
    expect(mockReadWalletSession).toHaveBeenCalledTimes(1);
    expect(mockAuthorizeChannel).toHaveBeenCalledTimes(1);
  });

  it('still rejects a foreign origin behind the reverse proxy', async () => {
    const response = await authorizePusher(request({}, {
      Origin: 'https://attacker.example',
      'X-Forwarded-Host': 'cukieshub.eurekand.com',
      'X-Forwarded-Proto': 'https',
    }));

    expect(response.status).toBe(403);
    expect(mockReadWalletSession).not.toHaveBeenCalled();
    expect(mockFindGameSession).not.toHaveBeenCalled();
  });

  it.each([
    ['foreign owner', { userId: 'other-user', isActive: true, gameId: 'sybil-slayer' }],
    ['inactive session', { userId: 'wallet-user', isActive: false, gameId: 'sybil-slayer' }],
    ['wrong game', { userId: 'wallet-user', isActive: true, gameId: 'hyppie-road' }],
  ])('rejects a %s', async (_label, overrides) => {
    mockFindGameSession.mockResolvedValue({ sessionId: 'game_session_1', ...overrides });
    const response = await authorizePusher(request());
    expect(response.status).toBe(403);
    expect(mockAuthorizeChannel).not.toHaveBeenCalled();
  });

  it('rejects an arbitrary channel even with a valid owned token', async () => {
    const response = await authorizePusher(request({
      channel_name: 'private-game-session-attacker_session',
    }));
    expect(response.status).toBe(403);
    expect(mockAuthorizeChannel).not.toHaveBeenCalled();
  });

  it('rejects an unknown or foreign bearer', async () => {
    mockFindGameSession.mockResolvedValue(null);
    const response = await authorizePusher(request({ session_token: 'foreign_session_token_123456789' }));
    expect(response.status).toBe(403);
    expect(mockAuthorizeChannel).not.toHaveBeenCalled();
  });

  it('authorizes only the exact active owned session channel without CORS wildcard', async () => {
    const response = await authorizePusher(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ auth: 'signed-auth' });
    expect(mockFindGameSession).toHaveBeenCalledWith({
      where: { sessionToken: 'session_memory_only_token_123456' },
      select: { sessionId: true, userId: true, gameId: true, isActive: true },
    });
    expect(mockAuthorizeChannel).toHaveBeenCalledWith(
      '123.456',
      'private-game-session-game_session_1',
      { user_id: 'wallet-user' },
    );
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('does not expose a permissive preflight and retires auth-simple', async () => {
    const preflight = await pusherOptions();
    const retired = await retiredSimpleAuth();
    expect(preflight.status).toBe(405);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(retired.status).toBe(410);
  });
});
