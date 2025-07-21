import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gameId, telegramTopicId } = body;

    if (!gameId || !telegramTopicId) {
      return NextResponse.json({ error: 'gameId and telegramTopicId are required' }, { status: 400 });
    }

    // Update the chat room with the topic ID
    const updatedRoom = await prisma.chatRoom.update({
      where: { gameId },
      data: { telegramTopicId: parseInt(telegramTopicId) }
    });

    return NextResponse.json({ 
      message: 'Topic configured successfully',
      room: updatedRoom
    });
  } catch (error) {
    console.error('Error configuring topic:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Return current room configurations
    const rooms = await prisma.chatRoom.findMany({
      select: {
        gameId: true,
        name: true,
        telegramGroupId: true,
        telegramTopicId: true
      }
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('Error fetching room configurations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}