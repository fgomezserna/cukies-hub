'use client';

import { useEffect, useRef, type RefObject } from 'react';

import { readParentIframeNavigationEpoch } from '@/lib/parent-iframe-navigation';

const REQUEST_TYPE = 'TH_MULTIPLAYER_REQUEST';
const RESPONSE_TYPE = 'TH_MULTIPLAYER_RESPONSE';
const MULTIPLAYER_API = '/api/games/treasure-hunt/multiplayer/matches';
const JOIN_RELEASE_BARRIER_MS = 250;

type MultiplayerCommand = 'join' | 'get' | 'heartbeat' | 'snapshot' | 'forfeit' | 'release' | 'reset';

interface MultiplayerRequest {
  readonly type: typeof REQUEST_TYPE;
  readonly clientInstanceId: string;
  readonly requestId: string;
  readonly command: MultiplayerCommand;
  readonly payload: Record<string, unknown>;
}

interface BridgeErrorPayload {
  readonly code: string;
  readonly message: string;
  readonly retryable?: true;
  readonly httpStatus?: number;
}

class BridgeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'BridgeError';
  }
}

export interface TreasureHuntMultiplayerBridgeOptions {
  readonly iframeRef: RefObject<HTMLIFrameElement>;
  readonly gameUrl: string;
  readonly currentSessionId: string;
  readonly authorityClientInstanceId?: string;
  readonly fetchImpl?: typeof fetch;
  readonly windowObject?: Window;
  readonly onRoomJoined?: (roomCode: string) => void;
  readonly onSessionReleased?: (sessionId: string) => void;
}

export interface TreasureHuntMultiplayerAuthorityLease {
  readonly sessionId: string;
  readonly clientInstanceId: string;
}

export interface UseTreasureHuntMultiplayerBridgeOptions {
  readonly iframeRef: RefObject<HTMLIFrameElement>;
  readonly gameUrl: string | null | undefined;
  readonly currentSessionId: string | null;
  readonly onRoomJoined?: (roomCode: string) => void;
  readonly onSessionReleased?: (sessionId: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function createAuthorityClientInstanceId(cryptoApi: Crypto): string {
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function resolveTreasureHuntMultiplayerAuthorityLease(
  current: TreasureHuntMultiplayerAuthorityLease | null,
  sessionId: string,
  cryptoApi: Crypto,
): TreasureHuntMultiplayerAuthorityLease {
  if (current?.sessionId === sessionId) return current;
  return { sessionId, clientInstanceId: createAuthorityClientInstanceId(cryptoApi) };
}

function parseRequest(value: unknown): MultiplayerRequest | null {
  if (!isRecord(value) || value.type !== REQUEST_TYPE) {
    return null;
  }
  if (
    typeof value.clientInstanceId !== 'string' ||
    value.clientInstanceId.length === 0 ||
    value.clientInstanceId.length > 128 ||
    typeof value.requestId !== 'string' ||
    value.requestId.length === 0 ||
    value.requestId.length > 128
  ) {
    return null;
  }
  if (!['join', 'get', 'heartbeat', 'snapshot', 'forfeit', 'release', 'reset'].includes(String(value.command))) {
    return null;
  }

  return {
    type: REQUEST_TYPE,
    clientInstanceId: value.clientInstanceId,
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
    return {
      code: error.code,
      message: error.message,
      ...(error.retryable ? { retryable: true as const } : {}),
      ...(error.httpStatus ? { httpStatus: error.httpStatus } : {}),
    };
  }
  return { code: 'REQUEST_FAILED', message: 'Multiplayer request failed', retryable: true };
}

function isTerminalMatchStatus(value: unknown): boolean {
  return value === 'finished' || value === 'abandoned';
}

function isReloadSensitiveMatch(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    value.status === 'running' ||
    value.status === 'sudden_death' ||
    value.status === 'paused_reconnect'
  ) {
    return true;
  }
  if (value.status !== 'countdown' || !isRecord(value.config)) return false;
  return value.config.resumeAt != null || (
    typeof value.config.resumeEpoch === 'number' &&
    Number.isFinite(value.config.resumeEpoch) &&
    value.config.resumeEpoch > 0
  );
}

function requiresJoinedIframeAuthority(command: MultiplayerCommand): boolean {
  return command === 'get' ||
    command === 'heartbeat' ||
    command === 'snapshot' ||
    command === 'forfeit';
}

function waitForPendingJoins(
  operations: readonly Promise<void>[],
  signal: AbortSignal,
): Promise<void> {
  if (operations.length === 0 || signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, JOIN_RELEASE_BARRIER_MS);
    signal.addEventListener('abort', finish, { once: true });
    void Promise.allSettled(operations).then(finish);
  });
}

