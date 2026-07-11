'use client';

import { useEffect, type RefObject } from 'react';

const REQUEST_TYPE = 'TH_MULTIPLAYER_REQUEST';
const RESPONSE_TYPE = 'TH_MULTIPLAYER_RESPONSE';
const MULTIPLAYER_API = '/api/games/treasure-hunt/multiplayer/matches';
const SENSITIVE_QUERY_PARAMETERS = new Set([
  'access_token',
  'auth',
  'authorization',
  'email',
  'gamesessionid',
  'id_token',
  'matchid',
  'playerid',
  'refresh_token',
  'session_token',
  'sessionid',
  'sessiontoken',
  'token',
  'userid',
  'wallet',
  'walletaddress',
]);

type MultiplayerCommand = 'join' | 'get' | 'heartbeat' | 'snapshot';

interface MultiplayerRequest {
  readonly type: typeof REQUEST_TYPE;
  readonly requestId: string;
  readonly command: MultiplayerCommand;
  readonly payload: Record<string, unknown>;
}

interface BridgeErrorPayload {
  readonly code: string;
  readonly message: string;
}

class BridgeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BridgeError';
  }
}

export interface TreasureHuntMultiplayerBridgeOptions {
  readonly iframeRef: RefObject<HTMLIFrameElement>;
  readonly gameUrl: string;
  readonly currentSessionId: string;
  readonly fetchImpl?: typeof fetch;
  readonly windowObject?: Window;
  readonly onRoomJoined?: (roomCode: string) => void;
}

export interface UseTreasureHuntMultiplayerBridgeOptions {
  readonly iframeRef: RefObject<HTMLIFrameElement>;
  readonly gameUrl: string | null | undefined;
  readonly currentSessionId: string | null;
  readonly onRoomJoined?: (roomCode: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseRequest(value: unknown): MultiplayerRequest | null {
  if (!isRecord(value) || value.type !== REQUEST_TYPE) {
    return null;
  }
  if (
    typeof value.requestId !== 'string' ||
    value.requestId.length === 0 ||
    value.requestId.length > 128
  ) {
    return null;
  }
  if (!['join', 'get', 'heartbeat', 'snapshot'].includes(String(value.command))) {
    return null;
  }

  return {
    type: REQUEST_TYPE,
    requestId: value.requestId,
    command: value.command as MultiplayerCommand,
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

function requireRoomCode(value: unknown) {
  if (typeof value !== 'string') {
    throw new BridgeError('INVALID_REQUEST', 'A room code is required');
  }
  const roomCode = value.trim();
  if (roomCode.length === 0 || roomCode.length > 128) {
    throw new BridgeError('INVALID_REQUEST', 'A valid room code is required');
  }
  return roomCode;
}

function publicBridgeError(error: unknown): BridgeErrorPayload {
  if (error instanceof BridgeError) {
    return { code: error.code, message: error.message };
  }
  return { code: 'REQUEST_FAILED', message: 'Multiplayer request failed' };
}

async function readApiResponse(response: Response) {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new BridgeError('REQUEST_FAILED', 'Multiplayer request failed');
  }

  if (!isRecord(value)) {
    throw new BridgeError('REQUEST_FAILED', 'Multiplayer request failed');
  }
  if (!response.ok || value.success !== true) {
    const apiError = isRecord(value.error) ? value.error : null;
    const code =
      apiError && typeof apiError.code === 'string' && apiError.code.length <= 64
        ? apiError.code
        : 'REQUEST_FAILED';
    throw new BridgeError(code, 'Multiplayer request failed');
  }

  const { success: _success, ...data } = value;
  return data;
}

export function buildTreasureHuntInviteUrl(windowObject: Window, roomCode: string) {
  const inviteUrl = new URL(windowObject.location.href);
  const keys = [...inviteUrl.searchParams.keys()];
  for (const key of keys) {
    if (SENSITIVE_QUERY_PARAMETERS.has(key.toLowerCase())) {
      inviteUrl.searchParams.delete(key);
    }
  }
  inviteUrl.searchParams.set('room', roomCode);
  inviteUrl.hash = '';

  windowObject.history.replaceState(
    windowObject.history.state,
    '',
    `${inviteUrl.pathname}${inviteUrl.search}`,
  );
  return inviteUrl.toString();
}

export function createTreasureHuntMultiplayerBridge(
  options: TreasureHuntMultiplayerBridgeOptions,
) {
  const windowObject = options.windowObject ?? window;
  const fetchImpl = options.fetchImpl ?? fetch;
  const targetOrigin = new URL(options.gameUrl, windowObject.location.href).origin;
  const abortControllers = new Set<AbortController>();
  let knownMatchId: string | null = null;
  let knownRoomCode: string | null = null;
  let disposed = false;

  const handleMessage = (event: MessageEvent) => {
    const frameWindow = options.iframeRef.current?.contentWindow;
    if (!frameWindow || event.source !== frameWindow || event.origin !== targetOrigin) {
      return;
    }

    const request = parseRequest(event.data);
    if (!request) {
      return;
    }

    const abortController = new AbortController();
    abortControllers.add(abortController);

    void (async () => {
      try {
        let data: Record<string, unknown>;

        if (request.command === 'join') {
          const roomCode = requireRoomCode(request.payload.roomCode);
          if (knownRoomCode && roomCode !== knownRoomCode) {
            throw new BridgeError(
              'MATCH_PINNED',
              'Multiplayer bridge is already pinned to another room',
            );
          }
          const response = await fetchImpl(MULTIPLAYER_API, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomCode,
              gameSessionId: options.currentSessionId,
            }),
            signal: abortController.signal,
          });
          data = await readApiResponse(response);

          if (!isRecord(data.match) || typeof data.match.matchId !== 'string') {
            throw new BridgeError('INVALID_RESPONSE', 'Multiplayer request failed');
          }
          const canonicalRoomCode = requireRoomCode(data.match.roomCode ?? roomCode);
          if (
            (knownMatchId && data.match.matchId !== knownMatchId) ||
            (knownRoomCode && canonicalRoomCode !== knownRoomCode)
          ) {
            throw new BridgeError(
              'MATCH_PINNED',
              'Multiplayer bridge is already pinned to another match',
            );
          }
          knownMatchId ??= data.match.matchId;
          knownRoomCode ??= canonicalRoomCode;
          const inviteUrl = buildTreasureHuntInviteUrl(windowObject, canonicalRoomCode);
          options.onRoomJoined?.(canonicalRoomCode);
          data = { ...data, inviteUrl };
        } else {
          if (!knownMatchId) {
            throw new BridgeError('MATCH_NOT_JOINED', 'Multiplayer match is not joined');
          }

          const matchPath = `${MULTIPLAYER_API}/${encodeURIComponent(knownMatchId)}`;
          if (request.command === 'get') {
            const query = new URLSearchParams({
              gameSessionId: options.currentSessionId,
            });
            const response = await fetchImpl(`${matchPath}?${query.toString()}`, {
              method: 'GET',
              credentials: 'same-origin',
              signal: abortController.signal,
            });
            data = await readApiResponse(response);
          } else {
            const body: Record<string, unknown> = {
              action: request.command,
              gameSessionId: options.currentSessionId,
            };
            if (request.command === 'snapshot') {
              body.snapshot = request.payload.snapshot;
            }
            const response = await fetchImpl(matchPath, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
              signal: abortController.signal,
            });
            data = await readApiResponse(response);
          }
        }

        if (!disposed && options.iframeRef.current?.contentWindow === frameWindow) {
          frameWindow.postMessage(
            {
              type: RESPONSE_TYPE,
              requestId: request.requestId,
              success: true,
              data,
            },
            targetOrigin,
          );
        }
      } catch (error) {
        if (!disposed && options.iframeRef.current?.contentWindow === frameWindow) {
          frameWindow.postMessage(
            {
              type: RESPONSE_TYPE,
              requestId: request.requestId,
              success: false,
              error: publicBridgeError(error),
            },
            targetOrigin,
          );
        }
      } finally {
        abortControllers.delete(abortController);
      }
    })();
  };

  windowObject.addEventListener('message', handleMessage);
  return () => {
    disposed = true;
    windowObject.removeEventListener('message', handleMessage);
    for (const controller of abortControllers) {
      controller.abort();
    }
    abortControllers.clear();
  };
}

