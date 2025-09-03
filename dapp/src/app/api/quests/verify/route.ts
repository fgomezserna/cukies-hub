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
        // Check if user already has a custom username (not their wallet address)
        const hasCustomUsername = user.username && user.username !== user.walletAddress;
        
        // If user already has a custom username and they're trying to verify it
        if (hasCustomUsername && value === user.username) {
          // Just mark the task as completed, no need to update anything
          verificationResult = true;
          break;
        }
        
        // If user already has a custom username but trying to set a different one
        if (hasCustomUsername && value !== user.username) {
          return NextResponse.json({ 
            error: 'Username can only be set once and cannot be modified' 
          }, { status: 400 });
        }

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
        // Note: isUsernameSet is inferred from username existence for compatibility
        verificationResult = true;
        break;

      case 'email':
        // If user already has an email and they're trying to verify it
        if (user.email && value === user.email) {
          // Just mark the task as completed, no need to update anything
          verificationResult = true;
          break;
        }

        if (!value || !isValidEmail(value)) {
          return NextResponse.json({ 
            error: 'Valid email is required' 
          }, { status: 400 });
        }
        
        // Check if email already exists
        const existingEmail = await prisma.user.findFirst({
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
        // If user already has a profile picture and they're trying to verify it
        if (user.profilePictureUrl && value === user.profilePictureUrl) {
          // Just mark the task as completed, no need to update anything
          verificationResult = true;
          break;
        }

        if (!value || typeof value !== 'string') {
          return NextResponse.json({ 
            error: 'Profile picture URL is required' 
          }, { status: 400 });
        }
        
        updateData.profilePictureUrl = value;
        verificationResult = true;
        break;

      case 'discord_connect':
        // For Discord connection, we just link the user's Discord account
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return NextResponse.json({ 
            error: 'Discord username is required.' 
          }, { status: 400 });
        }
        
        // Store the Discord username (already verified via OAuth)
        updateData.discordUsername = value.trim();
        verificationResult = true;
        break;

      case 'discord_join':
        // For Discord server join, verify membership without OAuth
        const membershipResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/discord/verify-membership`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ walletAddress }),
        });

        if (!membershipResponse.ok) {
          const membershipData = await membershipResponse.json();
          return NextResponse.json({ 
            error: membershipData.error,
            requiresConnection: membershipData.requiresConnection,
            requiresReconnection: membershipData.requiresReconnection,
            requiresJoin: membershipData.requiresJoin,
          }, { status: membershipResponse.status });
        }

        verificationResult = true;
        break;

      case 'twitter_connect':
        // For Twitter connect, we just link the user's Twitter account  
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return NextResponse.json({ 
            error: 'Twitter username is required.' 
          }, { status: 400 });
        }
        
        // Store the Twitter handle (already verified via OAuth)
        updateData.twitterHandle = value.trim().replace(/^@/, '');
        verificationResult = true;
        break;

      case 'twitter_follow':
        // For Twitter follow, we verify the user is following us by checking the TwitterFollower collection
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return NextResponse.json({ 
            error: 'Twitter username is required.' 
          }, { status: 400 });
        }
        
        const twitterUsername = value.trim().replace(/^@/, '').toLowerCase();
        
        // Check if this user is in our followers collection
        const follower = await prisma.twitterFollower.findUnique({
          where: {
            twitterUsername: twitterUsername
          }
        });
        
        if (!follower) {
          return NextResponse.json({ 
            error: 'You are not following us on X/Twitter. Please follow us first and try again.' 
          }, { status: 403 });
        }
        
        // Store the Twitter handle and mark as verified
        updateData.twitterHandle = twitterUsername;
        verificationResult = true;
        break;

      case 'twitter_like_rt':
        // For now, we'll trust the frontend verification
        // In a real implementation, you'd call Twitter API to verify
        verificationResult = true;
        break;

      case 'game_play':
        // This would be verified by the game system
        // For now, we'll trust the frontend
        verificationResult = true;
        break;

      case 'telegram_join':
        // Verify Telegram membership using verification code
        if (!value || typeof value !== 'string' || value.trim().length === 0) {
          return NextResponse.json({ 
            error: 'Verification code is required' 
          }, { status: 400 });
        }

        try {
          // Use direct verification function instead of HTTP call
          const { verifyTelegramByCode } = await import('@/lib/telegram-utils');
          const telegramResult = await verifyTelegramByCode(user.walletAddress, value.trim());
          
          if (!telegramResult.success) {
            return NextResponse.json({ 
              error: telegramResult.error || 'Failed to verify Telegram membership'
            }, { status: telegramResult.status });
          }

          updateData.telegramUsername = telegramResult.user?.username || `user_${telegramResult.user?.id}`;
          verificationResult = true;
        } catch (error) {
          console.error('Telegram verification error:', error);
          return NextResponse.json({ 
            error: 'Failed to verify Telegram membership. Please try again.' 
          }, { status: 500 });
        }
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