async function readApiResponse(response: Response) {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new BridgeError(
      'REQUEST_FAILED',
      'Multiplayer request failed',
      response.status >= 500,
      response.status,
    );
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
    throw new BridgeError(
      code,
      'Multiplayer request failed',
      response.status === 408 || response.status === 429 || response.status >= 500,
      response.status,
    );
  }

  const { success: _success, ...data } = value;
  return data;
}

export function buildTreasureHuntInviteUrl(windowObject: Window, roomCode: string) {
  const inviteUrl = new URL(windowObject.location.pathname, windowObject.location.origin);
  inviteUrl.searchParams.set('room', roomCode);

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
  const authorityClientInstanceId =
    options.authorityClientInstanceId ?? createAuthorityClientInstanceId(windowObject.crypto);
  if (authorityClientInstanceId.length === 0 || authorityClientInstanceId.length > 128) {
    throw new BridgeError('INVALID_CLIENT_ID', 'Multiplayer authority client is invalid');
  }
  const abortControllers = new Set<AbortController>();
  const inFlightRequestIds = new Set<string>();
  const pendingJoinOperations = new Set<Promise<void>>();
  const observedIframe = options.iframeRef.current;
  const parentMarkedNavigationEpoch = observedIframe
    ? readParentIframeNavigationEpoch(observedIframe)
    : 0;
  let hasObservedIframeLoad = parentMarkedNavigationEpoch > 0;
  let iframeNavigationEpoch = parentMarkedNavigationEpoch;
  let knownMatchId: string | null = null;
  let knownRoomCode: string | null = null;
  let knownMatchStatus: string | null = null;
  let knownMatchReloadSensitive = false;
  let knownIframeClientInstanceId: string | null = null;
  let knownIframeNavigationEpoch: number | null = null;
  let pendingRoomCode: string | null = null;
  let sessionReleased = false;
  let generation = 0;
  let disposed = false;

  const handleIframeLoad = () => {
    if (!hasObservedIframeLoad) {
      hasObservedIframeLoad = true;
      return;
    }
    iframeNavigationEpoch += 1;
  };
  observedIframe?.addEventListener('load', handleIframeLoad);

  const updateKnownMatchState = (match: unknown) => {
    if (!isRecord(match) || typeof match.status !== 'string') return;
    knownMatchStatus = match.status;
    knownMatchReloadSensitive = isReloadSensitiveMatch(match);
  };

  const forfeitCanonicalMatch = async (matchId: string, signal: AbortSignal) => {
    const response = await fetchImpl(
      `${MULTIPLAYER_API}/${encodeURIComponent(matchId)}`,
      {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'forfeit',
          gameSessionId: options.currentSessionId,
          clientInstanceId: authorityClientInstanceId,
        }),
        signal,
      },
    );
    const data = await readApiResponse(response);
    if (
      !isRecord(data.match) ||
      data.match.matchId !== matchId ||
      !isTerminalMatchStatus(data.match.status)
    ) {
      throw new BridgeError('INVALID_RESPONSE', 'Multiplayer forfeit failed');
    }
    updateKnownMatchState(data.match);
    return data.match;
  };

  const rejectStaleIframeAuthority = async (
    request: MultiplayerRequest,
    requestNavigationEpoch: number,
    signal: AbortSignal,
  ) => {
    const hasJoinedIframeAuthority =
      knownIframeClientInstanceId !== null && knownIframeNavigationEpoch !== null;
    const isStaleIframe = hasJoinedIframeAuthority && (
      request.clientInstanceId !== knownIframeClientInstanceId ||
      requestNavigationEpoch !== knownIframeNavigationEpoch ||
      iframeNavigationEpoch !== requestNavigationEpoch
    );
    if (!isStaleIframe) return;

    if (knownMatchId && knownMatchReloadSensitive) {
      const forfeitedMatch = await forfeitCanonicalMatch(knownMatchId, signal);
      updateKnownMatchState(forfeitedMatch);
    }
    throw new BridgeError(
      'STALE_IFRAME',
      'Iframe navigation changed; join the multiplayer match again',
    );
  };

  const handleMessage = (event: MessageEvent) => {
    const frameWindow = options.iframeRef.current?.contentWindow;
    if (!frameWindow || event.source !== frameWindow || event.origin !== targetOrigin) {
      return;
    }

    const request = parseRequest(event.data);
    if (!request) {
      return;
    }
    const requestNavigationEpoch = iframeNavigationEpoch;
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

    if (request.command === 'reset') {
      if (Object.keys(request.payload).length !== 0) {
        frameWindow.postMessage(
          {
            type: RESPONSE_TYPE,
            requestId: request.requestId,
            success: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Reset payload must be empty',
            },
          },
          targetOrigin,
        );
        return;
      }

      if (knownMatchId && !isTerminalMatchStatus(knownMatchStatus)) {
        frameWindow.postMessage(
          {
            type: RESPONSE_TYPE,
            requestId: request.requestId,
            success: false,
            error: {
              code: 'MATCH_ACTIVE',
              message: 'An active multiplayer match cannot be reset',
            },
          },
          targetOrigin,
        );
        return;
      }

      generation += 1;
      for (const controller of abortControllers) {
        controller.abort();
      }
      abortControllers.clear();
      inFlightRequestIds.clear();
      knownMatchId = null;
      knownRoomCode = null;
      knownMatchStatus = null;
      knownMatchReloadSensitive = false;
      knownIframeClientInstanceId = null;
      knownIframeNavigationEpoch = null;
      pendingRoomCode = null;
      frameWindow.postMessage(
        {
          type: RESPONSE_TYPE,
          requestId: request.requestId,
          success: true,
          data: { reset: true },
        },
        targetOrigin,
      );
      return;
    }

    inFlightRequestIds.add(request.requestId);

    const abortController = new AbortController();
    abortControllers.add(abortController);
    const requestGeneration = generation;
    const joinBarrier = request.command === 'release'
      ? [...pendingJoinOperations]
      : [];

    let operation: Promise<void>;
    operation = (async () => {
      let ownedPendingRoomCode: string | null = null;
      let notifySessionReleased = false;
      try {
        let data: Record<string, unknown>;

        if (request.command === 'release' && joinBarrier.length > 0) {
          // Prefer observing the canonical JOIN result before releasing, but never make
          // authority depend on an in-memory promise that a lost network response could
          // leave pending forever. The server-side CAS resolves the remaining race.
          await waitForPendingJoins(joinBarrier, abortController.signal);
          if (
            disposed ||
            abortController.signal.aborted ||
            requestGeneration !== generation
          ) {
            return;
          }
        }

        if (request.command === 'join') {
          const roomCode = requireRoomCode(request.payload.roomCode);
          const isIframeReloadAtStart = Boolean(
            knownMatchId &&
            knownIframeClientInstanceId &&
            knownIframeNavigationEpoch !== null &&
            (
              request.clientInstanceId !== knownIframeClientInstanceId ||
              requestNavigationEpoch !== knownIframeNavigationEpoch
            ),
          );
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
          if (
            isIframeReloadAtStart &&
            knownMatchId &&
            knownMatchReloadSensitive
          ) {
            const forfeitedMatch = await forfeitCanonicalMatch(
              knownMatchId,
              abortController.signal,
            );
            updateKnownMatchState(forfeitedMatch);
            if (
              disposed ||
              abortController.signal.aborted ||
              requestGeneration !== generation
            ) {
              return;
            }
          }
          const response = await fetchImpl(MULTIPLAYER_API, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomCode,
              gameSessionId: options.currentSessionId,
              clientInstanceId: authorityClientInstanceId,
            }),
            signal: abortController.signal,
          });
          data = await readApiResponse(response);
          if (
            disposed ||
            abortController.signal.aborted ||
            requestGeneration !== generation
          ) {
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
          if (
            typeof data.playerId !== 'string' ||
            (data.slot !== 0 && data.slot !== 1)
          ) {
            throw new BridgeError('INVALID_RESPONSE', 'Multiplayer request failed');
          }
          updateKnownMatchState(data.match);
          const isIframeReload =
            isIframeReloadAtStart || iframeNavigationEpoch !== requestNavigationEpoch;
          if (isIframeReload && isReloadSensitiveMatch(data.match)) {
            const forfeitedMatch = await forfeitCanonicalMatch(
              data.match.matchId,
              abortController.signal,
            );
            if (
              disposed ||
              abortController.signal.aborted ||
              requestGeneration !== generation
            ) {
              return;
            }
            updateKnownMatchState(forfeitedMatch);
            data = { ...data, match: forfeitedMatch };
          }
          knownIframeClientInstanceId = request.clientInstanceId;
          knownIframeNavigationEpoch = iframeNavigationEpoch;
          const inviteUrl = buildTreasureHuntInviteUrl(windowObject, canonicalRoomCode);
          options.onRoomJoined?.(canonicalRoomCode);
          data = { ...data, inviteUrl };
        } else if (request.command === 'release') {
          const response = await fetchImpl(`${MULTIPLAYER_API}/release`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              gameSessionId: options.currentSessionId,
              clientInstanceId: authorityClientInstanceId,
            }),
            signal: abortController.signal,
          });
          data = await readApiResponse(response);
          notifySessionReleased = data.released === true;
        } else {
          if (!knownMatchId) {
            throw new BridgeError('MATCH_NOT_JOINED', 'Multiplayer match is not joined');
          }

          if (requiresJoinedIframeAuthority(request.command)) {
            await rejectStaleIframeAuthority(
              request,
              requestNavigationEpoch,
              abortController.signal,
            );
            if (
              disposed ||
              abortController.signal.aborted ||
              requestGeneration !== generation
            ) {
              return;
            }
          }

          const matchPath = `${MULTIPLAYER_API}/${encodeURIComponent(knownMatchId)}`;
          if (request.command === 'get') {
            const query = new URLSearchParams({
              gameSessionId: options.currentSessionId,
              clientInstanceId: authorityClientInstanceId,
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
              clientInstanceId: authorityClientInstanceId,
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

          updateKnownMatchState(data.match);
          if (requiresJoinedIframeAuthority(request.command)) {
            await rejectStaleIframeAuthority(
              request,
              requestNavigationEpoch,
              abortController.signal,
            );
          }
        }

        if (
          disposed ||
          abortController.signal.aborted ||
          requestGeneration !== generation
        ) {
          return;
        }
        updateKnownMatchState(data.match);

        if (
          !disposed &&
          requestGeneration === generation &&
          options.iframeRef.current?.contentWindow === frameWindow
        ) {
          frameWindow.postMessage(
            {
              type: RESPONSE_TYPE,
              requestId: request.requestId,
              success: true,
              data,
            },
            targetOrigin,
          );
          if (notifySessionReleased && !sessionReleased) {
            sessionReleased = true;
            options.onSessionReleased?.(options.currentSessionId);
          }
        }
      } catch (error) {
        if (
          !disposed &&
          requestGeneration === generation &&
          options.iframeRef.current?.contentWindow === frameWindow
        ) {
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
    if (request.command === 'join') {
      pendingJoinOperations.add(operation);
      const removeJoinOperation = () => pendingJoinOperations.delete(operation);
      void operation.then(removeJoinOperation, removeJoinOperation);
    }
    void operation;
  };

  windowObject.addEventListener('message', handleMessage);
  return () => {
    disposed = true;
    generation += 1;
    windowObject.removeEventListener('message', handleMessage);
    observedIframe?.removeEventListener('load', handleIframeLoad);
    for (const controller of abortControllers) {
      controller.abort();
    }
    abortControllers.clear();
    inFlightRequestIds.clear();
    pendingJoinOperations.clear();
    pendingRoomCode = null;
  };
}

export function useTreasureHuntMultiplayerBridge(
  options: UseTreasureHuntMultiplayerBridgeOptions,
) {
  const authorityLeaseRef = useRef<TreasureHuntMultiplayerAuthorityLease | null>(null);
  useEffect(() => {
    if (!options.gameUrl || !options.currentSessionId) {
      return undefined;
    }

    try {
      authorityLeaseRef.current = resolveTreasureHuntMultiplayerAuthorityLease(
        authorityLeaseRef.current,
        options.currentSessionId,
        window.crypto,
      );
      return createTreasureHuntMultiplayerBridge({
        iframeRef: options.iframeRef,
        gameUrl: options.gameUrl,
        currentSessionId: options.currentSessionId,
        authorityClientInstanceId: authorityLeaseRef.current.clientInstanceId,
        onRoomJoined: options.onRoomJoined,
        onSessionReleased: options.onSessionReleased,
      });
    } catch {
      return undefined;
    }
  }, [
    options.currentSessionId,
    options.gameUrl,
    options.iframeRef,
    options.onRoomJoined,
    options.onSessionReleased,
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