export function useTreasureHuntMultiplayerBridge(
  options: UseTreasureHuntMultiplayerBridgeOptions,
) {
  useEffect(() => {
    if (!options.gameUrl || !options.currentSessionId) {
      return undefined;
    }

    try {
      return createTreasureHuntMultiplayerBridge({
        iframeRef: options.iframeRef,
        gameUrl: options.gameUrl,
        currentSessionId: options.currentSessionId,
        onRoomJoined: options.onRoomJoined,
      });
    } catch {
      return undefined;
    }
  }, [
    options.currentSessionId,
    options.gameUrl,
    options.iframeRef,
    options.onRoomJoined,
  ]);
}

export interface ParentGameSession {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly gameId: string;
  readonly gameVersion: string;
}

export interface SingleFlightGameSessionStarterOptions {
  readonly gameId: string;
  readonly gameVersion: string;
  readonly fetchImpl?: typeof fetch;
}

export function createSingleFlightGameSessionStarter(
  options: SingleFlightGameSessionStarterOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  let session: ParentGameSession | null = null;
  let inFlight: Promise<ParentGameSession> | null = null;

  return {
    start() {
      if (session) {
        return Promise.resolve(session);
      }
      if (inFlight) {
        return inFlight;
      }

      inFlight = (async () => {
        const response = await fetchImpl('/api/games/start-session', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: options.gameId,
            gameVersion: options.gameVersion,
          }),
        });
        const data = await readApiResponse(response);
        if (
          typeof data.sessionId !== 'string' ||
          typeof data.sessionToken !== 'string' ||
          typeof data.gameId !== 'string' ||
          typeof data.gameVersion !== 'string'
        ) {
          throw new BridgeError('INVALID_RESPONSE', 'Game session could not be started');
        }

        session = {
          sessionId: data.sessionId,
          sessionToken: data.sessionToken,
          gameId: data.gameId,
          gameVersion: data.gameVersion,
        };
        return session;
      })().finally(() => {
        inFlight = null;
      });

      return inFlight;
    },
    reset() {
      session = null;
    },
  };
}
