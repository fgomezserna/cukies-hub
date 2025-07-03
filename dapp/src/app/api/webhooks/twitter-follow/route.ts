import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/*
Webhook endpoint called by IFTTT when a user follows the official X/Twitter account.
Expected JSON payload:
{
  "handle": "username",   // Twitter handle without @
  "secret": "shared_secret" // Pre-shared secret for validation
}
*/
export async function POST(request: Request) {
  try {
    const { handle, secret } = await request.json();

    // Basic validation
    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    if (secret !== process.env.IFTTT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    const normalizedHandle = handle.trim().replace(/^@/, '').toLowerCase();

    // Find the user by twitterHandle
    const user = await prisma.user.findFirst({
      where: {
        twitterHandle: normalizedHandle,
      },
    });

    if (!user) {
      return NextResponse.json({ error: `User with handle ${normalizedHandle} not found` }, { status: 404 });
    }

    // Find the "Follow us on X" task (validationApiEndpoint ends with twitter-follow)
    const task = await prisma.task.findFirst({
      where: {
        validationApiEndpoint: {
          endsWith: 'twitter-follow',
        },
      },
    });

    if (!task) {
      return NextResponse.json({ error: 'Follow task not found' }, { status: 500 });
    }

    // Check if already completed
    const existingCompletion = await prisma.userCompletedTask.findUnique({
      where: {
        userId_taskId: {
          userId: user.id,
          taskId: task.id,
        },
      },
    });

    if (existingCompletion) {
      return NextResponse.json({ success: true, alreadyCompleted: true });
    }

    // Mark as completed and optionally store twitterHandle (already saved during connect)
    await prisma.userCompletedTask.create({
      data: {
        userId: user.id,
        taskId: task.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Twitter follow webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 