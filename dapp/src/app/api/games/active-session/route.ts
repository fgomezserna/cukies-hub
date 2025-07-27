import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const gameId = searchParams.get('gameId');

    if (!userId || !gameId) {
      return NextResponse.json({ 
        success: false, 
        error: 'Missing userId or gameId parameter' 
      }, { status: 400 });
    }

    // Find the most recent active session for this user and game
    const activeSession = await prisma.gameSession.findFirst({
      where: {
        userId,
        gameId,
        isActive: true
      },
      orderBy: {
        startedAt: 'desc'
      }
    });

    if (!activeSession) {
      console.log('🔍 [API] No active session found, checking for recent inactive sessions...', {
        userId,
        gameId
      });

      // Fallback: Check for recent inactive sessions within the last 5 minutes
      const recentSession = await prisma.gameSession.findFirst({
        where: {
          userId,
          gameId,
          isActive: false,
          endedAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
          }
        },
        include: {
          result: true
        },
        orderBy: {
          endedAt: 'desc'
        }
      });

      if (!recentSession) {
        console.log('❌ [API] No active or recent session found for fallback');
        return NextResponse.json({ 
          success: false, 
          error: 'No active or recent session found' 
        }, { status: 404 });
      }

      // If the recent session already has a result, don't allow duplicate
      if (recentSession.result) {
        console.log('⚠️ [API] Recent session already has results, cannot reuse');
        return NextResponse.json({ 
          success: false, 
          error: 'Recent session already completed' 
        }, { status: 404 });
      }

      console.log('🔄 [API] Found recent session for fallback use:', {
        sessionToken: recentSession.sessionToken,
        sessionId: recentSession.sessionId,
        endedAt: recentSession.endedAt
      });

      return NextResponse.json({
        success: true,
        sessionToken: recentSession.sessionToken,
        sessionId: recentSession.sessionId,
        gameId: recentSession.gameId,
        isReactivated: true
      });
    }

    console.log('🔍 [API] Found active session:', {
      sessionToken: activeSession.sessionToken,
      sessionId: activeSession.sessionId,
      gameId: activeSession.gameId,
      userId: activeSession.userId
    });

    return NextResponse.json({
      success: true,
      sessionToken: activeSession.sessionToken,
      sessionId: activeSession.sessionId,
      gameId: activeSession.gameId
    });

  } catch (error) {
    console.error('❌ [API] Error finding active session:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}