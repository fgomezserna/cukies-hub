import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  try {
    // Get users ordered by total points (xp + referralRewards)
    const users = await prisma.user.findMany({
      select: {
        id: true,
        walletAddress: true,
        username: true,
        profilePictureUrl: true,
        xp: true,
        referralRewards: true,
      },
      orderBy: [
        {
          xp: 'desc',
        },
        {
          referralRewards: 'desc',
        },
      ],
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const totalCount = await prisma.user.count();

    // Transform data to include ranking and total points
    const leaderboard = users.map((user, index) => ({
      rank: offset + index + 1,
      name: user.username || `Player ${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
      avatar: user.profilePictureUrl || "https://placehold.co/40x40.png",
      hint: user.username ? "user avatar" : "wallet avatar",
      points: user.xp,
      referralPoints: user.referralRewards,
      totalPoints: user.xp + user.referralRewards,
      walletAddress: user.walletAddress,
    }));

    return NextResponse.json({
      leaderboard,
      totalCount,
      hasMore: offset + limit < totalCount,
    });

  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
} 