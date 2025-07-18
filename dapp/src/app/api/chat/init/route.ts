import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createGameChatRooms } from '@/lib/telegram-chat-utils';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // For now, allow any authenticated user to initialize
    // In production, you might want to restrict this to admins
    await createGameChatRooms();

    return NextResponse.json({ message: 'Chat rooms initialized successfully' });
  } catch (error) {
    console.error('Error initializing chat rooms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}