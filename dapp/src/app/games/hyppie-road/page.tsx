'use client';

import React, { useRef } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { useGameData } from '@/hooks/use-game-data';
import { useGameConnection } from '@/hooks/use-game-connection';
import GameLayout from '@/components/layout/GameLayout';
import GameLoadingSkeleton from '@/components/ui/game-loading-skeleton';

export default function HyppieRoadPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error } = useGameData('hyppie-road');
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      onSessionStart: (sessionData) => {
        console.log('🚀 [HYPPIE ROAD] Session started:', sessionData);
      },
      onCheckpoint: (checkpoint) => {
        console.log('📍 [HYPPIE ROAD] Checkpoint received:', checkpoint);
      },
      onSessionEnd: (result) => {
        console.log('🏁 [HYPPIE ROAD] Session ended:', result);
      }
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