'use client';

import React, { useCallback, useRef } from 'react';
import { useParentConnection } from '@/hooks/use-parent-connection';
import { useAuth } from '@/providers/auth-provider';
import { useGameData } from '@/hooks/use-game-data';
import GameLayout from '@/components/layout/GameLayout';

export default function HyppieRoadPage() {
  const { user, isLoading } = useAuth();
  const { gameConfig, gameStats, leaderboardData, loading, error } = useGameData('hyppie-road');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Use the parent connection hook directly
  useParentConnection(iframeRef, {
    isAuthenticated: !!user && !isLoading,
    user: user,
  });

  // Handle game connection setup - no-op since connection is already set up
  const handleGameConnection = useCallback((iframeRef: React.RefObject<HTMLIFrameElement>) => {
    // Connection is already handled by useParentConnection hook above
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
      onGameConnection={handleGameConnection}
    />
  );
}