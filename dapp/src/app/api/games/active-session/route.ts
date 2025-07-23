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
      return NextResponse.json({ 
        success: false, 
        error: 'No active session found' 
      }, { status: 404 });
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