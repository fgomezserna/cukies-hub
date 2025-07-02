import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update user XP and record transaction
    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: amount } },
      }),
      prisma.pointTransaction.create({
        data: {
          userId: user.id,
          amount: amount,
          type: 'DAILY_LOGIN',
          reason: 'Daily Drop',
          metadata: {
            source: 'daily_drop'
          }
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      xpGained: amount,
      newTotalXp: updatedUser.xp,
    });

  } catch (error) {
    console.error('Daily claim error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 