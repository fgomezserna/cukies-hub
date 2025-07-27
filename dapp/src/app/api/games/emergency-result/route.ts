import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * Emergency endpoint to save game results when session management fails
 * This should only be used as a last resort fallback
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let userId: string | undefined;
  let gameId: string | undefined;
  let finalScore: number | undefined;
  let metadata: any;
  
  try {
    ({ userId, gameId, finalScore, metadata } = await request.json());

    console.log('🚨 [API] Emergency result save request:', {
      userId: userId || 'missing',
      gameId: gameId || 'missing',
      finalScore,
      metadata,
      timestamp: new Date().toISOString()
    });

    if (!userId || !gameId || finalScore === undefined) {
      console.error('❌ [API] Missing required fields for emergency save:', { userId, gameId, finalScore });
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      console.error('❌ [API] User not found for emergency save:', userId);
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 400 });
    }

    // Check for recent sessions to avoid duplicates
    const recentSession = await prisma.gameSession.findFirst({
      where: {
        userId,
        gameId,
        startedAt: {
          gte: new Date(Date.now() - 10 * 60 * 1000) // Last 10 minutes
        }
      },
      include: {
        result: true
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    if (recentSession?.result) {
      console.log('⚠️ [API] Recent session already has results, preventing duplicate emergency save');
      return NextResponse.json({
        success: true,
        finalScore: recentSession.result.finalScore,
        isValid: recentSession.result.isValid,
        xpEarned: recentSession.result.xpEarned,
        isDuplicate: true,
        isEmergencySave: true
      });
    }

    // Calculate XP earned (basic formula: 1 XP per 100 points)
    const xpEarned = Math.floor(finalScore / 100);

    // If we have a recent session without results, use it
    if (recentSession && !recentSession.result) {
      console.log('🔄 [API] Using recent session for emergency result save');
      
      const gameResult = await prisma.gameResult.create({
        data: {
          sessionId: recentSession.id,
          userId,
          gameId,
          finalScore,
          gameTime: 30000, // Default game time for emergency saves
          metadata: { ...metadata, isEmergencySave: true },
          isValid: true,
          xpEarned
        }
      });

      // Update user's XP
      await prisma.user.update({
        where: { id: userId },
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
            userId,
            amount: xpEarned,
            type: 'GAME_PLAY',
            reason: `Emergency save: ${gameId} game with score ${finalScore}`,
            metadata: {
              gameId,
              finalScore,
              gameTime: 30000,
              sessionId: recentSession.sessionId,
              isEmergencySave: true
            }
          }
        });
      }

      // Mark session as inactive
      await prisma.gameSession.update({
        where: { id: recentSession.id },
        data: {
          isActive: false,
          endedAt: new Date()
        }
      });

      const processingTime = Date.now() - startTime;
      console.log('🚨 [API] Emergency result saved successfully with existing session:', {
        sessionId: recentSession.sessionId,
        finalScore,
        xpEarned,
        processingTimeMs: processingTime
      });

      return NextResponse.json({
        success: true,
        finalScore,
        isValid: true,
        xpEarned,
        sessionId: recentSession.sessionId,
        isEmergencySave: true
      });
    }

    // Last resort: Create an emergency session and result
    console.log('🚨 [API] Creating emergency session for lost game result');
    
    const emergencySession = await prisma.gameSession.create({
      data: {
        sessionToken: `emergency-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        sessionId: `emergency-${Date.now()}`,
        userId,
        gameId,
        gameVersion: '1.0.0',
        startedAt: new Date(Date.now() - 30000), // 30 seconds ago
        endedAt: new Date(),
        isActive: false
      }
    });

    const gameResult = await prisma.gameResult.create({
      data: {
        sessionId: emergencySession.id,
        userId,
        gameId,
        finalScore,
        gameTime: 30000, // Default game time for emergency saves
        metadata: { ...metadata, isEmergencySave: true, reason: 'Session management failure' },
        isValid: true,
        xpEarned
      }
    });

    // Update user's XP
    await prisma.user.update({
      where: { id: userId },
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
          userId,
          amount: xpEarned,
          type: 'GAME_PLAY',
          reason: `Emergency save: ${gameId} game with score ${finalScore}`,
          metadata: {
            gameId,
            finalScore,
            gameTime: 30000,
            sessionId: emergencySession.sessionId,
            isEmergencySave: true
          }
        }
      });
    }

    const processingTime = Date.now() - startTime;
    console.log('🚨 [API] Emergency session and result created successfully:', {
      sessionId: emergencySession.sessionId,
      finalScore,
      xpEarned,
      processingTimeMs: processingTime
    });

    return NextResponse.json({
      success: true,
      finalScore,
      isValid: true,
      xpEarned,
      sessionId: emergencySession.sessionId,
      isEmergencySave: true
    });

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('❌ [API] Error in emergency result save:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      userId: userId || 'undefined',
      gameId: gameId || 'undefined',
      finalScore: finalScore || 'undefined',
      metadata: metadata || 'undefined',
      processingTimeMs: processingTime
    });
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}