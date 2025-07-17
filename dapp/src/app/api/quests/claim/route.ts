import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { distributeReferralXp } from '@/lib/referrals';

export async function POST(request: Request) {
  try {
    const { walletAddress, questId } = await request.json();

    if (!walletAddress || !questId) {
      return NextResponse.json({ error: 'Wallet address and Quest ID are required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { completedQuests: true, completedTasks: true }
    });
    
    if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const quest = await prisma.quest.findUnique({
      where: { id: questId },
      include: { tasks: true },
    });

    if (!quest) {
        return NextResponse.json({ error: 'Quest not found' }, { status: 404 });
    }

    // Lock check
    if (!quest.isStarter) {
        const starterQuest = await prisma.quest.findFirst({ where: { isStarter: true } });
        if (starterQuest) {
            const hasCompletedStarter = user.completedQuests.some(cq => cq.questId === starterQuest.id);
            if (!hasCompletedStarter) {
                return NextResponse.json({ error: 'Complete the "Get Started" quest first to unlock others.' }, { status: 403 });
            }
        }
    }

    const isAlreadyClaimed = user.completedQuests.some(cq => cq.questId === quest.id);
    if (isAlreadyClaimed) {
      return NextResponse.json({ error: 'Quest already claimed' }, { status: 400 });
    }

    const userCompletedTaskIds = new Set(user.completedTasks.map(t => t.taskId));
    const questTaskIds = quest.tasks.map(t => t.id);
    
    const allTasksCompleted = questTaskIds.every(taskId => userCompletedTaskIds.has(taskId));

    if (!allTasksCompleted) {
      return NextResponse.json({ error: 'Not all tasks for this quest are completed' }, { status: 400 });
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
      // Register the point transaction
      prisma.pointTransaction.create({
        data: {
          userId: user.id,
          amount: quest.xp,
          type: 'QUEST_COMPLETION',
          reason: `Quest: ${quest.title}`,
          metadata: {
            questId: quest.id,
            questTitle: quest.title
          }
        }
      })
    ]);

    // Distribute referral XP after quest completion
    try {
      await distributeReferralXp(user.id, quest.xp);
    } catch (error) {
      console.error('Error distributing referral XP:', error);
      // Don't fail the quest claim if referral distribution fails
    }

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