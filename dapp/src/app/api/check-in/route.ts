import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startOfDay, isYesterday } from 'date-fns';

const XP_REWARDS = [10, 20, 35, 50, 65, 80, 100]; // 7 days streak rewards

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { lastCheckIn: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = startOfDay(new Date());
    const lastCheckInDate = user.lastCheckIn ? startOfDay(new Date(user.lastCheckIn.lastCheckIn)) : null;

    if (lastCheckInDate && lastCheckInDate.getTime() === today.getTime()) {
      return NextResponse.json({ error: 'Already checked in today' }, { status: 400 });
    }

    let currentStreak = 1;
    if (user.lastCheckIn && lastCheckInDate && isYesterday(lastCheckInDate)) {
      currentStreak = user.lastCheckIn.days === 7 ? 1 : user.lastCheckIn.days + 1;
    }
    
    const xpGained = XP_REWARDS[currentStreak - 1];

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: xpGained } },
      }),
      prisma.dailyCheckIn.create({
        data: {
          userId: user.id,
          xpGained: xpGained,
        },
      }),
      prisma.streak.upsert({
        where: { userId: user.id },
        update: {
          days: currentStreak,
          lastCheckIn: new Date(),
        },
        create: {
          userId: user.id,
          days: currentStreak,
          lastCheckIn: new Date(),
        },
      }),
    ]);
    
    return NextResponse.json({
      success: true,
      xpGained,
      currentStreak,
    });

  } catch (error) {
    console.error('Check-in API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 