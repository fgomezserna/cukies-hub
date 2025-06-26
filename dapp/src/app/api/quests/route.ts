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
      return NextResponse.json(quests.map(q => ({
        ...q,
        tasks: q.tasks.map(t => ({...t, completed: false})),
        isCompleted: false,
        isLocked: !!q.isStarter, // Lock non-starter quests initially
      })));
    }

    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: { 
        completedQuests: true,
        completedTasks: true,
      },
    });

    if (!user) {
      // Return public quest data if user not found for some reason
      return NextResponse.json(quests.map(q => ({
        ...q,
        tasks: q.tasks.map(t => ({...t, completed: false})),
        isCompleted: false,
        isLocked: !q.isStarter,
      })));
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

    return NextResponse.json(questsWithUserData);
  } catch (error) {
    console.error('Failed to fetch quests:', error);
    return NextResponse.json({ error: 'Failed to fetch quests' }, { status: 500 });
  }
} 