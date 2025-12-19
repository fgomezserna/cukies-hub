import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    console.log('🎮 [API] Start session request received');
    const { gameId, gameVersion, userId } = await request.json();
    console.log('🎮 [API] Request data:', { gameId, gameVersion, userId });

    if (!gameId || !userId) {
      console.log('❌ [API] Missing required fields');
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user exists in database
    console.log('🔍 [API] Looking up user:', userId);
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    console.log('🔍 [API] User found:', !!user);

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Generate session data
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const sessionId = `game_${gameId}_${Date.now()}`;
    console.log('🎮 [API] Generated session data:', { sessionToken: sessionToken.substring(0, 20) + '...', sessionId });

    // Save session to database
    console.log('💾 [API] Creating game session in database...');
    const gameSession = await prisma.gameSession.create({
      data: {
        sessionToken,
        sessionId,
        userId,
        gameId,
        gameVersion: gameVersion || '1.0.0',
        isActive: true
      }
    });
    console.log('✅ [API] Game session created in database:', gameSession.id);

    console.log('🎮 [API] Game session started:', {
      sessionId,
      sessionToken,
      gameId,
      gameVersion,
      userId
    });

    return NextResponse.json({
      success: true,
      sessionToken,
      sessionId,
      gameId,
      gameVersion
    });

  } catch (error) {
    console.error('❌ [API] Error starting game session:', error);
    console.error('❌ [API] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown'
    });
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 