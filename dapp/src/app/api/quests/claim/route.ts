import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { walletAddress, questId } = await request.json();

    if (!walletAddress || !questId) {
      return NextResponse.json({ error: 'Wallet address and Quest ID are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { walletAddress } });
    const quest = await prisma.quest.findUnique({
      where: { id: questId },
      include: { tasks: true },
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!quest) return NextResponse.json({ error: 'Quest not found' }, { status: 404 });

    // Lock check
    const starterQuest = await prisma.quest.findFirst({
      where: { isStarter: true },
    });

    if (starterQuest && starterQuest.id !== quest.id) {
      const userHasCompletedStarterQuest = await prisma.userQuest.findUnique({
        where: {
          userId_questId: {
            userId: user.id,
            questId: starterQuest.id,
          },
        },
      });
      if (!userHasCompletedStarterQuest) {
        return NextResponse.json({ error: 'Complete the starter quest first' }, { status: 403 });
      }
    }

    const existingClaim = await prisma.userQuest.findUnique({
      where: { userId_questId: { userId: user.id, questId: quest.id } },
    });

    if (existingClaim) {
      return NextResponse.json({ error: 'Quest already claimed' }, { status: 400 });
    }

    const completedTasksCount = await prisma.userCompletedTask.count({
      where: {
        userId: user.id,
        task: { questId: quest.id },
      },
    });

    if (completedTasksCount < quest.tasks.length) {
      return NextResponse.json({ error: 'Not all tasks are completed' }, { status: 400 });
    }

    const [, updatedUser] = await prisma.$transaction([
      prisma.userQuest.create({
        data: {
          userId: user.id,
          questId: quest.id,
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: { xp: { increment: quest.xp } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      xpGained: quest.xp,
      newTotalXp: updatedUser.xp,
    });

  } catch (error) {
    console.error('Quest claim error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 