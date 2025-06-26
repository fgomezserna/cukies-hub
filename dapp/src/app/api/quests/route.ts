import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    if (!walletAddress) {
      return NextResponse.json(quests);
    }

    const [user, userCompletedTasks] = await Promise.all([
      prisma.user.findUnique({
        where: { walletAddress },
        include: { completedQuests: true },
      }),
      prisma.userCompletedTask.findMany({
        where: { user: { walletAddress } },
        select: { taskId: true },
      }),
    ]);

    if (!user) {
      // Return public quest data if user not found
      return NextResponse.json(quests.map(q => ({...q, completedTasksCount: 0, isCompleted: false})));
    }

    const completedTaskIds = new Set(userCompletedTasks.map(uct => uct.taskId));

    const starterQuest = quests.find(q => q.isStarter);
    const userHasCompletedStarterQuest = starterQuest 
      ? user.completedQuests.some(cq => cq.questId === starterQuest.id)
      : true;

    const questsWithUserData = quests.map(quest => {
        const isQuestCompleted = user.completedQuests.some(cq => cq.questId === quest.id);
        const completedTasksCount = quest.tasks.filter(task => completedTaskIds.has(task.id)).length;
        const isLocked = !!starterQuest && quest.id !== starterQuest.id && !userHasCompletedStarterQuest;
        
        return {
            ...quest,
            isCompleted: isQuestCompleted,
            completedTasksCount,
            isLocked,
        }
    })

    return NextResponse.json(questsWithUserData);
  } catch (error) {
    console.error('Failed to fetch quests:', error);
    return NextResponse.json({ error: 'Failed to fetch quests' }, { status: 500 });
  }
} 