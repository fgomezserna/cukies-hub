import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireWalletSession } from '@/lib/wallet-auth';

const PRIVATE_NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

async function getPersonalizationSession(walletAddress: string | null) {
  if (!walletAddress || walletAddress.length > 80) return null;

  try {
    return await requireWalletSession(walletAddress);
  } catch {
    return null;
  }
}

function publicQuests<
  TQuest extends { isStarter: boolean | null; tasks: readonly Record<string, unknown>[] },
>(quests: readonly TQuest[]) {
  return quests.map((quest) => ({
    ...quest,
    tasks: quest.tasks.map((task) => ({ ...task, completed: false })),
    isCompleted: false,
    // Preserve the existing anonymous response contract; this security change
    // only removes cross-wallet personalization.
    isLocked: Boolean(quest.isStarter),
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');

  try {
    const quests = await prisma.quest.findMany({
      include: {
        tasks: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    const walletSession = await getPersonalizationSession(walletAddress);
    if (!walletSession) {
      return NextResponse.json(publicQuests(quests), {
        headers: walletAddress ? PRIVATE_NO_STORE : undefined,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: walletSession.userId },
      include: { 
        completedQuests: true,
        completedTasks: true,
      },
    });

    if (!user) {
      return NextResponse.json(publicQuests(quests), { headers: PRIVATE_NO_STORE });
    }
    
    const completedTaskIds = new Set(user.completedTasks.map(uct => uct.taskId));
    
    const starterQuest = quests.find(q => q.isStarter);
    const userHasCompletedStarterQuest = starterQuest 
      ? user.completedQuests.some(cq => cq.questId === starterQuest.id)
      : true;

    const questsWithUserData = quests.map(quest => {
        const isQuestCompleted = user.completedQuests.some(cq => cq.questId === quest.id);
        const isLocked = !!starterQuest && !quest.isStarter && !userHasCompletedStarterQuest;
        
        const tasksWithStatus = quest.tasks.map(task => ({
            ...task,
            completed: completedTaskIds.has(task.id),
        }));

        return {
            ...quest,
            tasks: tasksWithStatus,
            isCompleted: isQuestCompleted,
            isLocked,
        }
    })

    return NextResponse.json(questsWithUserData, { headers: PRIVATE_NO_STORE });
  } catch (error) {
    console.error('Failed to fetch quests:', error);
    return NextResponse.json({ error: 'Failed to fetch quests' }, { status: 500 });
  }
}
