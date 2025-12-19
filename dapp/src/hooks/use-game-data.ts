'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { GameConfig, GameStats } from '@/types/game';
import { LeaderboardPlayer } from '@/types';

interface LeaderboardResponse {
  leaderboard: LeaderboardPlayer[];
  totalCount: number;
  hasMore: boolean;
  gameId?: string;
  period?: string;
}

export interface UseGameDataResult {
  gameConfig: GameConfig | null;
  gameStats: GameStats | null;
  leaderboardData: LeaderboardResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGameData(gameId: string): UseGameDataResult {
  const { user } = useAuth();
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGameData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Fetch critical game configuration first (fastest load)
      const configResponse = await fetch(`/api/games/config?gameId=${gameId}`);
      
      if (configResponse.ok) {
        const configData = await configResponse.json();
        setGameConfig(configData);
        
        // Critical data loaded - can show game layout now
        setLoading(false);
        
        // Step 2: Fetch non-critical data in parallel (background loading)
        const [statsResponse, leaderboardResponse] = await Promise.all([
          fetch(`/api/games/stats?gameId=${gameId}${user?.id ? `&userId=${user.id}` : ''}`),
          fetch(`/api/leaderboard?gameId=${gameId}&period=all-time&limit=10`)
        ]);

        // Process game statistics
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setGameStats(statsData);
        } else {
          console.warn('Failed to fetch game stats - using defaults');
          setGameStats({
            gameId,
            totalPlayers: 0,
            totalSessions: 0,
            avgScore: 0,
            topScore: 0,
            recentSessions: []
          });
        }

        // Process leaderboard data
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          setLeaderboardData(leaderboardData);
        } else {
          console.warn('Failed to fetch leaderboard - using defaults');
          setLeaderboardData({
            leaderboard: [],
            totalCount: 0,
            hasMore: false,
            gameId,
            period: 'all-time'
          });
        }
      } else {
        throw new Error('Failed to fetch game configuration');
      }

    } catch (err) {
      console.error('Error fetching game data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load game data');
      setLoading(false);
    }
  }, [gameId, user?.id]);

  useEffect(() => {
    if (gameId) {
      fetchGameData();
    }
  }, [gameId, fetchGameData]);

  // Function to refetch stats and leaderboard (not config, as it doesn't change)
  const refetch = useCallback(async () => {
    if (!gameId) return;
    
    try {
      // Only refetch stats and leaderboard, not config
      const [statsResponse, leaderboardResponse] = await Promise.all([
        fetch(`/api/games/stats?gameId=${gameId}${user?.id ? `&userId=${user.id}` : ''}`),
        fetch(`/api/leaderboard?gameId=${gameId}&period=all-time&limit=10`)
      ]);

      // Process game statistics
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setGameStats(statsData);
        console.log('✅ [useGameData] Game stats refreshed:', statsData);
      } else {
        console.warn('Failed to refresh game stats');
      }

      // Process leaderboard data
      if (leaderboardResponse.ok) {
        const leaderboardData = await leaderboardResponse.json();
        setLeaderboardData(leaderboardData);
        console.log('✅ [useGameData] Leaderboard refreshed');
      } else {
        console.warn('Failed to refresh leaderboard');
      }
    } catch (err) {
      console.error('Error refetching game data:', err);
    }
  }, [gameId, user?.id]);

  return {
    gameConfig,
    gameStats,
    leaderboardData,
    loading,
    error,
    refetch
  };
}