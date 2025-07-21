import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  const gameId = searchParams.get('gameId');
  const period = searchParams.get('period') || 'all-time'; // all-time, month, week, day

  try {
    // If gameId is provided, use game-specific leaderboard
    if (gameId) {
      return await getGameSpecificLeaderboard(gameId, period, limit, offset);
    }

    // Otherwise, use general leaderboard based on GameResult aggregation
    return await getGeneralGameResultsLeaderboard(period, limit, offset);

  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}

async function getGameSpecificLeaderboard(gameId: string, period: string, limit: number, offset: number) {
  // Calculate date range based on period
  const now = new Date();
  let dateFilter: Date | undefined;
  
  switch (period) {
    case 'day':
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'all-time':
    default:
      dateFilter = undefined;
      break;
  }

  // Get best scores for the game within the time period
  const gameResults = await prisma.gameResult.findMany({
    where: {
      gameId,
      ...(dateFilter && { createdAt: { gte: dateFilter } }),
    },
    select: {
      userId: true,
      finalScore: true,
      gameTime: true,
      xpEarned: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          walletAddress: true,
          username: true,
          profilePictureUrl: true,
        },
      },
    },
    orderBy: {
      finalScore: 'desc',
    },
  });

  // Group by user and get their best score
  const userBestScores = new Map();
  gameResults.forEach(result => {
    const userId = result.userId;
    if (!userBestScores.has(userId) || result.finalScore > userBestScores.get(userId).finalScore) {
      userBestScores.set(userId, result);
    }
  });

  // Convert to array and sort by score
  const sortedResults = Array.from(userBestScores.values())
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(offset, offset + limit);

  // Get total count for pagination
  const totalCount = userBestScores.size;

  // Transform data to leaderboard format
  const leaderboard = sortedResults.map((result, index) => ({
    rank: offset + index + 1,
    name: result.user.username || `Player ${result.user.walletAddress.slice(0, 6)}...${result.user.walletAddress.slice(-4)}`,
    avatar: result.user.profilePictureUrl || "https://placehold.co/40x40.png",
    hint: result.user.username ? "user avatar" : "wallet avatar",
    points: result.finalScore,
    referralPoints: 0, // Not applicable for game-specific leaderboards
    totalPoints: result.finalScore,
    walletAddress: result.user.walletAddress,
    gameTime: result.gameTime,
    xpEarned: result.xpEarned,
    playedAt: result.createdAt,
  }));

  return NextResponse.json({
    leaderboard,
    totalCount,
    hasMore: offset + limit < totalCount,
    gameId,
    period,
  });
}

async function getGeneralGameResultsLeaderboard(period: string, limit: number, offset: number) {
  // Calculate date range based on period
  const now = new Date();
  let dateFilter: Date | undefined;
  
  switch (period) {
    case 'day':
      dateFilter = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case 'week':
      dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case 'month':
      dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case 'all-time':
    default:
      dateFilter = undefined;
      break;
  }

  // Get all game results within the time period
  const gameResults = await prisma.gameResult.findMany({
    where: {
      ...(dateFilter && { createdAt: { gte: dateFilter } }),
    },
    select: {
      userId: true,
      finalScore: true,
      gameTime: true,
      xpEarned: true,
      createdAt: true,
      gameId: true,
      user: {
        select: {
          id: true,
          walletAddress: true,
          username: true,
          profilePictureUrl: true,
        },
      },
    },
    orderBy: {
      finalScore: 'desc',
    },
  });

  // Aggregate scores by user (sum all game results)
  const userAggregatedScores = new Map();
  gameResults.forEach(result => {
    const userId = result.userId;
    if (!userAggregatedScores.has(userId)) {
      userAggregatedScores.set(userId, {
        user: result.user,
        totalScore: 0,
        totalXpEarned: 0,
        gamesPlayed: 0,
        bestScore: 0,
        lastPlayedAt: result.createdAt,
      });
    }
    
    const userStats = userAggregatedScores.get(userId);
    userStats.totalScore += result.finalScore;
    userStats.totalXpEarned += result.xpEarned;
    userStats.gamesPlayed += 1;
    userStats.bestScore = Math.max(userStats.bestScore, result.finalScore);
    
    if (result.createdAt > userStats.lastPlayedAt) {
      userStats.lastPlayedAt = result.createdAt;
    }
  });

  // Convert to array and sort by total score
  const sortedResults = Array.from(userAggregatedScores.values())
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(offset, offset + limit);

  // Get total count for pagination
  const totalCount = userAggregatedScores.size;

  // Transform data to leaderboard format
  const leaderboard = sortedResults.map((result, index) => ({
    rank: offset + index + 1,
    name: result.user.username || `Player ${result.user.walletAddress.slice(0, 6)}...${result.user.walletAddress.slice(-4)}`,
    avatar: result.user.profilePictureUrl || "https://placehold.co/40x40.png",
    hint: result.user.username ? "user avatar" : "wallet avatar",
    points: result.totalScore,
    referralPoints: result.totalXpEarned, // Using XP earned as secondary metric
    totalPoints: result.totalScore + result.totalXpEarned,
    walletAddress: result.user.walletAddress,
    gamesPlayed: result.gamesPlayed,
    bestScore: result.bestScore,
    lastPlayedAt: result.lastPlayedAt,
  }));

  return NextResponse.json({
    leaderboard,
    totalCount,
    hasMore: offset + limit < totalCount,
    period,
  });
} 