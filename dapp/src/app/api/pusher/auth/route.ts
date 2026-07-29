import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { pusherServer } from '@/lib/pusher-server';
import { readWalletSession } from '@/lib/wallet-auth';

const GAME_ID = 'sybil-slayer';
const CHANNEL_PREFIX = 'private-game-session-';
const SOCKET_ID_PATTERN = /^\d+\.\d+$/;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function json(payload: unknown, status: number) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

function firstForwardedValue(value: string | null) {
  return value?.split(',', 1)[0]?.trim() || null;
}

function publicRequestOrigin(request: NextRequest) {
  const host = firstForwardedValue(request.headers.get('x-forwarded-host')) ??
    firstForwardedValue(request.headers.get('host'));
  const protocol = firstForwardedValue(request.headers.get('x-forwarded-proto')) ??
    request.nextUrl.protocol.replace(/:$/, '');

  if (!host || (protocol !== 'http' && protocol !== 'https')) return null;

  try {
    const url = new URL(`${protocol}://${host}`);
    if (
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function isAllowedBrowserOrigin(request: NextRequest, origin: string) {
  let normalizedOrigin: string;
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) return false;
    normalizedOrigin = parsed.origin;
  } catch {
    return false;
  }

  const allowedOrigins = new Set([request.nextUrl.origin]);
  const forwardedOrigin = publicRequestOrigin(request);
  if (forwardedOrigin) allowedOrigins.add(forwardedOrigin);
  return allowedOrigins.has(normalizedOrigin);
}

export async function OPTIONS() {
  return new Response(null, {
    status: 405,
    headers: { ...NO_STORE_HEADERS, Allow: 'POST' },
  });
}

export async function POST(request: NextRequest) {
  try {
    const requestOrigin = request.headers.get('origin');
    if (requestOrigin && !isAllowedBrowserOrigin(request, requestOrigin)) {
      return json({ error: 'Forbidden' }, 403);
    }

    const walletSession = await readWalletSession();
    if (!walletSession) return json({ error: 'Unauthorized' }, 401);

    const mediaType = (request.headers.get('content-type') ?? '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (mediaType !== 'application/x-www-form-urlencoded') {
      return json({ error: 'Unsupported content type' }, 415);
    }

    const params = new URLSearchParams(await request.text());
    const socketId = params.get('socket_id') ?? '';
    const channelName = params.get('channel_name') ?? '';
    const sessionToken = params.get('session_token') ?? '';
    if (
      !SOCKET_ID_PATTERN.test(socketId) ||
      !channelName.startsWith(CHANNEL_PREFIX) ||
      sessionToken.length < 16 ||
      sessionToken.length > 256
    ) {
      return json({ error: 'Invalid authorization request' }, 400);
    }

    const channelSessionId = channelName.slice(CHANNEL_PREFIX.length);
    if (!IDENTIFIER_PATTERN.test(channelSessionId)) {
      return json({ error: 'Invalid authorization request' }, 400);
    }

    const gameSession = await prisma.gameSession.findUnique({
      where: { sessionToken },
      select: {
        sessionId: true,
        userId: true,
        gameId: true,
        isActive: true,
      },
    });
    if (
      !gameSession ||
      !gameSession.isActive ||
      gameSession.gameId !== GAME_ID ||
      gameSession.userId !== walletSession.userId ||
      gameSession.sessionId !== channelSessionId ||
      channelName !== `${CHANNEL_PREFIX}${gameSession.sessionId}`
    ) {
      return json({ error: 'Forbidden' }, 403);
    }

    const authResponse = pusherServer.authorizeChannel(socketId, channelName, {
      user_id: walletSession.userId,
    });
    return NextResponse.json(authResponse, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch {
    return json({ error: 'Internal server error' }, 500);
  }
}
