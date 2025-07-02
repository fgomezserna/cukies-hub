import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper to check if two dates are on the same calendar day
const isSameDay = (d1: Date, d2: Date) =>
  d1.getFullYear() === d2.getFullYear() &&
  d1.getMonth() === d2.getMonth() &&
  d1.getDate() === d2.getDate();

// Helper to check if a date was yesterday
const isYesterday = (date: Date) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(date, yesterday);
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');

  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: {
        lastCheckIn: true,
        dailyCheckIns: {
          orderBy: { date: 'desc' },
          take: 7, // Get last 7 check-ins to calculate streak
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = new Date();
    let canClaim = true;
    let currentStreak = 0;

    // Check if user has already claimed today
    const todayCheckIn = user.dailyCheckIns.find(checkIn => 
      isSameDay(new Date(checkIn.date), today)
    );

    if (todayCheckIn) {
      canClaim = false;
    }

    // Calculate current streak
    if (user.lastCheckIn) {
      const lastCheckInDate = new Date(user.lastCheckIn.lastCheckIn);
      
      if (isSameDay(lastCheckInDate, today)) {
        // Already claimed today
        currentStreak = user.lastCheckIn.days;
        canClaim = false;
      } else if (isYesterday(lastCheckInDate)) {
        // Claimed yesterday, can claim today and continue streak
        currentStreak = user.lastCheckIn.days;
        canClaim = true;
      } else {
        // Streak broken, start fresh
        currentStreak = 0;
        canClaim = true;
      }
    } else {
      // No previous check-ins
      currentStreak = 0;
      canClaim = true;
    }

    // Reset streak after 7 days
    if (currentStreak >= 7) {
      currentStreak = 0;
    }

    return NextResponse.json({
      canClaim,
      currentStreak,
      hasClaimedToday: !canClaim && todayCheckIn !== undefined,
    });

  } catch (error) {
    console.error('Failed to fetch daily status:', error);
    return NextResponse.json({ error: 'Failed to fetch daily status' }, { status: 500 });
  }
} 