import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  const questId = params.id;

  console.log(`API trying to fetch quest with ID: ${questId}`);

  try {
    const quest = await prisma.quest.findUnique({
      where: { id: questId },
      include: { tasks: true },
    });

    if (!quest) {
      return NextResponse.json({ error: 'Quest not found' }, { status: 404 });
    }

    if (!walletAddress) {
      const tasks = quest.tasks.map(t => ({ ...t, isCompleted: false }));
      return NextResponse.json({ ...quest, tasks });
    }
    
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) {
      const tasks = quest.tasks.map(t => ({ ...t, isCompleted: false }));
      return NextResponse.json({ ...quest, tasks });
    }

    const completedUserTasks = await prisma.userCompletedTask.findMany({
      where: {
        userId: user.id,
        task: {
          questId: questId,
        },
      },
      select: {
        taskId: true,
      },
    });
    const completedTaskIds = new Set(completedUserTasks.map(t => t.taskId));

    const tasksWithCompletion = quest.tasks.map(task => ({
      ...task,
      isCompleted: completedTaskIds.has(task.id),
    }));

    const isClaimed = await prisma.userQuest.findUnique({
      where: {
        userId_questId: {
          userId: user.id,
          questId: quest.id,
        },
      },
    });

    // Determine if the quest should be locked
    let isLocked = false;
    const starterQuest = await prisma.quest.findFirst({
      where: { isStarter: true },
    });

    if (starterQuest && starterQuest.id !== quest.id && user) {
      const userHasCompletedStarterQuest = await prisma.userQuest.findUnique({
        where: {
          userId_questId: {
            userId: user.id,
            questId: starterQuest.id,
          },
        },
      });
      if (!userHasCompletedStarterQuest) {
        isLocked = true;
      }
    }

    return NextResponse.json({ ...quest, tasks: tasksWithCompletion, isClaimed: !!isClaimed, isLocked });

  } catch (error) {
    console.error(`Failed to fetch quest ${questId}:`, error);
    return NextResponse.json({ error: 'Failed to fetch quest' }, { status: 500 });
  }
} 