import { NextRequest, NextResponse } from 'next/server';
import { getOrCreateWebGameChatRoom } from '@/lib/game-chat-room';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Initializing chat rooms...');

    const rooms = ['sybil-slayer', 'hyppie-road', 'tower-builder'];

    const results = [];

    for (const gameId of rooms) {
      const room = await getOrCreateWebGameChatRoom(gameId);
      console.log(`✅ Web chat room ready: ${room.name} (${room.gameId})`);
      results.push(`✅ Ready: ${room.name}`);
    }

    console.log('🎉 Chat rooms initialization completed!');
    return NextResponse.json({ 
      message: 'Chat rooms initialized successfully',
      results
    });
  } catch (error) {
    console.error('❌ Error initializing chat rooms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
