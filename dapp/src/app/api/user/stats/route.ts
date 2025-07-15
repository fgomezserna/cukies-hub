import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUserTier } from '@/lib/tiers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');

  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
  }

  try {
    // Get user data
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        xp: true,
        referralRewards: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get total number of users for ranking calculation
    const totalUsers = await prisma.user.count();

    // Get user ranking based on total points (xp + referralRewards)
    const totalPoints = user.xp + user.referralRewards;
    const usersAbove = await prisma.user.count({
      where: {
        xp: {
          gt: user.xp,
        },
      },
    });

    const ranking = usersAbove + 1;

    // Calculate tier
    const tier = getUserTier(user.xp);

    // Calculate position change (mock for now - could track historical rankings)
    const positionChange = Math.floor(Math.random() * 20) - 10; // Random between -10 and +10

    return NextResponse.json({
      user: {
        id: user.id,
        walletAddress: user.walletAddress,
        username: user.username,
        xp: user.xp,
        referralPoints: user.referralRewards,
        totalPoints,
      },
      stats: {
        tier: tier.name,
        tierColor: tier.color,
        ranking,
        positionChange,
        totalUsers,
      },
    });

  } catch (error) {
    console.error('Failed to fetch user stats:', error);
    return NextResponse.json({ error: 'Failed to fetch user stats' }, { status: 500 });
  }
} 