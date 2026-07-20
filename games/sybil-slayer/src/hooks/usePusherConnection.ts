import { useEffect, useState, useCallback, useRef } from 'react';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import { resolveParentOrigin } from '../lib/multiplayer-client';

// Enable pusher logging for development
if (process.env.NODE_ENV === 'development') {
  Pusher.logToConsole = true;
}

interface GameCheckpoint {
  score: number;
  gameTime: number;
  timestamp: number;
  nonce?: string;
  hash?: string;
  events?: any[];
}

interface GameEndData {
  resultId: string;
  finalScore: number;
  gameTime: number;
  metadata?: any;
  competitionAttemptId?: string;
}

interface PendingGameEndResult extends GameEndData {
  sessionId: string;
  timestamp: number;
}

const PENDING_GAME_RESULT_STORAGE_KEY = 'pending-game-result';
const GAME_END_RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 15_000] as const;
const PENDING_GAME_RESULT_TTL_MS = 400 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_TIMESTAMP_SKEW_MS = 5 * 60 * 1_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeStoredGameEndMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  const metadata: Record<string, unknown> = {};
  if (typeof value.gameOverReason === 'string') {
    metadata.gameOverReason = value.gameOverReason.slice(0, 80);
  }
  if (Number.isSafeInteger(value.level) && Number(value.level) >= 0) {
    metadata.level = Number(value.level);
  }
  if (Number.isSafeInteger(value.hearts) && Number(value.hearts) >= 0) {
    metadata.hearts = Number(value.hearts);
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function storedPendingGameEndResult(value: unknown): PendingGameEndResult | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.resultId !== 'string' ||
    value.resultId.length < 8 ||
    value.resultId.length > 128 ||
    typeof value.sessionId !== 'string' ||
    value.sessionId.length === 0 ||
    value.sessionId.length > 128 ||
    !Number.isSafeInteger(value.finalScore) ||
    Number(value.finalScore) < 0 ||
    !Number.isSafeInteger(value.gameTime) ||
    Number(value.gameTime) < 0 ||
    !Number.isSafeInteger(value.timestamp) ||
    Number(value.timestamp) < 0 ||
    Number(value.timestamp) > Date.now() + MAX_FUTURE_TIMESTAMP_SKEW_MS ||
    Date.now() - Number(value.timestamp) > PENDING_GAME_RESULT_TTL_MS ||
    ('competitionAttemptId' in value && (
      typeof value.competitionAttemptId !== 'string' ||
      value.competitionAttemptId.length === 0 ||
      value.competitionAttemptId.length > 128
    ))
  ) {
    return null;
  }

  const metadata = sanitizeStoredGameEndMetadata(value.metadata);
  return {
    resultId: value.resultId,
    sessionId: value.sessionId,
    finalScore: Number(value.finalScore),
    gameTime: Number(value.gameTime),
    timestamp: Number(value.timestamp),
    ...(metadata ? { metadata } : {}),
    ...(typeof value.competitionAttemptId === 'string'
      ? { competitionAttemptId: value.competitionAttemptId }
      : {}),
  };
}

function readPendingGameEndResults(): PendingGameEndResult[] {
  try {
    const serialized = localStorage.getItem(PENDING_GAME_RESULT_STORAGE_KEY);
    if (!serialized) return [];
    const parsed: unknown = JSON.parse(serialized);
    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    const valid = candidates
      .map(storedPendingGameEndResult)
      .filter((candidate): candidate is PendingGameEndResult => Boolean(candidate));
    const unique = new Map<string, PendingGameEndResult>();
    for (const candidate of valid) {
      unique.set(`${candidate.sessionId}:${candidate.resultId}`, candidate);
    }
    return [...unique.values()]
      .sort((left, right) => left.timestamp - right.timestamp);
  } catch {
    return [];
  }
}

function writePendingGameEndResults(results: readonly PendingGameEndResult[]) {
  try {
    if (results.length === 0) {
      localStorage.removeItem(PENDING_GAME_RESULT_STORAGE_KEY);
    } else {
      // Reconstructing the records keeps legacy bearer fields out of storage.
      localStorage.setItem(PENDING_GAME_RESULT_STORAGE_KEY, JSON.stringify(results.map((result) => ({
        resultId: result.resultId,
        sessionId: result.sessionId,
        finalScore: result.finalScore,
        gameTime: result.gameTime,
        timestamp: result.timestamp,
        ...(sanitizeStoredGameEndMetadata(result.metadata)
          ? { metadata: sanitizeStoredGameEndMetadata(result.metadata) }
          : {}),
        ...(result.competitionAttemptId
          ? { competitionAttemptId: result.competitionAttemptId }
          : {}),
      }))));
    }
    return true;
  } catch {
    return false;
  }
}

function persistPendingGameEndResult(result: PendingGameEndResult) {
  const pending = readPendingGameEndResults();
  // Never evict a still-live result from another wallet/session. Each session
  // contributes at most one record through sendGameEnd; the browser quota is
  // handled as a visible fail-closed state with an explicit retry.
  const withoutCurrent = pending.filter((candidate) => (
    candidate.sessionId !== result.sessionId || candidate.resultId !== result.resultId
  ));
  return writePendingGameEndResults([...withoutCurrent, result]);
}

