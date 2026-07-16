'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import GameLayout from '@/components/layout/GameLayout';
import TreasureHuntCompetitionPanel from '@/components/games/treasure-hunt-competition-panel';
import GameLoadingSkeleton from '@/components/ui/game-loading-skeleton';
import { useGameData } from '@/hooks/use-game-data';
import { usePusherGameConnection } from '@/hooks/use-pusher-game-connection';
import {
  CompetitionClientError,
  createCompetitionAttemptCoordinator,
  createReloadSafeGameSessionStarter,
  routeGameEnd,
  type ReloadSafeParentGameSession,
} from '@/lib/treasure-hunt-competition/client';
import {
  useTreasureHuntMultiplayerBridge,
} from '@/hooks/use-treasure-hunt-multiplayer-bridge';
import { useAuth } from '@/providers/auth-provider';

const GAME_ID = 'sybil-slayer';
const GAME_VERSION = '1.0.0';
const PENDING_CLEAR_STORAGE_KEY = 'cukies:treasure-hunt:pending-session-clear:v1';

interface OwnedParentGameSession extends ReloadSafeParentGameSession {
  readonly ownerUserId: string;
}

interface CompletedCompetitionResult {
  readonly resultId: string;
  readonly finalScore: number;
  readonly isValid: boolean;
  readonly source: 'competition';
  readonly status: string | null;
  readonly clearConfirmationRequired: true;
}

interface PendingSessionClear {
  readonly ownerUserId: string;
  readonly sessionId: string;
  readonly resultId: string;
}

function readPendingSessionClears(): PendingSessionClear[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(PENDING_CLEAR_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is PendingSessionClear => Boolean(
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof value.ownerUserId === 'string' &&
      value.ownerUserId.length > 0 &&
      value.ownerUserId.length <= 256 &&
      typeof value.sessionId === 'string' &&
      value.sessionId.length > 0 &&
      value.sessionId.length <= 128 &&
      typeof value.resultId === 'string' &&
      value.resultId.length >= 8 &&
      value.resultId.length <= 128
    ));
  } catch {
    return [];
  }
}

function persistPendingSessionClear(value: PendingSessionClear) {
  try {
    const remaining = readPendingSessionClears().filter((candidate) => (
      candidate.ownerUserId !== value.ownerUserId || candidate.sessionId !== value.sessionId
    ));
    sessionStorage.setItem(PENDING_CLEAR_STORAGE_KEY, JSON.stringify([...remaining, value]));
    return true;
  } catch {
    // The resume id remains stored, so a reload can still replay the result.
    return false;
  }
}

function removePendingSessionClear(sessionId: string, resultId: string) {
  try {
    const remaining = readPendingSessionClears().filter((candidate) => (
      candidate.sessionId !== sessionId || candidate.resultId !== resultId
    ));
    if (remaining.length === 0) sessionStorage.removeItem(PENDING_CLEAR_STORAGE_KEY);
    else sessionStorage.setItem(PENDING_CLEAR_STORAGE_KEY, JSON.stringify(remaining));
  } catch {
    // A duplicate clear confirmation is safe on the next reload.
  }
}

