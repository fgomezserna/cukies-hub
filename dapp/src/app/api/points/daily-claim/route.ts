import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { distributeReferralXp } from '@/lib/referrals';

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

export async function POST(request: Request) {
  try {
    const { walletAddress, amount } = await request.json();

    if (!walletAddress || !amount || typeof amount !== 'number') {
      return NextResponse.json({ 
        error: 'Wallet address and amount are required' 
      }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: {
        lastCheckIn: true,
        dailyCheckIns: {
          orderBy: { date: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const today = new Date();

    // Check if user has already claimed today
    const todayCheckIn = user.dailyCheckIns.find(checkIn => 
      isSameDay(new Date(checkIn.date), today)
    );

    if (todayCheckIn) {
      return NextResponse.json({ 
        error: 'Daily drop already claimed today' 
      }, { status: 400 });
    }

    // Calculate new streak
    let newStreakDays = 1;
    if (user.lastCheckIn) {
      const lastCheckInDate = new Date(user.lastCheckIn.lastCheckIn);
      
      if (isYesterday(lastCheckInDate)) {
        // Continue streak
        newStreakDays = user.lastCheckIn.days + 1;
      }
      // If more than yesterday, streak resets to 1
    }

    // Reset streak after 7 days
    if (newStreakDays > 7) {
      newStreakDays = 1;
    }

    // Update user XP, record transaction, update streak, and record daily check-in
    const result = await prisma.$transaction([
      // Update user XP
      prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: amount } },
      }),
      // Record point transaction
      prisma.pointTransaction.create({
        data: {
          userId: user.id,
          amount: amount,
          type: 'DAILY_LOGIN',
          reason: 'Daily Drop',
          metadata: {
            source: 'daily_drop',
            streakDay: newStreakDays
          }
        }
      }),
      // Record daily check-in
      prisma.dailyCheckIn.create({
        data: {
          userId: user.id,
          xpGained: amount,
        }
      }),
      // Update or create streak record
      user.lastCheckIn 
        ? prisma.streak.update({
            where: { userId: user.id },
            data: {
              days: newStreakDays,
              lastCheckIn: today,
            }
          })
        : prisma.streak.create({
            data: {
              userId: user.id,
              days: newStreakDays,
              lastCheckIn: today,
            }
          })
    ]);

    const updatedUser = result[0];

    // Distribute referral XP after daily login
    try {
      await distributeReferralXp(user.id, amount);
    } catch (error) {
      console.error('Error distributing referral XP:', error);
      // Don't fail the daily claim if referral distribution fails
    }

    return NextResponse.json({
      success: true,
      xpGained: amount,
      newTotalXp: updatedUser.xp,
      newStreak: newStreakDays,
    });

  } catch (error) {
    console.error('Daily claim error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 