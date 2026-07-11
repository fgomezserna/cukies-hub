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
  const inFlightRequestIds = new Set<string>();
  let knownMatchId: string | null = null;
  let knownRoomCode: string | null = null;
  let pendingRoomCode: string | null = null;
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
    if (inFlightRequestIds.has(request.requestId)) {
      frameWindow.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: request.requestId,
          success: false,
          error: {
            code: 'DUPLICATE_REQUEST_ID',
            message: 'A request with this requestId is already in progress',
          },
        },
        targetOrigin,
      );
      return;
    }
    inFlightRequestIds.add(request.requestId);

    const abortController = new AbortController();
    abortControllers.add(abortController);

    void (async () => {
      let ownedPendingRoomCode: string | null = null;
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
          if (pendingRoomCode) {
            throw new BridgeError(
              'JOIN_IN_PROGRESS',
              'A multiplayer room join is already in progress',
            );
          }
          pendingRoomCode = roomCode;
          ownedPendingRoomCode = roomCode;
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
          if (disposed || abortController.signal.aborted) {
            return;
          }

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
        if (ownedPendingRoomCode && pendingRoomCode === ownedPendingRoomCode) {
          pendingRoomCode = null;
        }
        inFlightRequestIds.delete(request.requestId);
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
    inFlightRequestIds.clear();
    pendingRoomCode = null;
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
  readonly idempotencyKeyFactory?: () => string;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
}

function createGameSessionIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error('Web Crypto is required to start a game session');
  }
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function gameSessionAbortError() {
  return new DOMException('Game session start was cancelled', 'AbortError');
}

function waitForGameSessionRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(gameSessionAbortError());
  }
  if (delayMs === 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeoutId);
      reject(gameSessionAbortError());
    };
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

export function createSingleFlightGameSessionStarter(
  options: SingleFlightGameSessionStarterOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const idempotencyKeyFactory =
    options.idempotencyKeyFactory ?? createGameSessionIdempotencyKey;
  const maxAttempts = options.maxAttempts ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 100;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new TypeError('maxAttempts must be an integer between 1 and 5');
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 10_000) {
    throw new TypeError('retryDelayMs must be between 0 and 10000');
  }

  let generation = 0;
  let cached: { ownerKey: string; session: ParentGameSession } | null = null;
  let inFlight: {
    ownerKey: string;
    generation: number;
    controller: AbortController;
    promise: Promise<ParentGameSession>;
  } | null = null;

  const reset = () => {
    generation += 1;
    cached = null;
    inFlight?.controller.abort();
    inFlight = null;
  };

  const assertCurrent = (runGeneration: number, controller: AbortController) => {
    if (controller.signal.aborted || generation !== runGeneration) {
      throw gameSessionAbortError();
    }
  };

  return {
    start(ownerKeyInput: string) {
      const ownerKey = ownerKeyInput.trim();
      if (!ownerKey) {
        return Promise.reject(new BridgeError('INVALID_OWNER', 'Game session owner is required'));
      }

      if (cached?.ownerKey === ownerKey) {
        return Promise.resolve(cached.session);
      }
      if (inFlight) {
        if (inFlight.ownerKey === ownerKey) {
          return inFlight.promise;
        }
        reset();
      } else if (cached) {
        reset();
      }

      const runGeneration = ++generation;
      const controller = new AbortController();
      let idempotencyKey: string;
      try {
        idempotencyKey = idempotencyKeyFactory();
      } catch {
        return Promise.reject(
          new BridgeError('IDEMPOTENCY_UNAVAILABLE', 'Game session request key is unavailable'),
        );
      }
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
        return Promise.reject(
          new BridgeError('INVALID_IDEMPOTENCY_KEY', 'Game session request key is invalid'),
        );
      }
      const requestBody = JSON.stringify({
        gameId: options.gameId,
        gameVersion: options.gameVersion,
        idempotencyKey,
      });
      const request = (async () => {
        // Deferring one microtask lets React StrictMode cancel its probe mount before any POST.
        await Promise.resolve();
        assertCurrent(runGeneration, controller);

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          let receivedResponse = false;
          let responseStatus = 0;
          try {
            const response = await fetchImpl('/api/games/start-session', {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'Content-Type': 'application/json' },
              body: requestBody,
              signal: controller.signal,
            });
            receivedResponse = true;
            responseStatus = response.status;
            const data = await readApiResponse(response);
            assertCurrent(runGeneration, controller);
            if (
              typeof data.sessionId !== 'string' ||
              typeof data.sessionToken !== 'string' ||
              typeof data.gameId !== 'string' ||
              typeof data.gameVersion !== 'string'
            ) {
              throw new BridgeError('INVALID_RESPONSE', 'Game session could not be started');
            }

            return {
              sessionId: data.sessionId,
              sessionToken: data.sessionToken,
              gameId: data.gameId,
              gameVersion: data.gameVersion,
            };
          } catch (error) {
            assertCurrent(runGeneration, controller);
            const retryable = !receivedResponse || responseStatus >= 500;
            if (!retryable || attempt >= maxAttempts) {
              throw error;
            }
            await waitForGameSessionRetry(retryDelayMs, controller.signal);
            assertCurrent(runGeneration, controller);
          }
        }

        throw new BridgeError('REQUEST_FAILED', 'Game session could not be started');
      })();

      let trackedPromise: Promise<ParentGameSession>;
      trackedPromise = request.then((session) => {
        assertCurrent(runGeneration, controller);
        cached = { ownerKey, session };
        return session;
      }).finally(() => {
        if (inFlight?.generation === runGeneration) {
          inFlight = null;
        }
      });

      inFlight = {
        ownerKey,
        generation: runGeneration,
        controller,
        promise: trackedPromise,
      };
      return trackedPromise;
    },
    reset,
  };
}
