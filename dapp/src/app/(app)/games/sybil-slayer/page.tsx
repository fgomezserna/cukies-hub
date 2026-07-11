'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import GameLayout from '@/components/layout/GameLayout';
import GameLoadingSkeleton from '@/components/ui/game-loading-skeleton';
import { useGameData } from '@/hooks/use-game-data';
import { usePusherGameConnection } from '@/hooks/use-pusher-game-connection';
import {
  createSingleFlightGameSessionStarter,
  type ParentGameSession,
  useTreasureHuntMultiplayerBridge,
} from '@/hooks/use-treasure-hunt-multiplayer-bridge';
import { useAuth } from '@/providers/auth-provider';

const GAME_ID = 'sybil-slayer';
const GAME_VERSION = '1.0.0';

interface OwnedParentGameSession extends ParentGameSession {
  readonly ownerUserId: string;
}

export default function SybilSlayerPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error, refetch } =
    useGameData(GAME_ID);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionStarterRef = useRef<
    ReturnType<typeof createSingleFlightGameSessionStarter> | null
  >(null);
  const latestWalletUserIdRef = useRef(user?.id ?? null);
  const cleanedWalletUserIdRef = useRef(user?.id ?? null);
  latestWalletUserIdRef.current = user?.id ?? null;
  if (!sessionStarterRef.current) {
    sessionStarterRef.current = createSingleFlightGameSessionStarter({
      gameId: GAME_ID,
      gameVersion: GAME_VERSION,
    });
  }

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

  const sendSessionClear = useCallback((sessionId: string | null) => {
    const frameWindow = iframeRef.current?.contentWindow;
    const targetOrigin = gameOriginRef.current;
    if (!frameWindow || !targetOrigin) return;
    frameWindow.postMessage({ type: 'GAME_SESSION_CLEAR', sessionId }, targetOrigin);
  }, []);

  const rotateParentSession = useCallback((expectedSessionId: string) => {
    const current = latestParentGameSessionRef.current;
    if (!current || current.sessionId !== expectedSessionId) return false;
    sendSessionClear(current.sessionId);
    sessionStarterRef.current?.reset();
    setParentGameSession((candidate) =>
      candidate?.sessionId === expectedSessionId ? null : candidate,
    );
    return true;
  }, [sendSessionClear]);

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
    if (cleanedWalletUserIdRef.current === nextWalletUserId) {
      return;
    }

    sendSessionClear(latestParentGameSessionRef.current?.sessionId ?? null);
    sessionStarterRef.current?.reset();
    setParentGameSession(null);
    cleanedWalletUserIdRef.current = nextWalletUserId;
  }, [sendSessionClear, user?.id]);

  useEffect(
    () => () => {
      sendSessionClear(latestParentGameSessionRef.current?.sessionId ?? null);
      sessionStarterRef.current?.reset();
    },
    [sendSessionClear],
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
    async (result: { finalScore: number; isValid: boolean }) => {
      const endingSession = activeParentGameSession;
      if (
        !endingSession ||
        latestWalletUserIdRef.current !== endingSession.ownerUserId ||
        latestParentGameSessionRef.current?.sessionId !== endingSession.sessionId
      ) {
        return;
      }
      setLocalGameStats((previous) => ({
        ...previous,
        bestScore: Math.max(previous.bestScore, result.finalScore),
        currentScore: 0,
        validSessions: previous.validSessions + (result.isValid ? 1 : 0),
      }));

      if (result.isValid) {
        await refetch();
      }

      if (
        latestWalletUserIdRef.current !== endingSession.ownerUserId ||
        latestParentGameSessionRef.current?.sessionId !== endingSession.sessionId
      ) {
        return;
      }
      rotateParentSession(endingSession.sessionId);
    },
    [activeParentGameSession, refetch, rotateParentSession],
  );

  const onHoneypotDetected = useCallback((event: string) => {
    console.warn('Honeypot event detected by the game', event);
  }, []);

  const gameConnectionOptions = useMemo(
    () => ({
      gameId: GAME_ID,
      gameVersion: GAME_VERSION,
      onSessionStart,
      onCheckpoint,
      onSessionEnd,
      onHoneypotDetected,
    }),
    [onSessionStart, onCheckpoint, onSessionEnd, onHoneypotDetected],
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
  }, [activeParentGameSession, gameOrigin, roomId, user]);

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
  }, [gameOrigin, sendSessionHandshake]);

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
    />
  );
}
