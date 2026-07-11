import { NextResponse } from 'next/server';

import { MultiplayerDomainError } from '@/lib/treasure-hunt-multiplayer/errors';
import type { TreasureHuntMultiplayerService } from '@/lib/treasure-hunt-multiplayer/service';

const SUPPORTED_GAME_ID = 'sybil-slayer';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

interface WalletSessionIdentity {
  readonly userId: string;
}

export interface MultiplayerGameSession {
  readonly sessionId: string;
  readonly userId: string;
  readonly gameId: string;
  readonly isActive: boolean;
}

type MultiplayerService = Pick<
  TreasureHuntMultiplayerService,
  'createOrJoin' | 'getForParticipant' | 'heartbeat' | 'updateSnapshot'
>;

export interface TreasureHuntMultiplayerHandlerDependencies {
  readonly readWalletSession: () => Promise<WalletSessionIdentity | null>;
  readonly findGameSessionBySessionId: (
    sessionId: string,
  ) => Promise<MultiplayerGameSession | null>;
  readonly getService: () => MultiplayerService;
}

type RequestBody = Record<string, unknown>;

class MultiplayerApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'MultiplayerApiError';
  }
}

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

function invalidRequest(message: string): never {
  throw new MultiplayerApiError(400, 'INVALID_REQUEST', message);
}

function requireIdentifier(value: unknown, field: string) {
  if (typeof value !== 'string') {
    return invalidRequest(`${field} is required`);
  }

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    return invalidRequest(`${field} must be a non-empty string of at most 128 characters`);
  }
  return normalized;
}

async function parseBody(request: Request): Promise<RequestBody> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidRequest('Request body must be valid JSON');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalidRequest('Request body must be a JSON object');
  }
  return body as RequestBody;
}

function rejectClientIdentity(body: RequestBody) {
  if (
    Object.prototype.hasOwnProperty.call(body, 'userId') ||
    Object.prototype.hasOwnProperty.call(body, 'playerId')
  ) {
    invalidRequest('Client-controlled multiplayer identity is not accepted');
  }
}

async function requireWalletIdentity(
  dependencies: TreasureHuntMultiplayerHandlerDependencies,
) {
  const walletSession = await dependencies.readWalletSession();
  if (!walletSession) {
    throw new MultiplayerApiError(401, 'UNAUTHENTICATED', 'Wallet session is required');
  }
  return walletSession;
}

async function authorize(
  dependencies: TreasureHuntMultiplayerHandlerDependencies,
  walletSession: WalletSessionIdentity,
  gameSessionIdInput: unknown,
) {
  const gameSessionId = requireIdentifier(gameSessionIdInput, 'gameSessionId');
  const gameSession = await dependencies.findGameSessionBySessionId(gameSessionId);
  if (!gameSession) {
    throw new MultiplayerApiError(404, 'GAME_SESSION_NOT_FOUND', 'Game session was not found');
  }

  if (
    !gameSession.isActive ||
    gameSession.gameId !== SUPPORTED_GAME_ID ||
    gameSession.userId !== walletSession.userId
  ) {
    throw new MultiplayerApiError(
      403,
      'GAME_SESSION_FORBIDDEN',
      'Game session is not authorized for this operation',
    );
  }

  return {
    userId: walletSession.userId,
    gameSessionId: gameSession.sessionId,
  };
}

async function execute(operation: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof MultiplayerApiError) {
      return json(
        { success: false, error: { code: error.code, message: error.message } },
        error.statusCode,
      );
    }
    if (error instanceof MultiplayerDomainError) {
      return json(
        { success: false, error: { code: error.code, message: error.message } },
        error.statusCode,
      );
    }

    console.error('Unexpected Treasure Hunt multiplayer API error');
    return json(
      {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      },
      500,
    );
  }
}

export function createTreasureHuntMultiplayerHandlers(
  dependencies: TreasureHuntMultiplayerHandlerDependencies,
) {
  return {
    createOrJoin(request: Request) {
      return execute(async () => {
        const walletSession = await requireWalletIdentity(dependencies);
        const body = await parseBody(request);
        rejectClientIdentity(body);
        const identity = await authorize(dependencies, walletSession, body.gameSessionId);

        const result = await dependencies.getService().createOrJoin({
          roomCode: requireIdentifier(body.roomCode, 'roomCode'),
          ...identity,
        });
        return json({ success: true, ...result });
      });
    },

    get(request: Request, matchIdInput: string) {
      return execute(async () => {
        const walletSession = await requireWalletIdentity(dependencies);
        const matchId = requireIdentifier(matchIdInput, 'matchId');
        const gameSessionId = new URL(request.url).searchParams.get('gameSessionId');
        const identity = await authorize(dependencies, walletSession, gameSessionId);
        const match = await dependencies.getService().getForParticipant({ matchId, ...identity });
        return json({ success: true, match });
      });
    },

    operate(request: Request, matchIdInput: string) {
      return execute(async () => {
        const walletSession = await requireWalletIdentity(dependencies);
        const matchId = requireIdentifier(matchIdInput, 'matchId');
        const body = await parseBody(request);
        rejectClientIdentity(body);
        const identity = await authorize(dependencies, walletSession, body.gameSessionId);
        const service = dependencies.getService();

        if (body.action === 'heartbeat') {
          const match = await service.heartbeat({ matchId, ...identity });
          return json({ success: true, match });
        }
        if (body.action === 'snapshot') {
          if (!Object.prototype.hasOwnProperty.call(body, 'snapshot')) {
            return invalidRequest('snapshot is required for the snapshot action');
          }
          const match = await service.updateSnapshot({
            matchId,
            ...identity,
            snapshot: body.snapshot,
          });
          return json({ success: true, match });
        }

        return invalidRequest('action must be heartbeat or snapshot');
      });
    },
  };
}
