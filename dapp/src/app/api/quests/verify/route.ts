import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { walletAddress, taskId, type, value } = await request.json();

    if (!walletAddress || !taskId || !type) {
      return NextResponse.json({ 
        error: 'Wallet address, task ID, and type are required' 
      }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { quest: true },
    });

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Check if task is already completed
    const existingCompletion = await prisma.userCompletedTask.findUnique({
      where: {
        userId_taskId: {
          userId: user.id,
          taskId: task.id,
        },
      },
    });

    if (existingCompletion) {
      return NextResponse.json({ 
        error: 'Task already completed',
        completed: true 
      }, { status: 400 });
    }

    // Verify task based on type
    let verificationResult = false;
    let updateData: any = {};

    switch (type) {
      case 'username':
        if (!value || typeof value !== 'string' || value.trim().length < 3) {
          return NextResponse.json({ 
            error: 'Username must be at least 3 characters long' 
          }, { status: 400 });
        }
        
        // Check if username already exists
        const existingUser = await prisma.user.findUnique({
          where: { username: value.trim() },
        });
        
        if (existingUser && existingUser.id !== user.id) {
          return NextResponse.json({ 
            error: 'Username already taken' 
          }, { status: 400 });
        }
        
        updateData.username = value.trim();
        verificationResult = true;
        break;

      case 'email':
        if (!value || !isValidEmail(value)) {
          return NextResponse.json({ 
            error: 'Valid email is required' 
          }, { status: 400 });
        }
        
        // Check if email already exists
        const existingEmail = await prisma.user.findUnique({
          where: { email: value },
        });
        
        if (existingEmail && existingEmail.id !== user.id) {
          return NextResponse.json({ 
            error: 'Email already registered' 
          }, { status: 400 });
        }
        
        updateData.email = value;
        verificationResult = true;
        break;

      case 'profilePicture':
        if (!value || typeof value !== 'string') {
          return NextResponse.json({ 
            error: 'Profile picture URL is required' 
          }, { status: 400 });
        }
        
        updateData.profilePictureUrl = value;
        verificationResult = true;
        break;

      case 'twitter_follow':
        // For now, we'll trust the frontend verification
        // In a real implementation, you'd call Twitter API to verify
        verificationResult = true;
        break;

      case 'twitter_like_rt':
        // For now, we'll trust the frontend verification
        // In a real implementation, you'd call Twitter API to verify
        verificationResult = true;
        break;

      case 'discord_join':
        // For now, we'll auto-verify Discord tasks
        // In a real implementation, you'd integrate with Discord API
        // If a value is provided, save it as discord username
        if (value && typeof value === 'string' && value.trim().length > 0) {
          updateData.discordUsername = value.trim();
        }
        verificationResult = true;
        break;

      case 'game_play':
        // This would be verified by the game system
        // For now, we'll trust the frontend
        verificationResult = true;
        break;

      case 'telegram_join':
        // For now, we'll auto-verify Telegram tasks
        // In a real implementation, you'd integrate with Telegram API
        // If a value is provided, save it as telegram username
        if (value && typeof value === 'string' && value.trim().length > 0) {
          updateData.telegramUsername = value.trim();
        }
        verificationResult = true;
        break;

      case 'auto_verify':
        // Some tasks can be auto-verified (like wallet connection)
        verificationResult = true;
        break;

      default:
        return NextResponse.json({ 
          error: 'Unknown verification type' 
        }, { status: 400 });
    }

    if (!verificationResult) {
      return NextResponse.json({ 
        error: 'Verification failed' 
      }, { status: 400 });
    }

    // Complete the task and update user data in a transaction
    const result = await prisma.$transaction([
      // Mark task as completed
      prisma.userCompletedTask.create({
        data: {
          userId: user.id,
          taskId: task.id,
        },
      }),
      // Update user data if needed
      ...(Object.keys(updateData).length > 0 ? [
        prisma.user.update({
          where: { id: user.id },
          data: updateData,
        })
      ] : []),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Task completed successfully',
      completed: true,
    });

  } catch (error) {
    console.error('Task verification error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
} 