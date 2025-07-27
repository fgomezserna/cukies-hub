import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let sessionToken: string | undefined;
  let finalScore: number | undefined;
  let metadata: any;
  
  try {
    ({ sessionToken, finalScore, metadata } = await request.json());

    console.log('🏁 [API] End session request received:', {
      sessionToken: sessionToken || 'missing',
      finalScore,
      metadata,
      timestamp: new Date().toISOString()
    });

    if (!sessionToken || finalScore === undefined) {
      console.error('❌ [API] Missing required fields:', { sessionToken, finalScore });
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Find the session (active or recently ended)
    const session = await prisma.gameSession.findUnique({
      where: { sessionToken },
      include: {
        checkpoints: {
          orderBy: { timestamp: 'desc' },
          take: 1
        },
        result: true // Include existing result to check for duplicates
      }
    });

    if (!session) {
      console.error('❌ [API] Session not found:', { 
        sessionToken, 
        searchAttempted: 'findUnique by sessionToken' 
      });
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 400 });
    }

    console.log('✅ [API] Session found:', {
      sessionId: session.sessionId,
      userId: session.userId,
      gameId: session.gameId,
      isActive: session.isActive,
      hasResult: !!session.result,
      checkpointsCount: session.checkpoints.length
    });

    // Check if this session already has a result (prevent duplicates)
    if (session.result) {
      console.log('⚠️ [API] Session already has results, preventing duplicate:', sessionToken);
      return NextResponse.json({
        success: true,
        finalScore: session.result.finalScore,
        isValid: session.result.isValid,
        xpEarned: session.result.xpEarned,
        isDuplicate: true
      });
    }

    // Check if session is still active
    if (!session.isActive) {
      console.log('⚠️ [API] Session is no longer active:', sessionToken);
      // Still allow processing if no results exist yet
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

    const processingTime = Date.now() - startTime;
    console.log('🏁 [API] Game session ended successfully:', {
      sessionToken,
      sessionId: session.sessionId,
      finalScore,
      metadata,
      xpEarned,
      processingTimeMs: processingTime
    });

    return NextResponse.json({
      success: true,
      finalScore,
      isValid: true,
      xpEarned,
      sessionId: session.sessionId
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ [API] Error ending game session:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      sessionToken: sessionToken || 'undefined',
      finalScore: finalScore || 'undefined',
      metadata: metadata || 'undefined',
      processingTimeMs: processingTime
    });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
} 