import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { createGameSessionDirectly } from '@/lib/game-session-store';
import { readWalletSession } from '@/lib/wallet-auth';

const SUPPORTED_GAME_IDS: ReadonlySet<string> = new Set([
  'sybil-slayer',
  'hyppie-road',
  'tower-builder',
]);
const DEFAULT_GAME_VERSION = '1.0.0';
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const RESUMABLE_SESSION_ID_PATTERN = /^game_[0-9a-f]{64}$/;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const GAME_SESSION_SELECT = {
  sessionId: true,
  sessionToken: true,
  userId: true,
  gameId: true,
  gameVersion: true,
} as const;

interface ExistingGameSession {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly userId: string;
  readonly gameId: string;
  readonly gameVersion: string | null;
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

function createSessionId(userId: string, gameId: string, idempotencyKey: string) {
  const digest = createHash('sha256')
    .update(JSON.stringify(['cukies-game-session-v1', userId, gameId, idempotencyKey]))
    .digest('hex');
  return `game_${digest}`;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'code' in error &&
      (error.code === 'P2002' || error.code === 11000),
  );
}

function isCompatibleSession(
  session: ExistingGameSession,
  identity: { readonly userId: string; readonly gameId: string },
) {
  return session.userId === identity.userId && session.gameId === identity.gameId;
}

function successResponse(session: ExistingGameSession) {
  return json({
    success: true,
    sessionToken: session.sessionToken,
    sessionId: session.sessionId,
    gameId: session.gameId,
    gameVersion: session.gameVersion ?? DEFAULT_GAME_VERSION,
  });
}

async function findGameSession(sessionId: string): Promise<ExistingGameSession | null> {
  return prisma.gameSession.findUnique({
    where: { sessionId },
    select: GAME_SESSION_SELECT,
  });
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
    const normalizedGameVersion = gameVersion.trim();

    let idempotencyKey: string;
    if (input.idempotencyKey === undefined) {
      // Legacy callers remain compatible, but only callers that reuse a key get replay safety.
      idempotencyKey = randomUUID();
    } else if (
      typeof input.idempotencyKey === 'string' &&
      IDEMPOTENCY_KEY_PATTERN.test(input.idempotencyKey)
    ) {
      idempotencyKey = input.idempotencyKey;
    } else {
      return json({ success: false, error: 'Invalid idempotency key' }, 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: walletSession.userId },
      select: { id: true },
    });
    if (!user) {
      return json({ success: false, error: 'User not found' }, 404);
    }

    const identity = { userId: walletSession.userId, gameId };
    if (input.resumeSessionId !== undefined) {
      if (
        typeof input.resumeSessionId !== 'string' ||
        !RESUMABLE_SESSION_ID_PATTERN.test(input.resumeSessionId) ||
        input.idempotencyKey !== undefined
      ) {
        return json({ success: false, error: 'Invalid resume session' }, 400);
      }
      const resumable = await findGameSession(input.resumeSessionId);
      if (!resumable || !isCompatibleSession(resumable, identity)) {
        // Do not disclose whether an opaque id belongs to another wallet.
        return json({ success: false, error: 'Game session could not be resumed' }, 404);
      }
      return successResponse(resumable);
    }

    const sessionId = createSessionId(identity.userId, identity.gameId, idempotencyKey);
    const existing = await findGameSession(sessionId);
    if (existing) {
      if (!isCompatibleSession(existing, identity)) {
        return json({ success: false, error: 'Game session conflict' }, 409);
      }
      return successResponse(existing);
    }

    const candidate: ExistingGameSession = {
      sessionToken: `session_${randomBytes(32).toString('base64url')}`,
      sessionId,
      userId: identity.userId,
      gameId: identity.gameId,
      gameVersion: normalizedGameVersion,
    };

    try {
      // Prisma's Mongo connector wraps relation-backed writes in a transaction.
      // The integration database is intentionally standalone, so use the driver
      // for this atomic insert while preserving the Prisma-shaped document.
      await createGameSessionDirectly({
        ...candidate,
        gameVersion: candidate.gameVersion ?? DEFAULT_GAME_VERSION,
      });
      return successResponse(candidate);
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      const winner = await findGameSession(sessionId);
      if (!winner) {
        throw error;
      }
      if (!isCompatibleSession(winner, identity)) {
        return json({ success: false, error: 'Game session conflict' }, 409);
      }
      return successResponse(winner);
    }
  } catch {
    console.error('Unexpected error while starting game session');
    return json({ success: false, error: 'Internal server error' }, 500);
  }
}
