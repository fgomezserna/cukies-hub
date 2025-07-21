'use client';

import { useState, useEffect } from 'react';
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
}

export function useGameData(gameId: string): UseGameDataResult {
  const { user } = useAuth();
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchGameData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all data in parallel
        const [configResponse, statsResponse, leaderboardResponse] = await Promise.all([
          // 1. Fetch game configuration
          fetch(`/api/games/config?gameId=${gameId}`),
          
          // 2. Fetch game statistics
          fetch(`/api/games/stats?gameId=${gameId}${user?.id ? `&userId=${user.id}` : ''}`),
          
          // 3. Fetch leaderboard data
          fetch(`/api/leaderboard?gameId=${gameId}&period=all-time&limit=10`)
        ]);

        // Process game configuration
        if (configResponse.ok) {
          const configData = await configResponse.json();
          setGameConfig(configData);
        } else {
          throw new Error('Failed to fetch game configuration');
        }

        // Process game statistics
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          setGameStats(statsData);
        } else {
          console.warn('Failed to fetch game stats - using defaults');
          // Set default stats if API fails
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
          // Set default leaderboard if API fails
          setLeaderboardData({
            leaderboard: [],
            totalCount: 0,
            hasMore: false,
            gameId,
            period: 'all-time'
          });
        }

      } catch (err) {
        console.error('Error fetching game data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load game data');
      } finally {
        setLoading(false);
      }
    };

    if (gameId) {
      fetchGameData();
    }
  }, [gameId, user?.id]);

  return {
    gameConfig,
    gameStats,
    leaderboardData,
    loading,
    error
  };
}