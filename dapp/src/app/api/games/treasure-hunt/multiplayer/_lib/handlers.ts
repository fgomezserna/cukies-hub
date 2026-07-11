import { NextResponse } from 'next/server';

import { MultiplayerDomainError } from '@/lib/treasure-hunt-multiplayer/errors';
import type { TreasureHuntMultiplayerService } from '@/lib/treasure-hunt-multiplayer/service';

import type { MultiplayerRateLimitOperation } from './rate-limit';

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
  readonly mode: string | null;
  readonly rewardEligible: boolean | null;
}

type MultiplayerService = Pick<
  TreasureHuntMultiplayerService,
  'createOrJoin' | 'getForParticipant' | 'heartbeat' | 'updateSnapshot' | 'forfeit'
>;

export interface TreasureHuntMultiplayerHandlerDependencies {
  readonly isFeatureEnabled: () => boolean;
  readonly readWalletSession: () => Promise<WalletSessionIdentity | null>;
  readonly findGameSessionBySessionId: (
    sessionId: string,
  ) => Promise<MultiplayerGameSession | null>;
  readonly lockGameSessionForMultiplayer: (identity: {
    readonly userId: string;
    readonly gameSessionId: string;
  }) => Promise<boolean>;
  readonly consumeRateLimit: (input: {
    readonly userId: string;
    readonly gameSessionId: string;
    readonly operation: MultiplayerRateLimitOperation;
  }) => boolean;
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

function requireFeatureEnabled(dependencies: TreasureHuntMultiplayerHandlerDependencies) {
  if (!dependencies.isFeatureEnabled()) {
    throw new MultiplayerApiError(404, 'NOT_FOUND', 'Not found');
  }
}

export function isTreasureHuntMultiplayerFeatureEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  return (
    environment.NODE_ENV !== 'production' ||
    environment.TREASURE_HUNT_MULTIPLAYER_ENABLED === 'true'
  );
}

function requireRateLimit(
  dependencies: TreasureHuntMultiplayerHandlerDependencies,
  identity: { readonly userId: string; readonly gameSessionId: string },
  operation: MultiplayerRateLimitOperation,
) {
  if (!dependencies.consumeRateLimit({ ...identity, operation })) {
    throw new MultiplayerApiError(429, 'RATE_LIMITED', 'Too many requests');
  }
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
  requireMultiplayerLock = true,
) {
  const gameSessionId = requireIdentifier(gameSessionIdInput, 'gameSessionId');
  const gameSession = await dependencies.findGameSessionBySessionId(gameSessionId);
  if (!gameSession) {
    throw new MultiplayerApiError(404, 'GAME_SESSION_NOT_FOUND', 'Game session was not found');
  }

  if (
    gameSession.gameId !== SUPPORTED_GAME_ID ||
    gameSession.userId !== walletSession.userId
  ) {
    throw new MultiplayerApiError(
      403,
      'GAME_SESSION_FORBIDDEN',
      'Game session is not authorized for this operation',
    );
  }

  const isMultiplayerLocked =
    gameSession.mode === 'staging_unranked' && gameSession.rewardEligible === false;
  if (
    !gameSession.isActive ||
    (requireMultiplayerLock && !isMultiplayerLocked)
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
      if (error.statusCode === 404) {
        return json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
          404,
        );
      }
      return json(
        { success: false, error: { code: error.code, message: error.message } },
        error.statusCode,
      );
    }
    if (error instanceof MultiplayerDomainError) {
      if (error.statusCode === 404) {
        return json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
          404,
        );
      }
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
        requireFeatureEnabled(dependencies);
        const walletSession = await requireWalletIdentity(dependencies);
        const body = await parseBody(request);
        rejectClientIdentity(body);
        const roomCode = requireIdentifier(body.roomCode, 'roomCode');
        const identity = await authorize(
          dependencies,
          walletSession,
          body.gameSessionId,
          false,
        );
        requireRateLimit(dependencies, identity, 'join');
        if (!(await dependencies.lockGameSessionForMultiplayer(identity))) {
          throw new MultiplayerApiError(
            403,
            'GAME_SESSION_FORBIDDEN',
            'Game session is not authorized for this operation',
          );
        }

        const result = await dependencies.getService().createOrJoin({
          roomCode,
          ...identity,
        });
        return json({ success: true, ...result });
      });
    },

    get(request: Request, matchIdInput: string) {
      return execute(async () => {
        requireFeatureEnabled(dependencies);
        const walletSession = await requireWalletIdentity(dependencies);
        const matchId = requireIdentifier(matchIdInput, 'matchId');
        const gameSessionId = new URL(request.url).searchParams.get('gameSessionId');
        const identity = await authorize(dependencies, walletSession, gameSessionId);
        requireRateLimit(dependencies, identity, 'get');
        const match = await dependencies.getService().getForParticipant({ matchId, ...identity });
        return json({ success: true, match });
      });
    },

    operate(request: Request, matchIdInput: string) {
      return execute(async () => {
        requireFeatureEnabled(dependencies);
        const walletSession = await requireWalletIdentity(dependencies);
        const matchId = requireIdentifier(matchIdInput, 'matchId');
        const body = await parseBody(request);
        rejectClientIdentity(body);
        const identity = await authorize(dependencies, walletSession, body.gameSessionId);

        if (body.action === 'heartbeat') {
          requireRateLimit(dependencies, identity, 'heartbeat');
          const service = dependencies.getService();
          const match = await service.heartbeat({ matchId, ...identity });
          return json({ success: true, match });
        }
        if (body.action === 'snapshot') {
          requireRateLimit(dependencies, identity, 'snapshot');
          if (!Object.prototype.hasOwnProperty.call(body, 'snapshot')) {
            return invalidRequest('snapshot is required for the snapshot action');
          }
          const service = dependencies.getService();
          const match = await service.updateSnapshot({
            matchId,
            ...identity,
            snapshot: body.snapshot,
          });
          return json({ success: true, match });
        }

        if (body.action === 'forfeit') {
          requireRateLimit(dependencies, identity, 'forfeit');
          const service = dependencies.getService();
          const match = await service.forfeit({ matchId, ...identity });
          return json({ success: true, match });
        }

        return invalidRequest('action must be heartbeat, snapshot or forfeit');
      });
    },
  };
}
