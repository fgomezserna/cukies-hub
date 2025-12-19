'use client';

import React, { useRef, useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useGameData } from '@/hooks/use-game-data';
import { useGameConnection } from '@/hooks/use-game-connection';
import GameLayout from '@/components/layout/GameLayout';
import GameLoadingSkeleton from '@/components/ui/game-loading-skeleton';

export default function HyppieRoadPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error, refetch } = useGameData('hyppie-road');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Game connection callbacks
  const onSessionStart = useCallback((sessionData: { sessionToken: string; sessionId: string }) => {
    console.log('🚀 [HYPPIE ROAD] Session started:', sessionData);
  }, []);

  const onCheckpoint = useCallback((checkpoint: any) => {
    console.log('📍 [HYPPIE ROAD] Checkpoint received:', checkpoint);
  }, []);

  const onSessionEnd = useCallback(async (result: { finalScore: number; isValid: boolean }) => {
    console.log('🏁 [HYPPIE ROAD] Session ended:', result);
    // Refresh game stats to get updated best score from database
    if (result.isValid) {
      console.log('🔄 [HYPPIE ROAD] Refreshing game stats after session end...');
      await refetch();
    }
  }, [refetch]);

  // Use game connection - same as other games
  const gameConnection = useGameConnection(
    iframeRef,
    {
      isAuthenticated: !!user && !isLoading,
      user: user
    },
    {
      gameId: 'hyppie-road',
      gameVersion: '1.0.0',
      onSessionStart,
      onCheckpoint,
      onSessionEnd
    }
  );

  // Show loading state
  if (loading || !gameConfig) {
    return <GameLoadingSkeleton message="Loading Hyppie Road..." />;
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
        gameId: 'hyppie-road',
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
    />
  );
}