import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// This is the identifier for the "Set a username" task from our seed script.
const SET_USERNAME_TASK_API_ID = '/api/tasks/validate/username';

export async function PATCH(request: Request) {
  try {
    const { walletAddress, username } = await request.json();

    if (!walletAddress || !username) {
      return NextResponse.json({ error: 'Wallet address and username are required' }, { status: 400 });
    }

    if (username.length < 3) {
        return NextResponse.json({ error: 'Username must be at least 3 characters long' }, { status: 400 });
    }

    // Check if username is already taken by another user
    const existingUser = await prisma.user.findFirst({
        where: { 
            username: { equals: username, mode: 'insensitive' },
            NOT: { walletAddress: walletAddress }
        }
    });

    if (existingUser) {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }

    const updatedUser = await prisma.user.update({
      where: { walletAddress },
      data: { username },
    });

    // After updating username, check if this completes the specific task
    const usernameTask = await prisma.task.findFirst({
        where: { validationApiEndpoint: SET_USERNAME_TASK_API_ID }
    });

    if (usernameTask) {
        // Use upsert to avoid creating duplicate completion records
        await prisma.userCompletedTask.upsert({
            where: {
                userId_taskId: {
                    userId: updatedUser.id,
                    taskId: usernameTask.id
                }
            },
            create: {
                userId: updatedUser.id,
                taskId: usernameTask.id,
            },
            update: {} // Do nothing if it already exists
        });
    }

    return NextResponse.json(updatedUser);

  } catch (error) {
    console.error('Profile update error:', error);
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        return NextResponse.json({ error: 'Username is already taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 