export interface GameRank {
  xp: number;
  name: string;
  icon: string; // Icon class name or emoji
  color?: string;
}

export interface PlayInstruction {
  icon: string;
  text: string;
}

export interface GameConfig {
  id: string;
  gameId: string;
  name: string;
  description: string;
  emoji?: string;
  gameUrl: string;
  port?: number;
  ranks: GameRank[];
  leaderboardTitle: string;
  playInstructions?: PlayInstruction[];
  isActive: boolean;
  isInMaintenance: boolean;
  version?: string;
  category?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GameStats {
  gameId: string;
  totalPlayers: number;
  totalSessions: number;
  avgScore: number;
  topScore: number;
  userStats?: {
    bestScore: number;
    sessionsCount: number;
    rank: number;
  };
  recentSessions: Array<{
    finalScore: number;
    gameTime: number;
    xpEarned: number;
    createdAt: string;
    user: {
      username: string;
      walletAddress: string;
    };
  }>;
}

export interface GameLayoutProps {
  gameConfig: GameConfig;
  gameStats: GameStats;
  leaderboardData: {
    leaderboard: Array<{
      walletAddress: string;
      name: string;
      avatar?: string;
      totalPoints: number;
    }>;
    totalCount: number;
    hasMore: boolean;
  };
  loading: boolean;
}