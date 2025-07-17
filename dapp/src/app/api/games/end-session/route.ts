import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, finalScore, metadata } = await request.json();

    if (!sessionToken || finalScore === undefined) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Find the active session
    const session = await prisma.gameSession.findUnique({
      where: { sessionToken, isActive: true },
      include: {
        checkpoints: {
          orderBy: { timestamp: 'desc' },
          take: 1
        }
      }
    });

    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid or inactive session' }, { status: 400 });
    }

    // Calculate game time from last checkpoint or session start
    const lastCheckpoint = session.checkpoints[0];
    const gameTime = lastCheckpoint ? lastCheckpoint.gameTime : 0;

    // Calculate XP earned (basic formula: 1 XP per 100 points)
    const xpEarned = Math.floor(finalScore / 100);

    // Save game result to database
    const gameResult = await prisma.gameResult.create({
      data: {
        sessionId: session.id,
        userId: session.userId,
        gameId: session.gameId,
        finalScore,
        gameTime,
        metadata: metadata || {},
        isValid: true,
        xpEarned
      }
    });

    // Update user's XP
    await prisma.user.update({
      where: { id: session.userId },
      data: {
        xp: {
          increment: xpEarned
        }
      }
    });

    // Create point transaction record
    if (xpEarned > 0) {
      await prisma.pointTransaction.create({
        data: {
          userId: session.userId,
          amount: xpEarned,
          type: 'GAME_PLAY',
          reason: `Completed ${session.gameId} game with score ${finalScore}`,
          metadata: {
            gameId: session.gameId,
            finalScore,
            gameTime,
            sessionId: session.sessionId
          }
        }
      });
    }

    // Mark session as inactive
    await prisma.gameSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        endedAt: new Date()
      }
    });

    console.log('🏁 [API] Game session ended:', {
      sessionToken,
      finalScore,
      metadata,
      xpEarned
    });

    return NextResponse.json({
      success: true,
      finalScore,
      isValid: true,
      xpEarned
    });

  } catch (error) {
    console.error('❌ [API] Error ending game session:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
} 