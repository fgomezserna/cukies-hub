import { randomBytes, randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { readWalletSession } from '@/lib/wallet-auth';

const SUPPORTED_GAME_IDS: ReadonlySet<string> = new Set([
  'sybil-slayer',
  'hyppie-road',
  'tower-builder',
]);
const DEFAULT_GAME_VERSION = '1.0.0';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const walletSession = await readWalletSession();
    if (!walletSession) {
      return json({ success: false, error: 'Wallet session is required' }, 401);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ success: false, error: 'Request body must be valid JSON' }, 400);
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ success: false, error: 'Request body must be a JSON object' }, 400);
    }

    const input = body as Record<string, unknown>;
    if (
      Object.prototype.hasOwnProperty.call(input, 'userId') &&
      input.userId !== walletSession.userId
    ) {
      return json({ success: false, error: 'User identity does not match wallet session' }, 403);
    }

    if (typeof input.gameId !== 'string' || !SUPPORTED_GAME_IDS.has(input.gameId)) {
      return json({ success: false, error: 'Unsupported game' }, 400);
    }
    const gameId = input.gameId;

    const gameVersion = input.gameVersion ?? DEFAULT_GAME_VERSION;
    if (
      typeof gameVersion !== 'string' ||
      gameVersion.trim().length === 0 ||
      gameVersion.length > 64
    ) {
      return json({ success: false, error: 'Invalid game version' }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: walletSession.userId },
      select: { id: true },
    });
    if (!user) {
      return json({ success: false, error: 'User not found' }, 404);
    }

    const sessionToken = `session_${randomBytes(32).toString('base64url')}`;
    const sessionId = `game_${gameId}_${randomUUID()}`;

    await prisma.gameSession.create({
      data: {
        sessionToken,
        sessionId,
        userId: walletSession.userId,
        gameId,
        gameVersion: gameVersion.trim(),
        isActive: true,
      },
    });

    return json({
      success: true,
      sessionToken,
      sessionId,
      gameId,
      gameVersion: gameVersion.trim(),
    });
  } catch {
    console.error('Unexpected error while starting game session');
    return json({ success: false, error: 'Internal server error' }, 500);
  }
}
