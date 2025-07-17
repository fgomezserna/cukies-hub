import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { gameId, gameVersion, userId } = await request.json();

    if (!gameId || !userId) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Verify user exists in database
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    // Generate session data
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const sessionId = `game_${gameId}_${Date.now()}`;

    // Save session to database
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
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
} 