export default function SybilSlayerPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error, refetch } =
    useGameData(GAME_ID);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionStarterRef = useRef<
    ReturnType<typeof createReloadSafeGameSessionStarter> | null
  >(null);
  const competitionCoordinatorRef = useRef<
    ReturnType<typeof createCompetitionAttemptCoordinator> | null
  >(null);
  const latestWalletUserIdRef = useRef(user?.id ?? null);
  const cleanedWalletUserIdRef = useRef(user?.id ?? null);
  const recoveredCompetitionResultsRef = useRef(new Map<string, CompletedCompetitionResult>());
  const notifiedGameEndIdsRef = useRef(new Set<string>());
  latestWalletUserIdRef.current = user?.id ?? null;
  if (!sessionStarterRef.current) {
    sessionStarterRef.current = createReloadSafeGameSessionStarter({
      gameId: GAME_ID,
      gameVersion: GAME_VERSION,
    });
  }
  if (!competitionCoordinatorRef.current) {
    competitionCoordinatorRef.current = createCompetitionAttemptCoordinator();
  }
  const competitionCoordinator = competitionCoordinatorRef.current;

  const [parentGameSession, setParentGameSession] =
    useState<OwnedParentGameSession | null>(null);
  const latestParentGameSessionRef = useRef<OwnedParentGameSession | null>(null);
  latestParentGameSessionRef.current = parentGameSession;
  const [roomId, setRoomId] = useState<string | null>(null);
  const [localGameStats, setLocalGameStats] = useState({
    currentScore: 0,
    bestScore: 0,
    sessionsPlayed: 0,
    validSessions: 0,
  });
  const [competitionPanelRefreshKey, setCompetitionPanelRefreshKey] = useState(0);
  const activeParentGameSession =
    parentGameSession?.ownerUserId === user?.id ? parentGameSession : null;
  const currentSessionId = activeParentGameSession?.sessionId ?? null;
  const gameOrigin = useMemo(() => {
    if (!gameConfig?.gameUrl || typeof window === 'undefined') {
      return null;
    }
    try {
      return new URL(gameConfig.gameUrl, window.location.href).origin;
    } catch {
      return null;
    }
  }, [gameConfig?.gameUrl]);
  const gameOriginRef = useRef<string | null>(gameOrigin);
  gameOriginRef.current = gameOrigin;

  const sendSessionClear = useCallback((sessionId: string | null, resultId?: string) => {
    const frameWindow = iframeRef.current?.contentWindow;
    const targetOrigin = gameOriginRef.current;
    if (!frameWindow || !targetOrigin) return;
    frameWindow.postMessage({
      type: 'GAME_SESSION_CLEAR',
      sessionId,
      ...(resultId ? { resultId } : {}),
    }, targetOrigin);
  }, []);

  const finalizeParentSessionRotation = useCallback((
    expectedSessionId: string,
    resultId?: string,
  ) => {
    const current = latestParentGameSessionRef.current;
    if (!current || current.sessionId !== expectedSessionId) return false;
    if (resultId) removePendingSessionClear(current.sessionId, resultId);
    competitionCoordinator.reset(current.sessionId);
    sessionStarterRef.current?.forget(current.sessionId);
    for (const key of recoveredCompetitionResultsRef.current.keys()) {
      if (key.startsWith(`${current.sessionId}:`)) {
        recoveredCompetitionResultsRef.current.delete(key);
      }
    }
    setParentGameSession((candidate) =>
      candidate?.sessionId === expectedSessionId ? null : candidate,
    );
    return true;
  }, [competitionCoordinator]);

  const rotateParentSession = useCallback((expectedSessionId: string, resultId?: string) => {
    const current = latestParentGameSessionRef.current;
    if (!current || current.sessionId !== expectedSessionId) return false;
    if (!resultId) {
      sendSessionClear(current.sessionId);
      return finalizeParentSessionRotation(current.sessionId);
    }

    // Do not forget the resumable session until the iframe confirms it removed
    // this exact pending result. The marker survives a full parent reload.
    persistPendingSessionClear({
      ownerUserId: current.ownerUserId,
      sessionId: current.sessionId,
      resultId,
    });
    sendSessionClear(current.sessionId, resultId);
    return true;
  }, [finalizeParentSessionRotation, sendSessionClear]);

  useEffect(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('session_token_')) localStorage.removeItem(key);
    }
  }, []);

  useEffect(() => {
    const roomParam = new URLSearchParams(window.location.search).get('room');
    setRoomId(roomParam);
  }, []);

  useEffect(() => {
    const nextWalletUserId = user?.id ?? null;
    const previousWalletUserId = cleanedWalletUserIdRef.current;
    if (previousWalletUserId === nextWalletUserId) {
      return;
    }

    if (previousWalletUserId !== null) {
      setRoomId(null);
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    }
    sendSessionClear(latestParentGameSessionRef.current?.sessionId ?? null);
    competitionCoordinator.reset();
    recoveredCompetitionResultsRef.current.clear();
    notifiedGameEndIdsRef.current.clear();
    // Keep opaque resume ids per owner. The server rechecks the signed wallet,
    // and switching back can still recover that wallet's pending result.
    sessionStarterRef.current?.reset();
    setParentGameSession(null);
    cleanedWalletUserIdRef.current = nextWalletUserId;
  }, [competitionCoordinator, sendSessionClear, user?.id]);

  useEffect(
    () => () => {
      sendSessionClear(latestParentGameSessionRef.current?.sessionId ?? null);
      competitionCoordinator.reset();
      sessionStarterRef.current?.reset();
    },
    [competitionCoordinator, sendSessionClear],
  );

  const onSessionStart = useCallback(
    (_sessionData: { sessionToken: string; sessionId: string }) => {
      setLocalGameStats((previous) => ({
        ...previous,
        sessionsPlayed: previous.sessionsPlayed + 1,
      }));
    },
    [],
  );

  const onCheckpoint = useCallback((checkpoint: { score: number }) => {
    setLocalGameStats((previous) => ({ ...previous, currentScore: checkpoint.score }));
  }, []);

  const onSessionEnd = useCallback(
    async (result: {
      resultId: string;
      finalScore: number;
      isValid: boolean;
      source: 'competition' | 'legacy';
      status: string | null;
      clearConfirmationRequired: boolean;
    }) => {
      const endingSession = activeParentGameSession;
      if (
        !endingSession ||
        latestWalletUserIdRef.current !== endingSession.ownerUserId ||
        latestParentGameSessionRef.current?.sessionId !== endingSession.sessionId
      ) {
        return;
      }
      const resultKey = `${endingSession.sessionId}:${result.resultId}`;
      if (notifiedGameEndIdsRef.current.has(resultKey)) return;
      notifiedGameEndIdsRef.current.add(resultKey);
      setLocalGameStats((previous) => ({
        ...previous,
        bestScore: Math.max(previous.bestScore, result.finalScore),
        currentScore: 0,
        validSessions: previous.validSessions + (result.isValid ? 1 : 0),
      }));

      if (result.isValid) {
        try {
          await refetch();
        } catch {
          // Stats refresh is secondary; never strand an already durable result.
        }
      }
      if (result.source === 'competition' && result.status === 'review') {
        setCompetitionPanelRefreshKey((key) => key + 1);
      }

      if (
        latestWalletUserIdRef.current !== endingSession.ownerUserId ||
        latestParentGameSessionRef.current?.sessionId !== endingSession.sessionId
      ) {
        return;
      }
      // Only the pre-rollout iframe lacks the durable ACK/CLEAR protocol.
      // Every modern result keeps its exact id until the iframe confirms local removal,
      // including practice runs that use the legacy economic endpoint.
      rotateParentSession(
        endingSession.sessionId,
        result.source === 'competition' || result.clearConfirmationRequired
          ? result.resultId
          : undefined,
      );
    },
    [activeParentGameSession, refetch, rotateParentSession],
  );

  const onHoneypotDetected = useCallback((event: string) => {
    console.warn('Honeypot event detected by the game', event);
  }, []);

  const onGameEndPersisted = useCallback((result: {
    resultId: string;
    clearConfirmationRequired: boolean;
  }) => {
    const endingSession = activeParentGameSession;
    if (!result.clearConfirmationRequired) return true;
    if (
      !endingSession ||
      latestWalletUserIdRef.current !== endingSession.ownerUserId ||
      latestParentGameSessionRef.current?.sessionId !== endingSession.sessionId
    ) {
      return false;
    }
    // This marker is written after backend durability but before ACK. If the
    // parent reloads before ACK_CONFIRMED, the resumed handshake can still
    // clear the iframe's exact persisted result without needing Pusher auth.
    return persistPendingSessionClear({
      ownerUserId: endingSession.ownerUserId,
      sessionId: endingSession.sessionId,
      resultId: result.resultId,
    });
  }, [activeParentGameSession]);

  const gameConnectionOptions = useMemo(
    () => ({
      gameId: GAME_ID,
      gameVersion: GAME_VERSION,
      competitionCoordinator,
      onSessionStart,
      onCheckpoint,
      onSessionEnd,
      onGameEndPersisted,
      onHoneypotDetected,
    }),
    [
      competitionCoordinator,
      onSessionStart,
      onCheckpoint,
      onSessionEnd,
      onGameEndPersisted,
      onHoneypotDetected,
    ],
  );

  const authData = useMemo(
    () => ({
      isAuthenticated: Boolean(user) && !isLoading,
      user,
      sessionToken: activeParentGameSession?.sessionToken ?? null,
    }),
    [activeParentGameSession?.sessionToken, user, isLoading],
  );

  usePusherGameConnection(currentSessionId, authData, gameConnectionOptions);

  const sendSessionHandshake = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow || !gameOrigin || !activeParentGameSession || !user) {
      return;
    }

    frameWindow.postMessage(
      {
        type: 'GAME_SESSION_START',
        payload: {
          gameId: GAME_ID,
          sessionId: activeParentGameSession.sessionId,
          gameVersion: activeParentGameSession.gameVersion,
          roomId,
          userId: user.id,
        },
      },
      gameOrigin,
    );
    const pendingClear = readPendingSessionClears().find((candidate) => (
      candidate.ownerUserId === activeParentGameSession.ownerUserId &&
      candidate.sessionId === activeParentGameSession.sessionId
    ));
    if (pendingClear) {
      sendSessionClear(pendingClear.sessionId, pendingClear.resultId);
    }
  }, [activeParentGameSession, gameOrigin, roomId, sendSessionClear, user]);

  const handleRoomJoined = useCallback((roomCode: string) => {
    setRoomId(roomCode);
  }, []);

  useTreasureHuntMultiplayerBridge({
    iframeRef,
    gameUrl: gameConfig?.gameUrl,
    currentSessionId,
    onRoomJoined: handleRoomJoined,
    onSessionReleased: rotateParentSession,
  });

  useEffect(() => {
    if (!gameOrigin) {
      return undefined;
    }

    const handleGameMessage = async (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow || event.origin !== gameOrigin) {
        return;
      }

      if (event.data?.type === 'GAME_READY') {
        sendSessionHandshake();
        return;
      }
      if (event.data?.type === 'TREASURE_HUNT_GAME_SESSION_CLEAR_CONFIRMED') {
        const current = latestParentGameSessionRef.current;
        const resultId = event.data.resultId;
        if (
          !current ||
          event.data.sessionId !== current.sessionId ||
          typeof resultId !== 'string' ||
          resultId.length < 8 ||
          resultId.length > 128 ||
          !readPendingSessionClears().some((candidate) => (
            candidate.ownerUserId === current.ownerUserId &&
            candidate.sessionId === current.sessionId &&
            candidate.resultId === resultId
          ))
        ) {
          return;
        }
        finalizeParentSessionRotation(current.sessionId, resultId);
        return;
      }
      if (event.data?.type === 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY') {
        const sessionAtRequest = latestParentGameSessionRef.current;
        const walletUserIdAtRequest = latestWalletUserIdRef.current;
        const resultId = event.data.resultId;
        const competitionAttemptId = event.data.competitionAttemptId;
        if (
          !sessionAtRequest ||
          !walletUserIdAtRequest ||
          sessionAtRequest.ownerUserId !== walletUserIdAtRequest ||
          event.data.sessionId !== sessionAtRequest.sessionId ||
          typeof resultId !== 'string' ||
          resultId.length < 8 ||
          resultId.length > 128 ||
          typeof competitionAttemptId !== 'string' ||
          competitionAttemptId.length === 0 ||
          competitionAttemptId.length > 128 ||
          !Number.isSafeInteger(event.data.finalScore) ||
          event.data.finalScore < 0 ||
          !Number.isSafeInteger(event.data.gameTime) ||
          event.data.gameTime < 0
        ) {
          return;
        }
        const resultKey = `${sessionAtRequest.sessionId}:${resultId}`;
        let completed = recoveredCompetitionResultsRef.current.get(resultKey);
        if (!completed) {
          try {
            const routed = await routeGameEnd({
              gameSessionId: sessionAtRequest.sessionId,
              sessionToken: sessionAtRequest.sessionToken,
              competitionCoordinator,
              gameEnd: {
                finalScore: event.data.finalScore,
                gameTime: event.data.gameTime,
                competitionAttemptId,
              },
            });
            if (routed.source !== 'competition' || !routed.success) return;
            const status = routed.result && typeof routed.result === 'object' &&
              'status' in routed.result && typeof routed.result.status === 'string'
              ? routed.result.status
              : null;
            completed = {
              resultId,
              finalScore: routed.finalScore,
              isValid: routed.isValid,
              source: 'competition',
              status,
              clearConfirmationRequired: true,
            };
            if (!persistPendingSessionClear({
              ownerUserId: sessionAtRequest.ownerUserId,
              sessionId: sessionAtRequest.sessionId,
              resultId,
            })) {
              // Backend completion is durable, but acknowledging without a
              // reload-safe clear marker could strand an inactive session.
              // The iframe retains and retries the exact evidence.
              return;
            }
            recoveredCompetitionResultsRef.current.set(resultKey, completed);
            while (recoveredCompetitionResultsRef.current.size > 32) {
              const oldest = recoveredCompetitionResultsRef.current.keys().next().value;
              if (typeof oldest !== 'string') break;
              recoveredCompetitionResultsRef.current.delete(oldest);
            }
          } catch {
            // The iframe retains and retries the exact result. Never acknowledge
            // an uncertain or identity-mismatched recovery.
            return;
          }
        }
        if (
          iframeRef.current?.contentWindow === frameWindow &&
          latestWalletUserIdRef.current === walletUserIdAtRequest &&
          latestParentGameSessionRef.current?.sessionId === sessionAtRequest.sessionId
        ) {
          frameWindow.postMessage({
            type: 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK',
            sessionId: sessionAtRequest.sessionId,
            resultId,
          }, gameOrigin);
        }
        return;
      }
      if (event.data?.type === 'TREASURE_HUNT_COMPETITION_RESULT_RECOVERY_ACK_CONFIRMED') {
        const sessionAtConfirmation = latestParentGameSessionRef.current;
        const resultId = event.data.resultId;
        if (
          !sessionAtConfirmation ||
          event.data.sessionId !== sessionAtConfirmation.sessionId ||
          typeof resultId !== 'string' ||
          resultId.length < 8 ||
          resultId.length > 128
        ) {
          return;
        }
        const completed = recoveredCompetitionResultsRef.current.get(
          `${sessionAtConfirmation.sessionId}:${resultId}`,
        );
        if (completed) await onSessionEnd(completed);
        return;
      }
      if (event.data?.type === 'TREASURE_HUNT_COMPETITION_START_REQUEST') {
        const requestId = event.data.requestId;
        if (typeof requestId !== 'string' || requestId.length < 8 || requestId.length > 128) {
          return;
        }
        const sessionAtRequest = latestParentGameSessionRef.current;
        const walletUserIdAtRequest = latestWalletUserIdRef.current;
        const reply = (payload: Record<string, unknown>) => {
          if (iframeRef.current?.contentWindow !== frameWindow) return;
          frameWindow.postMessage({
            type: 'TREASURE_HUNT_COMPETITION_START_RESPONSE',
            requestId,
            sessionId: sessionAtRequest?.sessionId ?? null,
            ...payload,
          }, gameOrigin);
        };
        if (
          !sessionAtRequest ||
          !walletUserIdAtRequest ||
          sessionAtRequest.ownerUserId !== walletUserIdAtRequest
        ) {
          reply({ eligible: false, practice: false, reason: 'SIGNED_WALLET_REQUIRED' });
          return;
        }
        if (
          event.data.sessionId != null &&
          event.data.sessionId !== sessionAtRequest.sessionId
        ) {
          reply({ eligible: false, practice: false, reason: 'STALE_GAME_SESSION' });
          return;
        }
        try {
          const attempt = await competitionCoordinator.start(sessionAtRequest.sessionId);
          if (
            iframeRef.current?.contentWindow !== frameWindow ||
            latestWalletUserIdRef.current !== walletUserIdAtRequest ||
            latestParentGameSessionRef.current?.sessionId !== sessionAtRequest.sessionId
          ) {
            return;
          }
          reply({
            eligible: true,
            practice: false,
            attemptId: attempt.attemptId,
            seed: attempt.seed,
            alias: attempt.alias,
            status: attempt.status,
          });
        } catch (error) {
          if (
            iframeRef.current?.contentWindow !== frameWindow ||
            latestWalletUserIdRef.current !== walletUserIdAtRequest ||
            latestParentGameSessionRef.current?.sessionId !== sessionAtRequest.sessionId
          ) {
            return;
          }
          const errorCode = error instanceof CompetitionClientError
            ? error.code
            : 'COMPETITION_UNAVAILABLE';
          if (errorCode === 'GAME_SESSION_NOT_ELIGIBLE') {
            // An opaque resume id can outlive its server-side eligibility.
            // Reject this play request, then rotate only that proven-stale
            // GameSession so the next request gets a fresh authority session.
            reply({
              eligible: false,
              practice: false,
              reason: 'GAME_SESSION_RESTART_REQUIRED',
            });
            rotateParentSession(sessionAtRequest.sessionId);
            return;
          }
          const canSafelyPractice = error instanceof CompetitionClientError && [
            'COMPETITION_NOT_ACTIVE',
            'COMPETITION_NOT_CONFIGURED',
          ].includes(error.code);
          reply({
            eligible: false,
            practice: canSafelyPractice,
            reason: errorCode,
          });
        }
        return;
      }
      if (event.data?.type !== 'PUSHER_AUTH_REQUEST') {
        return;
      }

      const sessionAtRequest = latestParentGameSessionRef.current;
      const walletUserIdAtRequest = latestWalletUserIdRef.current;
      const expectedChannel = sessionAtRequest
        ? `private-game-session-${sessionAtRequest.sessionId}`
        : null;
      if (
        !sessionAtRequest ||
        !expectedChannel ||
        !walletUserIdAtRequest ||
        sessionAtRequest.ownerUserId !== walletUserIdAtRequest ||
        typeof event.data.authId !== 'string' ||
        event.data.authId.length === 0 ||
        event.data.authId.length > 128 ||
        typeof event.data.socketId !== 'string' ||
        event.data.socketId.length === 0 ||
        event.data.socketId.length > 128 ||
        event.data.channelName !== expectedChannel
      ) {
        return;
      }

      try {
        const params = new URLSearchParams();
        params.append('socket_id', event.data.socketId);
        params.append('channel_name', expectedChannel);
        params.append('session_token', sessionAtRequest.sessionToken);

        const response = await fetch('/api/pusher/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        if (
          iframeRef.current?.contentWindow !== frameWindow ||
          latestWalletUserIdRef.current !== walletUserIdAtRequest ||
          latestParentGameSessionRef.current?.sessionId !== sessionAtRequest.sessionId
        ) {
          return;
        }
        if (response.ok) {
          const pusherAuthData = await response.json();
          frameWindow.postMessage(
            {
              type: 'PUSHER_AUTH_RESPONSE',
              authId: event.data.authId,
              success: true,
              authData: pusherAuthData,
            },
            gameOrigin,
          );
        } else {
          frameWindow.postMessage(
            {
              type: 'PUSHER_AUTH_RESPONSE',
              authId: event.data.authId,
              success: false,
              error: 'Authentication failed',
            },
            gameOrigin,
          );
        }
      } catch {
        if (
          iframeRef.current?.contentWindow === frameWindow &&
          latestWalletUserIdRef.current === walletUserIdAtRequest &&
          latestParentGameSessionRef.current?.sessionId === sessionAtRequest.sessionId
        ) {
          frameWindow.postMessage(
            {
              type: 'PUSHER_AUTH_RESPONSE',
              authId: event.data.authId,
              success: false,
              error: 'Authentication request failed',
            },
            gameOrigin,
          );
        }
      }
    };

    window.addEventListener('message', handleGameMessage);
    return () => window.removeEventListener('message', handleGameMessage);
  }, [
    competitionCoordinator,
    finalizeParentSessionRotation,
    gameOrigin,
    onSessionEnd,
    rotateParentSession,
    sendSessionHandshake,
  ]);

  useEffect(() => {
    if (
      !authData.isAuthenticated ||
      !user?.id ||
      activeParentGameSession
    ) {
      return undefined;
    }

    const requestedWalletUserId = user.id;
    let cancelled = false;
    void sessionStarterRef.current
      ?.start(requestedWalletUserId)
      .then((session) => {
        if (cancelled || latestWalletUserIdRef.current !== requestedWalletUserId) {
          return;
        }
        setParentGameSession({ ...session, ownerUserId: requestedWalletUserId });
        onSessionStart({
          sessionToken: session.sessionToken,
          sessionId: session.sessionId,
        });
      })
      .catch((error: unknown) => {
        if (
          !cancelled &&
          latestWalletUserIdRef.current === requestedWalletUserId &&
          !(error instanceof DOMException && error.name === 'AbortError')
        ) {
          console.error('Game session could not be started');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authData.isAuthenticated,
    activeParentGameSession,
    onSessionStart,
    user?.id,
  ]);

  useEffect(() => {
    sendSessionHandshake();
  }, [sendSessionHandshake]);

  useEffect(() => {
    if (!activeParentGameSession) return undefined;
    const pendingClear = readPendingSessionClears().find((candidate) => (
      candidate.ownerUserId === activeParentGameSession.ownerUserId &&
      candidate.sessionId === activeParentGameSession.sessionId
    ));
    if (!pendingClear) return undefined;

    const retry = window.setInterval(() => {
      sendSessionClear(pendingClear.sessionId, pendingClear.resultId);
    }, 1_000);
    return () => window.clearInterval(retry);
  }, [activeParentGameSession, sendSessionClear]);

  const handleGameConnection = useCallback(
    (_connectedIframeRef: React.RefObject<HTMLIFrameElement>) => undefined,
    [],
  );

  if (loading || !gameConfig) {
    return <GameLoadingSkeleton message="Loading Sybil Slayer..." />;
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-lg text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <GameLayout
      gameConfig={gameConfig}
      gameStats={
        gameStats || {
          gameId: GAME_ID,
          totalPlayers: 0,
          totalSessions: 0,
          avgScore: 0,
          topScore: 0,
          recentSessions: [],
        }
      }
      leaderboardData={
        leaderboardData || {
          leaderboard: [],
          totalCount: 0,
          hasMore: false,
        }
      }
      loading={loading}
      iframeRef={iframeRef}
      onGameConnection={handleGameConnection}
      mobileFocus
    >
      <TreasureHuntCompetitionPanel key={competitionPanelRefreshKey} />
    </GameLayout>
  );
}
