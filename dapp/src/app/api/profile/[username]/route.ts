import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Find user by username
    const user = await prisma.user.findUnique({
      where: { username: username },
      select: {
        id: true,
        username: true,
        profilePictureUrl: true,
        bio: true,
        xp: true,
        createdAt: true,
        // Quest progress
        completedQuests: {
          include: {
            quest: {
              select: {
                id: true,
                title: true,
                xp: true,
              }
            }
          }
        },
        completedTasks: {
          include: {
            task: {
              select: {
                id: true,
                title: true,
              }
            }
          }
        },
        // Point transactions
        pointTransactions: {
          orderBy: {
            createdAt: 'desc'
          },
          take: 10,
          select: {
            id: true,
            amount: true,
            type: true,
            reason: true,
            createdAt: true,
          }
        },
        // Game stats
        gameSessions: {
          where: {
            endedAt: { not: null }
          },
          select: {
            gameId: true,
            startedAt: true,
            endedAt: true,
            result: {
              select: {
                finalScore: true,
                isValid: true,
              }
            }
          },
          orderBy: {
            endedAt: 'desc'
          },
          take: 20
        },
        // Referral stats
        referrals: {
          select: {
            id: true,
            username: true,
            createdAt: true,
          }
        },
        referralRewards: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Calculate stats
    const totalGamesPlayed = user.gameSessions.length;
    const gamesWon = user.gameSessions.filter(session => session.result?.isValid).length;
    const winRate = totalGamesPlayed > 0 ? Math.round((gamesWon / totalGamesPlayed) * 100) : 0;
    
    const scores = user.gameSessions
      .map(session => session.result?.finalScore)
      .filter(score => score !== null && score !== undefined) as number[];
    
    const avgScore = scores.length > 0 
      ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
      : 0;

    const highestScore = scores.length > 0 ? Math.max(...scores) : 0;

    // Get favorite game
    const gameStats = user.gameSessions.reduce((acc, session) => {
      acc[session.gameId] = (acc[session.gameId] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const favoriteGame = Object.entries(gameStats).sort(([,a], [,b]) => b - a)[0]?.[0] || 'N/A';

    // Calculate tier based on XP
    let tier = 'Bronze';
    if (user.xp >= 10000) tier = 'Diamond';
    else if (user.xp >= 5000) tier = 'Gold';
    else if (user.xp >= 2000) tier = 'Silver';

    const profile = {
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
      bio: user.bio,
      xp: user.xp,
      tier,
      joinedAt: user.createdAt,
      stats: {
        totalGamesPlayed,
        gamesWon,
        winRate: `${winRate}%`,
        avgScore,
        highestScore,
        favoriteGame,
        questsCompleted: user.completedQuests.length,
        tasksCompleted: user.completedTasks.length,
        totalReferrals: user.referrals.length,
        referralRewards: user.referralRewards,
      },
      recentActivity: user.gameSessions.slice(0, 5).map(session => ({
        gameId: session.gameId,
        score: session.result?.finalScore || 0,
        won: session.result?.isValid || false,
        date: session.endedAt,
      })),
      pointHistory: user.pointTransactions.slice(0, 5),
      achievements: {
        questsCompleted: user.completedQuests.map(cq => ({
          title: cq.quest.title,
          xp: cq.quest.xp,
        })),
        tasksCompleted: user.completedTasks.length,
      }
    };

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}