import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, checkpoint, events } = await request.json();

    if (!sessionToken || !checkpoint) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Find the active session
    const session = await prisma.gameSession.findUnique({
      where: { sessionToken, isActive: true }
    });

    if (!session) {
      return NextResponse.json({ success: false, error: 'Invalid or inactive session' }, { status: 400 });
    }

    if (session.mode === 'staging_unranked' || session.rewardEligible === false) {
      return NextResponse.json(
        { success: false, error: 'Session is not eligible for legacy checkpoints' },
        { status: 403 },
      );
    }

    // Save checkpoint to database
    const gameCheckpoint = await prisma.gameCheckpoint.create({
      data: {
        sessionId: session.id,
        score: checkpoint.score,
        gameTime: checkpoint.gameTime,
        nonce: checkpoint.nonce,
        hash: checkpoint.hash,
        events: events || []
      }
    });

    console.log('📍 [API] Checkpoint received:', {
      sessionId: session.sessionId,
      score: checkpoint.score,
      gameTime: checkpoint.gameTime,
      events: events?.length || 0
    });

    // Check for honeypot events
    const honeypotDetected = events?.some((event: any) => event.type === 'honeypot');

    return NextResponse.json({
      success: true,
      sessionValid: true,
      honeypotDetected
    });

  } catch {
    console.error('❌ [API] Error processing checkpoint');
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
