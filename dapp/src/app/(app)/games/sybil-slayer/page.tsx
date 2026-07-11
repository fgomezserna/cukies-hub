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

export default function SybilSlayerPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error, refetch } =
    useGameData(GAME_ID);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sessionStarterRef = useRef<
    ReturnType<typeof createSingleFlightGameSessionStarter> | null
  >(null);
  if (!sessionStarterRef.current) {
    sessionStarterRef.current = createSingleFlightGameSessionStarter({
      gameId: GAME_ID,
      gameVersion: GAME_VERSION,
    });
  }

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [parentGameSession, setParentGameSession] = useState<ParentGameSession | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [localGameStats, setLocalGameStats] = useState({
    currentScore: 0,
    bestScore: 0,
    sessionsPlayed: 0,
    validSessions: 0,
  });

  useEffect(() => {
    const roomParam = new URLSearchParams(window.location.search).get('room');
    setRoomId(roomParam);
  }, []);

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
      if (currentSessionId) {
        localStorage.removeItem(`session_token_${currentSessionId}`);
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

      sessionStarterRef.current?.reset();
      setParentGameSession(null);
      setCurrentSessionId(null);
    },
    [currentSessionId, refetch],
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
    }),
    [user, isLoading],
  );

  usePusherGameConnection(currentSessionId, authData, gameConnectionOptions);

  const sendSessionHandshake = useCallback(() => {
    const frameWindow = iframeRef.current?.contentWindow;
    if (!frameWindow || !gameOrigin || !parentGameSession || !user) {
      return;
    }

    frameWindow.postMessage(
      {
        type: 'GAME_SESSION_START',
        payload: {
          gameId: GAME_ID,
          sessionToken: parentGameSession.sessionToken,
          sessionId: parentGameSession.sessionId,
          gameVersion: parentGameSession.gameVersion,
          roomId,
          user: {
            id: user.id,
            name: user.username || 'Anonymous',
            email: user.email,
          },
        },
      },
      gameOrigin,
    );
  }, [gameOrigin, parentGameSession, roomId, user]);

  const handleRoomJoined = useCallback((roomCode: string) => {
    setRoomId(roomCode);
  }, []);

  useTreasureHuntMultiplayerBridge({
    iframeRef,
    gameUrl: gameConfig?.gameUrl,
    currentSessionId,
    onRoomJoined: handleRoomJoined,
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

      try {
        const params = new URLSearchParams();
        params.append('socket_id', event.data.socketId);
        params.append('channel_name', event.data.channelName);
        params.append('session_token', event.data.sessionToken);

        const response = await fetch('/api/pusher/auth-simple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });

        if (iframeRef.current?.contentWindow !== frameWindow) {
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
        if (iframeRef.current?.contentWindow === frameWindow) {
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
      currentSessionId ||
      parentGameSession
    ) {
      return undefined;
    }

    let cancelled = false;
    void sessionStarterRef.current
      ?.start()
      .then((session) => {
        if (cancelled) {
          return;
        }
        setParentGameSession(session);
        setCurrentSessionId(session.sessionId);
        localStorage.setItem(`session_token_${session.sessionId}`, session.sessionToken);
        onSessionStart({
          sessionToken: session.sessionToken,
          sessionId: session.sessionId,
        });
      })
      .catch(() => {
        if (!cancelled) {
          console.error('Game session could not be started');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    authData.isAuthenticated,
    currentSessionId,
    onSessionStart,
    parentGameSession,
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
