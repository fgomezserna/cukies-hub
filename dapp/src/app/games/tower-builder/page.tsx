'use client';

import React, { useCallback, useRef } from 'react';
import { useGameConnection } from '@/hooks/use-game-connection';
import { useAuth } from '@/providers/auth-provider';
import { useGameData } from '@/hooks/use-game-data';
import GameLayout from '@/components/layout/GameLayout';

export default function TowerBuilderPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error } = useGameData('tower-builder');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  
  // Local game state for real-time updates
  const [localGameStats, setLocalGameStats] = React.useState({
    currentScore: 0,
    bestScore: 0,
    sessionsPlayed: 0,
    validSessions: 0
  });

  // Game connection callbacks
  const onSessionStart = useCallback((sessionData: { sessionToken: string; sessionId: string }) => {
    console.log('Tower Builder session started:', sessionData);
    setLocalGameStats(prev => ({ ...prev, sessionsPlayed: prev.sessionsPlayed + 1 }));
  }, []);

  const onCheckpoint = useCallback((checkpoint: any) => {
    console.log('Tower Builder checkpoint received:', checkpoint);
    setLocalGameStats(prev => ({ ...prev, currentScore: checkpoint.score }));
  }, []);

  const onSessionEnd = useCallback((result: { finalScore: number; isValid: boolean }) => {
    console.log('Tower Builder session ended:', result);
    setLocalGameStats(prev => ({
      ...prev,
      bestScore: Math.max(prev.bestScore, result.finalScore),
      currentScore: 0,
      validSessions: prev.validSessions + (result.isValid ? 1 : 0)
    }));
  }, []);

  const onHoneypotDetected = useCallback((event: string) => {
    console.warn('Tower Builder honeypot detected:', event);
  }, []);

  // Set up game connection options
  const gameConnectionOptions = React.useMemo(() => ({
    gameId: 'tower-builder',
    gameVersion: '1.0.0',
    onSessionStart,
    onCheckpoint,
    onSessionEnd,
    onHoneypotDetected
  }), [onSessionStart, onCheckpoint, onSessionEnd, onHoneypotDetected]);

  const authData = React.useMemo(() => ({
    isAuthenticated: !!user && !isLoading,
    user: user,
  }), [user, isLoading]);

  // Use the enhanced game connection hook
  const gameConnection = useGameConnection(iframeRef, authData, gameConnectionOptions);

  // Handle game connection setup - just pass the ref
  const handleGameConnection = useCallback((iframeRef: React.RefObject<HTMLIFrameElement>) => {
    // The connection is already set up via the hook above
    return;
  }, []);

  // Show loading state
  if (loading || !gameConfig) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg">Loading game...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <GameLayout
      gameConfig={gameConfig}
      gameStats={gameStats || {
        gameId: 'tower-builder',
        totalPlayers: 0,
        totalSessions: 0,
        avgScore: 0,
        topScore: 0,
        recentSessions: []
      }}
      leaderboardData={leaderboardData || {
        leaderboard: [],
        totalCount: 0,
        hasMore: false
      }}
      loading={loading}
      iframeRef={iframeRef}
      onGameConnection={handleGameConnection}
    />
  );
}