function removePendingGameEndResult(sessionId: string, resultId: string) {
  const pending = readPendingGameEndResults();
  const remaining = pending.filter((candidate) => (
    candidate.sessionId !== sessionId || candidate.resultId !== resultId
  ));
  if (remaining.length === pending.length) return false;
  return writePendingGameEndResults(remaining);
}

function createGameEndResultId() {
  if (typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
}

export interface SessionData {
  gameId: string;
  sessionId: string;
  gameVersion?: string;
  roomId?: string;
  userId?: string;
}

export interface TreasureHuntCompetitionAccess {
  readonly eligible: boolean;
  readonly practice: boolean;
  readonly sessionId: string | null;
  readonly attemptId?: string;
  readonly seed?: string;
  readonly alias?: string;
  readonly status?: 'active';
  readonly reason?: string;
}

interface PendingCompetitionAccessRequest {
  readonly sessionId: string | null;
  readonly promise: Promise<TreasureHuntCompetitionAccess>;
  cancel(reason: string): void;
}

/**
 * Hook for Pusher communication from game side
 * Replaces the postMessage communication with reliable WebSockets
 */
export function usePusherConnection() {
  const [pusher, setPusher] = useState<Pusher | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [hasParentHandshake, setHasParentHandshake] = useState(false);
  const [hasPendingGameEnd, setHasPendingGameEnd] = useState(false);
  const [gameEndPersistenceError, setGameEndPersistenceError] = useState<string | null>(null);

  // Ref to track cleanup timeout
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // The iframe only receives an opaque session id. The bearer remains in the parent dapp.
  const [sessionData, setSessionData] = useState<SessionData | null>(null);

  // Refs to prevent stale closures
  const pusherRef = useRef<Pusher | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const sessionDataRef = useRef<SessionData | null>(sessionData);
  const pusherSessionIdRef = useRef<string | null>(null);
  const isConnectingRef = useRef(false);
  const sessionGenerationRef = useRef(0);
  const gameEndRetryTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const acknowledgedGameEndIdsRef = useRef(new Set<string>());
  const competitionAccessRequestRef = useRef<PendingCompetitionAccessRequest | null>(null);
  const unpersistedGameEndRef = useRef<PendingGameEndResult | null>(null);

  const clearGameEndRetries = useCallback(() => {
    for (const timeout of gameEndRetryTimeoutsRef.current) clearTimeout(timeout);
    gameEndRetryTimeoutsRef.current.clear();
  }, []);

  const startPendingGameEndDelivery = useCallback((pending: PendingGameEndResult) => {
    clearGameEndRetries();
    setHasPendingGameEnd(true);
    setGameEndPersistenceError(null);
    const generationSnapshot = sessionGenerationRef.current;

    const deliver = (attempt: number) => {
      const currentSessionId = sessionDataRef.current?.sessionId;
      if (
        sessionGenerationRef.current !== generationSnapshot ||
        currentSessionId !== pending.sessionId
      ) {
        return;
      }

      const isStillPending = readPendingGameEndResults().some((candidate) => (
        candidate.sessionId === pending.sessionId && candidate.resultId === pending.resultId
      ));
      if (!isStillPending) return;

      if (channelRef.current) {
        try {
          channelRef.current.trigger('client-game-end', {
            resultId: pending.resultId,
            finalScore: pending.finalScore,
            gameTime: pending.gameTime,
            ...('metadata' in pending ? { metadata: pending.metadata } : {}),
            ...(pending.competitionAttemptId
              ? { competitionAttemptId: pending.competitionAttemptId }
              : {}),
          });
          console.log('📤 [GAME-PUSHER] Game end dispatched; awaiting dapp ACK', {
            resultId: pending.resultId,
            attempt: attempt + 1,
          });
        } catch (error) {
          console.error('❌ [GAME-PUSHER] Game end dispatch failed; it remains pending', error);
        }
      }

      if (pending.competitionAttemptId) {
        const parentOrigin = getParentOrigin();
        if (parentOrigin) {
          window.parent?.postMessage({
            type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY',
            sessionId: pending.sessionId,
            resultId: pending.resultId,
            competitionAttemptId: pending.competitionAttemptId,
            finalScore: pending.finalScore,
            gameTime: pending.gameTime,
          }, parentOrigin);
        }
      }

      const retryDelay = GAME_END_RETRY_DELAYS_MS[
        Math.min(attempt, GAME_END_RETRY_DELAYS_MS.length - 1)
      ];
      const timeout = setTimeout(() => {
        gameEndRetryTimeoutsRef.current.delete(timeout);
        deliver(attempt + 1);
      }, retryDelay);
      gameEndRetryTimeoutsRef.current.add(timeout);
    };

    deliver(0);
  }, [clearGameEndRetries]);

  const startGameEndAckConfirmation = useCallback((sessionId: string, resultId: string) => {
    clearGameEndRetries();
    const generationSnapshot = sessionGenerationRef.current;

    const confirm = (attempt: number) => {
      if (
        sessionGenerationRef.current !== generationSnapshot ||
        sessionDataRef.current?.sessionId !== sessionId ||
        !acknowledgedGameEndIdsRef.current.has(`${sessionId}:${resultId}`)
      ) {
        return;
      }

      if (channelRef.current) {
        try {
          channelRef.current.trigger('client-game-end-ack-confirmed', { resultId });
        } catch (error) {
          console.error('❌ [GAME-PUSHER] ACK confirmation failed; retrying', error);
        }
      }


      const pending = readPendingGameEndResults().find((candidate) => (
        candidate.sessionId === sessionId &&
        candidate.resultId === resultId &&
        Boolean(candidate.competitionAttemptId)
      ));
      const parentOrigin = getParentOrigin();
      if (pending && parentOrigin) {
        // Re-send the complete evidence before confirmation. If the parent was
        // reloaded after its ACK, it must rebuild its in-memory completion map.
        window.parent?.postMessage({
          type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY',
          sessionId,
          resultId,
          competitionAttemptId: pending.competitionAttemptId,
          finalScore: pending.finalScore,
          gameTime: pending.gameTime,
        }, parentOrigin);
        window.parent?.postMessage({
          type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK_CONFIRMED',
          sessionId,
          resultId,
        }, parentOrigin);
      }

      const retryDelay = GAME_END_RETRY_DELAYS_MS[
        Math.min(attempt, GAME_END_RETRY_DELAYS_MS.length - 1)
      ];
      const timeout = setTimeout(() => {
        gameEndRetryTimeoutsRef.current.delete(timeout);
        confirm(attempt + 1);
      }, retryDelay);
      gameEndRetryTimeoutsRef.current.add(timeout);
    };

    confirm(0);
  }, [clearGameEndRetries]);

  const clearSessionData = useCallback((expectedSessionId?: string, completedResultId?: string) => {
    const current = sessionDataRef.current;
    if (expectedSessionId && current?.sessionId !== expectedSessionId) return;

    if (current && completedResultId) {
      removePendingGameEndResult(current.sessionId, completedResultId);
    }

    sessionGenerationRef.current += 1;
    acknowledgedGameEndIdsRef.current.clear();
    unpersistedGameEndRef.current = null;
    setHasPendingGameEnd(false);
    setGameEndPersistenceError(null);
    competitionAccessRequestRef.current?.cancel('SESSION_CHANGED');
    clearGameEndRetries();
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }
    if (channelRef.current && current) {
      pusherRef.current?.unsubscribe(`private-game-session-${current.sessionId}`);
    }
    pusherRef.current?.disconnect();
    pusherRef.current = null;
    pusherSessionIdRef.current = null;
    channelRef.current = null;
    isConnectingRef.current = false;
    sessionDataRef.current = null;
    setSessionData(null);
    setPusher(null);
    setChannel(null);
    setConnectionState('disconnected');
    setHasParentHandshake(false);
  }, [clearGameEndRetries]);

  const acceptSessionData = useCallback((sessionInfo: SessionData) => {
    if (
      !sessionInfo ||
      typeof sessionInfo.sessionId !== 'string' ||
      sessionInfo.sessionId.length === 0 ||
      sessionInfo.sessionId.length > 128 ||
      sessionInfo.gameId !== 'sybil-slayer'
    ) return;
    const normalized: SessionData = {
      gameId: sessionInfo.gameId,
      sessionId: sessionInfo.sessionId,
      ...(typeof sessionInfo.gameVersion === 'string'
        ? { gameVersion: sessionInfo.gameVersion }
        : {}),
      ...(typeof sessionInfo.roomId === 'string' ? { roomId: sessionInfo.roomId } : {}),
      ...(typeof sessionInfo.userId === 'string' ? { userId: sessionInfo.userId } : {}),
    };
    const current = sessionDataRef.current;
    if (current?.sessionId !== normalized.sessionId) {
      sessionGenerationRef.current += 1;
      acknowledgedGameEndIdsRef.current.clear();
      unpersistedGameEndRef.current = null;
      setHasPendingGameEnd(false);
      setGameEndPersistenceError(null);
      competitionAccessRequestRef.current?.cancel('SESSION_CHANGED');
      clearGameEndRetries();
      if (channelRef.current && current) {
        pusherRef.current?.unsubscribe(`private-game-session-${current.sessionId}`);
      }
      pusherRef.current?.disconnect();
      pusherRef.current = null;
      pusherSessionIdRef.current = null;
      channelRef.current = null;
      isConnectingRef.current = false;
      setPusher(null);
      setChannel(null);
      setConnectionState('disconnected');
    }
    const next = current?.sessionId === normalized.sessionId
      ? { ...current, ...normalized }
      : normalized;

    sessionDataRef.current = next;
    setSessionData(next);
    const pendingResult = readPendingGameEndResults()
      .filter((candidate) => candidate.sessionId === next.sessionId)
      .sort((left, right) => left.timestamp - right.timestamp)[0];
    if (pendingResult) {
      // The previous session may already be inactive, so Pusher authorization
      // can legitimately fail after reload. Start the trusted parent recovery
      // path immediately instead of waiting for a channel subscription.
      startPendingGameEndDelivery(pendingResult);
    }
  }, [clearGameEndRetries, startPendingGameEndDelivery]);

  useEffect(() => {
    localStorage.removeItem('pusher-game-session');
    writePendingGameEndResults(readPendingGameEndResults());
  }, []);

  useEffect(() => () => {
    competitionAccessRequestRef.current?.cancel('COMPONENT_UNMOUNTED');
    clearGameEndRetries();
  }, [clearGameEndRetries]);

  // Listen for session data from parent (dapp) via postMessage
  // This is the initial handshake - after this, everything uses Pusher
  useEffect(() => {
    const parentOrigin = getParentOrigin();
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from parent window
      if (!parentOrigin || event.source !== window.parent || event.origin !== parentOrigin) return;

      if (event.data?.type === 'SESSION_START' || event.data?.type === 'GAME_SESSION_START') {
        const sessionInfo = event.data.payload || event.data;
        console.log('🚀 [GAME-PUSHER] Session start received');
        setHasParentHandshake(true);

        const currentSessionId = sessionDataRef.current?.sessionId;
        const newSessionId = sessionInfo.sessionId;

        if (currentSessionId === newSessionId) {
          console.log('🔄 [GAME-PUSHER] Same session refreshed:', newSessionId);
        } else {
          console.log('📝 [GAME-PUSHER] New session detected, storing:', newSessionId);
        }
        acceptSessionData(sessionInfo);
      } else if (event.data?.type === 'GAME_SESSION_CLEAR') {
        const sessionId = typeof event.data.sessionId === 'string'
          ? event.data.sessionId
          : undefined;
        const resultId = typeof event.data.resultId === 'string' &&
          event.data.resultId.length >= 8 && event.data.resultId.length <= 128
          ? event.data.resultId
          : undefined;
        const currentSessionId = sessionDataRef.current?.sessionId;
        if (sessionId && currentSessionId !== sessionId) {
          // The first CLEAR may have succeeded while its confirmation was lost.
          // Once this exact result is absent locally, re-confirming the trusted
          // parent's retry is idempotent and lets it finally forget the session.
          if (
            !currentSessionId &&
            resultId &&
            !readPendingGameEndResults().some((candidate) => (
              candidate.sessionId === sessionId && candidate.resultId === resultId
            ))
          ) {
            window.parent?.postMessage({
              type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
              sessionId,
              resultId,
            }, parentOrigin);
          }
          return;
        }
        clearSessionData(sessionId, resultId);
        if (sessionId && resultId) {
          window.parent?.postMessage({
            type: 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED',
            sessionId,
            resultId,
          }, parentOrigin);
        }
      } else if (event.data?.type === 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK') {
        const sessionId = sessionDataRef.current?.sessionId;
        const resultId = event.data.resultId;
        if (
          !sessionId ||
          event.data.sessionId !== sessionId ||
          typeof resultId !== 'string' ||
          resultId.length < 8 ||
          resultId.length > 128 ||
          !readPendingGameEndResults().some((candidate) => (
            candidate.sessionId === sessionId &&
            candidate.resultId === resultId &&
            Boolean(candidate.competitionAttemptId)
          ))
        ) {
          return;
        }
        acknowledgedGameEndIdsRef.current.add(`${sessionId}:${resultId}`);
        setHasPendingGameEnd(true);
        startGameEndAckConfirmation(sessionId, resultId);
      }
    };

    // Send ready signal to parent
    const sendReadySignal = () => {
      if (!parentOrigin) return;
      console.log('📡 [GAME-PUSHER] Sending ready signal to parent');
      window.parent?.postMessage({
        type: 'GAME_READY',
        gameId: 'sybil-slayer',
        timestamp: Date.now()
      }, parentOrigin);
    };

    // Send ready signal after component mounts (only once with retry)
    let readySent = false;
    const sendOnce = () => {
      if (!readySent) {
        sendReadySignal();
        readySent = true;
      }
    };

    sendOnce();
    // Single retry after delay if needed
    setTimeout(sendOnce, 1000);

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [acceptSessionData, clearSessionData, startGameEndAckConfirmation]);

  // Connect to Pusher when we have session data
  const connectionSessionId = sessionData?.sessionId ?? null;
  useEffect(() => {
    const sessionData = sessionDataRef.current;
    if (!sessionData) {
      console.log('🔄 [GAME-PUSHER] Waiting for session data...');
      return;
    }
    if (sessionData.sessionId !== connectionSessionId) return;

    // Prevent duplicate connections - más estricto
    if (pusherSessionIdRef.current === sessionData.sessionId && pusherRef.current) {
      console.log('🔄 [GAME-PUSHER] Already connected to session:', sessionData.sessionId, 'State:', connectionState);
      return;
    }

    // Prevent concurrent connections
    if (isConnectingRef.current) {
      console.log('🔄 [GAME-PUSHER] Connection already in progress...');
      return;
    }

    console.log('🎯 [GAME-PUSHER] Connection decision:', {
      hasSessionData: !!sessionData,
      sessionId: sessionData.sessionId,
      currentSessionId: sessionDataRef.current?.sessionId,
      hasPusher: !!pusherRef.current,
      connectionState,
      isConnecting: isConnectingRef.current
    });

    // Cancel any pending cleanup
    if (cleanupTimeoutRef.current) {
      console.log('🚫 [GAME-PUSHER] Cancelling pending delayed cleanup');
      clearTimeout(cleanupTimeoutRef.current);
      cleanupTimeoutRef.current = null;
    }

    // Cleanup existing connection
    if (pusherRef.current) {
      console.log('🧹 [GAME-PUSHER] Cleaning up existing connection');
      pusherRef.current.disconnect();
      console.log('🧹 [GAME-PUSHER] Clearing refs (immediate cleanup)');
      pusherRef.current = null;
      pusherSessionIdRef.current = null;
      channelRef.current = null;
    }

    let ownedPusher: Pusher | null = null;
    let ownedChannel: Channel | null = null;

    // Add a small delay to prevent rapid reconnections
    const connectTimeout = setTimeout(() => {
      console.log('🔗 [GAME-PUSHER] Connecting to Pusher with session:', sessionData.sessionId);
      isConnectingRef.current = true;
      setConnectionState('connecting');

      connectToPusher();
    }, 100); // Reduced delay from 500ms to 100ms

    const connectToPusher = () => {
      try {
        // Create Pusher instance
        const pusherInstance = new Pusher(
          process.env.NEXT_PUBLIC_PUSHER_KEY!,
          {
            cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
            forceTLS: true,
            authorizer: (channel, options) => ({
              authorize: (socketId, callback) => {
                console.log('📤 [GAME-PUSHER] Requesting auth via postMessage:', {
                  socketId: socketId.substring(0, 12) + '...',
                  channelName: channel.name,
                });

                const parentOrigin = getParentOrigin();
                if (!parentOrigin) {
                  callback(new Error('Secure parent origin unavailable'), null);
                  return;
                }

                const authId = typeof window.crypto.randomUUID === 'function'
                  ? window.crypto.randomUUID()
                  : Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (byte) =>
                    byte.toString(16).padStart(2, '0')).join('');
                let settled = false;
                let timeoutId: ReturnType<typeof setTimeout> | null = null;

                const settle = (
                  error: Error | null,
                  authData?: { auth: string; channel_data?: string; shared_secret?: string },
                ) => {
                  if (settled) return;
                  settled = true;
                  if (timeoutId) clearTimeout(timeoutId);
                  window.removeEventListener('message', handleAuthResponse);
                  callback(error, error ? null : (authData ?? null));
                };

                // Set up listener for auth response
                const handleAuthResponse = (event: MessageEvent) => {
                  if (event.source !== window.parent || event.origin !== parentOrigin) return;

                  if (event.data?.type === 'PUSHER_AUTH_RESPONSE' && event.data?.authId === authId) {
                    if (
                      event.data.success === true &&
                      event.data.authData &&
                      typeof event.data.authData.auth === 'string'
                    ) {
                      console.log('✅ [GAME-PUSHER] Auth successful via postMessage');
                      settle(null, event.data.authData);
                    } else {
                      settle(new Error('Pusher authorization failed'));
                    }
                  }
                };

                window.addEventListener('message', handleAuthResponse);
                window.parent?.postMessage({
                  type: 'PUSHER_AUTH_REQUEST',
                  authId,
                  socketId,
                  channelName: channel.name,
                }, parentOrigin);

                timeoutId = setTimeout(() => {
                  settle(new Error('Pusher authorization timed out'));
                }, 10_000);
              }
            })
          }
        );
        ownedPusher = pusherInstance;

        // Connection event handlers
        pusherInstance.connection.bind('connected', () => {
          console.log('✅ [GAME-PUSHER] Connected to Pusher');
        });

        pusherInstance.connection.bind('disconnected', () => {
          console.log('🔌 [GAME-PUSHER] Disconnected from Pusher');
          setConnectionState('disconnected');
        });

        pusherInstance.connection.bind('error', (error: any) => {
          console.error('❌ [GAME-PUSHER] Connection error:', error);
          setConnectionState('disconnected');
        });

        // Subscribe to game session channel
        const channelName = `private-game-session-${sessionData.sessionId}`;
        const gameChannel = pusherInstance.subscribe(channelName);
        ownedChannel = gameChannel;

        // Assign channel ref immediately so it's available even if subscription is pending
        channelRef.current = gameChannel;
        sessionDataRef.current = sessionData;

        // Handle subscription events
        gameChannel.bind('pusher:subscription_succeeded', () => {
          console.log('✅ [GAME-PUSHER] Subscribed to channel:', channelName);
          isConnectingRef.current = false;
          setConnectionState('connected');

          // Ensure refs are still set (they should be, but double-check)
          if (!channelRef.current) {
            channelRef.current = gameChannel;
          }
          if (!sessionDataRef.current) {
            sessionDataRef.current = sessionData;
          }

          // Notify dapp that game is ready
          gameChannel.trigger('client-game-ready', {
            gameId: sessionData.gameId,
            timestamp: Date.now()
          });

          const pendingResult = readPendingGameEndResults()
            .filter((candidate) => candidate.sessionId === sessionData.sessionId)
            .sort((left, right) => left.timestamp - right.timestamp)[0];
          if (pendingResult) {
            console.log('🔄 [GAME-PUSHER] Resuming pending game result delivery', {
              resultId: pendingResult.resultId,
            });
            startPendingGameEndDelivery(pendingResult);
          }
        });

        gameChannel.bind('client-game-end-ack', (data: unknown) => {
          if (
            !isRecord(data) ||
            typeof data.resultId !== 'string' ||
            data.resultId.length < 8 ||
            data.resultId.length > 128
          ) {
            return;
          }
          const remainsDurable = readPendingGameEndResults().some((candidate) => (
            candidate.sessionId === sessionData.sessionId && candidate.resultId === data.resultId
          ));
          if (!remainsDurable) return;

          // Keep the exact result until the parent clears it after receiving this
          // confirmation. Reloading either document cannot strand the old session.
          setHasPendingGameEnd(true);
          acknowledgedGameEndIdsRef.current.add(`${sessionData.sessionId}:${data.resultId}`);
          startGameEndAckConfirmation(sessionData.sessionId, data.resultId);
          console.log('✅ [GAME-PUSHER] Dapp acknowledged persisted game result', {
            resultId: data.resultId,
          });
        });

        // NEW: Listen for session updates from dapp via Pusher
        gameChannel.bind('client-session-start', (data: any) => {
          console.log('🚀 [GAME-PUSHER] Session start received via Pusher');

          const currentSessionId = sessionDataRef.current?.sessionId;
          const newSessionId = data.sessionId;

          if (currentSessionId === newSessionId) {
            console.log('🔄 [GAME-PUSHER] Same session refreshed via Pusher:', newSessionId);
            acceptSessionData(data);
          }
        });

        // NEW: Listen for game commands from dapp
        gameChannel.bind('client-game-command', (data: any) => {
          console.log('🎮 [GAME-PUSHER] Game command received:', data);
          // This can be used for pause/resume, reset, etc.
        });

        gameChannel.bind('pusher:subscription_error', (error: any) => {
          console.error('❌ [GAME-PUSHER] Subscription error:', error);
          console.error('❌ [GAME-PUSHER] Subscription error details:', {
            error,
            channelName,
            pusherState: pusherInstance.connection.state
          });
          isConnectingRef.current = false;
          setConnectionState('disconnected');
          // Don't clear channelRef on error - keep it for retry attempts
        });

        // Listen for session start confirmation from dapp
        gameChannel.bind('client-session-start', (data: any) => {
          console.log('📍 [GAME-PUSHER] Session start confirmed:', data);
          // Session is now fully active
        });

        gameChannel.bind('client-dapp-ready', (data: any) => {
          console.log('📱 [GAME-PUSHER] Dapp ready signal:', data);
          // Dapp is ready to receive events
        });

        // Update refs and state (channelRef already set above, but ensure everything is consistent)
        pusherRef.current = pusherInstance;
        pusherSessionIdRef.current = sessionData.sessionId;
        if (!channelRef.current) {
          channelRef.current = gameChannel;
        }
        if (!sessionDataRef.current) {
          sessionDataRef.current = sessionData;
        }

        const state = (gameChannel as any).state;
        console.log('🔗 [GAME-PUSHER] Channel assigned to ref:', {
          hasChannel: !!channelRef.current,
          channelName: gameChannel.name,
          sessionId: sessionData.sessionId,
          channelState: state
        });

        setPusher(pusherInstance);
        setChannel(gameChannel);

      } catch (error) {
        console.error('❌ [GAME-PUSHER] Error connecting:', error);
        isConnectingRef.current = false;
        setConnectionState('disconnected');
      }
    };

    // Cleanup function - delayed cleanup to allow game end to complete
    return () => {
      clearTimeout(connectTimeout);
      console.log('🔌 [GAME-PUSHER] Cleanup requested');
      isConnectingRef.current = false;

      // Cancel any pending cleanup
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
        cleanupTimeoutRef.current = null;
      }

      // Delay cleanup to allow pending game end operations to complete
      cleanupTimeoutRef.current = setTimeout(() => {
        console.log('🧹 [GAME-PUSHER] Delayed cleanup starting...');

        if (ownedChannel) {
          ownedPusher?.unsubscribe(ownedChannel.name);
        }
        ownedPusher?.disconnect();

        // Socket cleanup must never erase a newer signed parent authority.
        // The GameSession ref belongs to acceptSessionData/clearSessionData;
        // keeping it alive also lets the postMessage recovery path persist a
        // result when Pusher drops during a run.
        if (
          pusherRef.current === ownedPusher &&
          pusherSessionIdRef.current === sessionData.sessionId
        ) {
          console.log('🧹 [GAME-PUSHER] Clearing refs owned by the old connection');
          pusherRef.current = null;
          pusherSessionIdRef.current = null;
          if (channelRef.current === ownedChannel) channelRef.current = null;
          setPusher(null);
          setChannel(null);
          setConnectionState('disconnected');
        }
        cleanupTimeoutRef.current = null;
      }, 2000); // 2 second delay to allow game end to complete
    };

  }, [
    acceptSessionData,
    clearGameEndRetries,
    connectionSessionId,
    startPendingGameEndDelivery,
    startGameEndAckConfirmation,
  ]);

  // Send checkpoint to dapp
  const sendCheckpoint = useCallback((checkpointData: Omit<GameCheckpoint, 'timestamp'>) => {
    console.log('🔍 [GAME-PUSHER] Checkpoint attempt - channel status:', {
      hasChannel: !!channelRef.current,
      connectionState,
      isConnected: connectionState === 'connected',
      hasSessionData: !!sessionDataRef.current
    });

    if (!channelRef.current) {
      console.warn('⚠️ [GAME-PUSHER] Cannot send checkpoint - no channel connection');
      return false;
    }

    const checkpoint: GameCheckpoint = {
      ...checkpointData,
      timestamp: Date.now()
    };

    try {
      channelRef.current.trigger('client-checkpoint', checkpoint);
      console.log('📤 [GAME-PUSHER] Checkpoint sent:', checkpoint);
      return true;
    } catch (error) {
      console.error('❌ [GAME-PUSHER] Failed to send checkpoint:', error);
      return false;
    }
  }, [connectionState]);

  const requestCompetitionAccess = useCallback((): Promise<TreasureHuntCompetitionAccess> => {
    const isStandaloneRuntime = window.parent === window;
    const parentOrigin = getParentOrigin();
    const sessionIdSnapshot = sessionDataRef.current?.sessionId ?? null;
    const existing = competitionAccessRequestRef.current;
    if (existing && existing.sessionId === sessionIdSnapshot) return existing.promise;
    if (isStandaloneRuntime) {
      return Promise.resolve({
        eligible: false,
        practice: true,
        sessionId: sessionIdSnapshot,
        reason: 'STANDALONE_PRACTICE',
      });
    }
    if (!parentOrigin || !hasParentHandshake || !sessionIdSnapshot) {
      return Promise.resolve({
        eligible: false,
        practice: false,
        sessionId: sessionIdSnapshot,
        reason: !parentOrigin
          ? 'SECURE_PARENT_UNAVAILABLE'
          : 'PARENT_HANDSHAKE_REQUIRED',
      });
    }

    const generationSnapshot = sessionGenerationRef.current;
    const requestId = typeof window.crypto.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte =>
        byte.toString(16).padStart(2, '0')).join('');
    let cancelRequest: (reason: string) => void = () => undefined;

    const promise = new Promise<TreasureHuntCompetitionAccess>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const settle = (result: TreasureHuntCompetitionAccess) => {
        if (settled) return;
        settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        window.removeEventListener('message', handleResponse);
        resolve(result);
      };
      cancelRequest = (reason: string) => settle({
        eligible: false,
        practice: false,
        sessionId: sessionIdSnapshot,
        reason,
      });
      const handleResponse = (event: MessageEvent) => {
        if (
          event.source !== window.parent ||
          event.origin !== parentOrigin ||
          event.data?.type !== 'TREASURE_HUNT_COMPETITION_START_RESPONSE' ||
          event.data?.requestId !== requestId ||
          sessionGenerationRef.current !== generationSnapshot
        ) {
          return;
        }
        const responseSessionId = typeof event.data.sessionId === 'string'
          ? event.data.sessionId
          : null;
        if (
          (sessionIdSnapshot && responseSessionId !== sessionIdSnapshot) ||
          (sessionDataRef.current?.sessionId && responseSessionId !== sessionDataRef.current.sessionId)
        ) {
          return;
        }
        if (
          event.data.eligible === true &&
          typeof event.data.attemptId === 'string' && event.data.attemptId.length > 0 &&
          typeof event.data.seed === 'string' && event.data.seed.length > 0 &&
          typeof event.data.alias === 'string' && event.data.alias.length > 0 &&
          event.data.status === 'active' &&
          responseSessionId
        ) {
          settle({
            eligible: true,
            practice: false,
            sessionId: responseSessionId,
            attemptId: event.data.attemptId,
            seed: event.data.seed,
            alias: event.data.alias,
            status: 'active',
          });
          return;
        }
        if (
          event.data.eligible === false &&
          typeof event.data.practice === 'boolean'
        ) {
          settle({
            eligible: false,
            practice: event.data.practice,
            sessionId: responseSessionId,
            reason: typeof event.data.reason === 'string'
              ? event.data.reason.slice(0, 80)
              : 'COMPETITION_UNAVAILABLE',
          });
        }
      };

      window.addEventListener('message', handleResponse);
      window.parent.postMessage({
        type: 'TREASURE_HUNT_COMPETITION_START_REQUEST',
        requestId,
        sessionId: sessionIdSnapshot,
      }, parentOrigin);
      timeoutId = setTimeout(() => cancelRequest('COMPETITION_REQUEST_TIMEOUT'), 12_000);
    });
    const pending: PendingCompetitionAccessRequest = {
      sessionId: sessionIdSnapshot,
      promise,
      cancel: (reason) => cancelRequest(reason),
    };
    competitionAccessRequestRef.current = pending;
    promise.finally(() => {
      if (competitionAccessRequestRef.current === pending) {
        competitionAccessRequestRef.current = null;
      }
    });
    return promise;
  }, [hasParentHandshake]);

  // Persist first, then retry with the same result id until the dapp confirms
  // that backend processing completed.
  const sendGameEnd = useCallback((endData: Omit<GameEndData, 'resultId'>) => {
    const sessionIdSnapshot = sessionDataRef.current?.sessionId;
    if (!sessionIdSnapshot) {
      console.warn('⚠️ [GAME-PUSHER] Cannot send game end - missing session data');
      return false;
    }
    if (
      !Number.isSafeInteger(endData.finalScore) ||
      endData.finalScore < 0 ||
      !Number.isSafeInteger(endData.gameTime) ||
      endData.gameTime < 0
    ) {
      console.error('❌ [GAME-PUSHER] Cannot queue an invalid game result');
      return false;
    }

    const existing = readPendingGameEndResults()
      .find((candidate) => candidate.sessionId === sessionIdSnapshot);
    const pending: PendingGameEndResult = existing ?? {
      resultId: createGameEndResultId(),
      sessionId: sessionIdSnapshot,
      finalScore: endData.finalScore,
      gameTime: endData.gameTime,
      timestamp: Date.now(),
      ...('metadata' in endData ? { metadata: endData.metadata } : {}),
      ...(endData.competitionAttemptId
        ? { competitionAttemptId: endData.competitionAttemptId }
        : {}),
    };

    if (!persistPendingGameEndResult(pending)) {
      console.error('❌ [GAME-PUSHER] Game result could not be persisted before delivery');
      unpersistedGameEndRef.current = pending;
      setHasPendingGameEnd(true);
      setGameEndPersistenceError(
        'No se pudo guardar el resultado en este dispositivo. No cierres la página y pulsa “Reintentar guardado”.',
      );
      return false;
    }

    unpersistedGameEndRef.current = null;
    setGameEndPersistenceError(null);
    setHasPendingGameEnd(true);
    startPendingGameEndDelivery(pending);
    return true;
  }, [startPendingGameEndDelivery]);

  const retryGameEndPersistence = useCallback(() => {
    const pending = unpersistedGameEndRef.current;
    if (!pending || sessionDataRef.current?.sessionId !== pending.sessionId) return false;
    if (!persistPendingGameEndResult(pending)) {
      setHasPendingGameEnd(true);
      setGameEndPersistenceError(
        'El resultado sigue sin poder guardarse. Libera espacio del navegador y vuelve a intentarlo sin cerrar la página.',
      );
      return false;
    }
    unpersistedGameEndRef.current = null;
    setGameEndPersistenceError(null);
    setHasPendingGameEnd(true);
    startPendingGameEndDelivery(pending);
    return true;
  }, [startPendingGameEndDelivery]);

  // Send honeypot trigger to dapp
  const sendHoneypotTrigger = useCallback((event: string) => {
    if (!channelRef.current) {
      console.warn('⚠️ [GAME-PUSHER] Cannot send honeypot trigger - no channel connection');
      return false;
    }

    try {
      channelRef.current.trigger('client-honeypot-trigger', { event });
      console.log('📤 [GAME-PUSHER] Honeypot trigger sent:', event);
      return true;
    } catch (error) {
      console.error('❌ [GAME-PUSHER] Failed to send honeypot trigger:', error);
      return false;
    }
  }, []);

  // Start checkpoint interval
  const startCheckpointInterval = useCallback((
    getCurrentScore: () => number,
    getCurrentGameTime: () => number,
    intervalMs: number = 5000
  ) => {
    const interval = setInterval(() => {
      if (connectionState === 'connected') {
        sendCheckpoint({
          score: getCurrentScore(),
          gameTime: getCurrentGameTime(),
          events: [] // Add any events if needed
        });
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [connectionState, sendCheckpoint]);

  return {
    // Connection state
    isConnected: connectionState === 'connected',
    connectionState,
    sessionData,
    hasParentHandshake,
    hasPendingGameEnd,
    gameEndPersistenceError,

    // Communication methods
    sendCheckpoint,
    sendGameEnd,
    retryGameEndPersistence,
    requestCompetitionAccess,
    sendHoneypotTrigger,
    startCheckpointInterval,

    // Low-level access
    pusher,
    channel,
  };
}

// Helper function to determine parent origin
function getParentOrigin(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return resolveParentOrigin(
      document.referrer,
      process.env.NEXT_PUBLIC_DAPP_ORIGIN,
      process.env.NEXT_PUBLIC_PARENT_URL,
      process.env.NODE_ENV,
    );
  } catch {
    console.error('❌ [GAME-PUSHER] Secure parent origin unavailable');
    return null;
  }
}
