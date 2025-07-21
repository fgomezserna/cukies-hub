import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const gameId = searchParams.get('gameId');
  const userId = searchParams.get('userId');

  try {
    if (gameId) {
      // Get stats for a specific game
      return await getGameStats(gameId, userId);
    } else {
      // Get overall platform stats
      return await getPlatformStats(userId);
    }
  } catch (error) {
    console.error('Failed to fetch game stats:', error);
    return NextResponse.json({ error: 'Failed to fetch game stats' }, { status: 500 });
  }
}

async function getGameStats(gameId: string, userId?: string | null) {
  // Get game statistics
  const [
    totalPlayers,
    totalSessions,
    avgScore,
    topScore,
    userBestScore,
    userSessionsCount,
    userRank,
    recentSessions
  ] = await Promise.all([
    // Total unique players for this game
    prisma.gameResult.findMany({
      where: { gameId },
      distinct: ['userId'],
      select: { userId: true }
    }).then(results => results.length),

    // Total sessions for this game
    prisma.gameResult.count({
      where: { gameId }
    }),

    // Average score for this game
    prisma.gameResult.aggregate({
      where: { gameId },
      _avg: { finalScore: true }
    }).then(result => result._avg.finalScore || 0),

    // Top score for this game
    prisma.gameResult.aggregate({
      where: { gameId },
      _max: { finalScore: true }
    }).then(result => result._max.finalScore || 0),

    // User's best score (if userId provided)
    userId ? prisma.gameResult.aggregate({
      where: { gameId, userId },
      _max: { finalScore: true }
    }).then(result => result._max.finalScore || 0) : null,

    // User's session count (if userId provided)
    userId ? prisma.gameResult.count({
      where: { gameId, userId }
    }) : null,

    // User's rank in this game (if userId provided)
    userId ? getUserRankInGame(gameId, userId) : null,

    // Recent sessions (last 10)
    prisma.gameResult.findMany({
      where: { gameId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        finalScore: true,
        gameTime: true,
        xpEarned: true,
        createdAt: true,
        user: {
          select: {
            username: true,
            walletAddress: true
          }
        }
      }
    })
  ]);

  return NextResponse.json({
    gameId,
    totalPlayers,
    totalSessions,
    avgScore: Math.round(avgScore),
    topScore,
    userStats: userId ? {
      bestScore: userBestScore,
      sessionsCount: userSessionsCount,
      rank: userRank
    } : null,
    recentSessions
  });
}

async function getPlatformStats(userId?: string | null) {
  // Get platform-wide statistics
  const [
    totalUsers,
    totalSessions,
    totalXpDistributed,
    gameStats,
    userStats
  ] = await Promise.all([
    // Total registered users
    prisma.user.count(),

    // Total game sessions across all games
    prisma.gameResult.count(),

    // Total XP distributed
    prisma.gameResult.aggregate({
      _sum: { xpEarned: true }
    }).then(result => result._sum.xpEarned || 0),

    // Per-game statistics
    getPerGameStats(),

    // User's overall stats (if userId provided)
    userId ? getUserOverallStats(userId) : null
  ]);

  return NextResponse.json({
    totalUsers,
    totalSessions,
    totalXpDistributed,
    gameStats,
    userStats
  });
}

async function getPerGameStats() {
  const games = ['sybil-slayer', 'hyppie-road'];
  const gameStats = await Promise.all(
    games.map(async (gameId) => {
      const [totalPlayers, totalSessions, avgScore, topScore] = await Promise.all([
        prisma.gameResult.findMany({
          where: { gameId },
          distinct: ['userId'],
          select: { userId: true }
        }).then(results => results.length),

        prisma.gameResult.count({
          where: { gameId }
        }),

        prisma.gameResult.aggregate({
          where: { gameId },
          _avg: { finalScore: true }
        }).then(result => result._avg.finalScore || 0),

        prisma.gameResult.aggregate({
          where: { gameId },
          _max: { finalScore: true }
        }).then(result => result._max.finalScore || 0)
      ]);

      return {
        gameId,
        totalPlayers,
        totalSessions,
        avgScore: Math.round(avgScore),
        topScore
      };
    })
  );

  return gameStats;
}

async function getUserOverallStats(userId: string) {
  const [userInfo, gameResults] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        xp: true,
        referralRewards: true
      }
    }),

    prisma.gameResult.findMany({
      where: { userId },
      select: {
        gameId: true,
        finalScore: true,
        xpEarned: true,
        gameTime: true,
        createdAt: true
      }
    })
  ]);

  // Calculate user's rank based on XP
  const userRank = await prisma.user.count({
    where: {
      xp: {
        gt: userInfo?.xp || 0
      }
    }
  }) + 1;

  // Group results by game
  const gameResultsMap: Record<string, any> = {};
  gameResultsMap['sybil-slayer'] = { bestScore: 0, sessionsCount: 0, totalXp: 0 };
  gameResultsMap['hyppie-road'] = { bestScore: 0, sessionsCount: 0, totalXp: 0 };

  gameResults.forEach((result: any) => {
    if (!gameResultsMap[result.gameId]) {
      gameResultsMap[result.gameId] = { bestScore: 0, sessionsCount: 0, totalXp: 0 };
    }
    
    gameResultsMap[result.gameId].bestScore = Math.max(gameResultsMap[result.gameId].bestScore, result.finalScore);
    gameResultsMap[result.gameId].sessionsCount += 1;
    gameResultsMap[result.gameId].totalXp += result.xpEarned;
  });

  return {
    totalXp: userInfo?.xp || 0,
    referralRewards: userInfo?.referralRewards || 0,
    rank: userRank,
    totalSessions: gameResults.length,
    gameResults: gameResultsMap
  };
}

async function getUserRankInGame(gameId: string, userId: string) {
  // Get user's best score in this game
  const userBestScore = await prisma.gameResult.aggregate({
    where: { gameId, userId },
    _max: { finalScore: true }
  }).then(result => result._max.finalScore || 0);

  // Count how many users have a better score
  const betterScoresCount = await prisma.gameResult.groupBy({
    by: ['userId'],
    where: { gameId },
    _max: { finalScore: true },
    having: {
      finalScore: {
        _max: {
          gt: userBestScore
        }
      }
    }
  }).then(results => results.length);

  return betterScoresCount + 1;
}