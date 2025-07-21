import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Initializing chat rooms...');

    const rooms = [
      {
        gameId: 'sybil-slayer',
        name: 'Sybil Slayer Chat',
        description: 'Chat room for Sybil Slayer game players',
      },
      {
        gameId: 'hyppie-road',
        name: 'Hyppie Road Chat',
        description: 'Chat room for Hyppie Road game players',
      },
    ];

    const results = [];

    for (const roomData of rooms) {
      const existingRoom = await prisma.chatRoom.findUnique({
        where: { gameId: roomData.gameId },
      });

      if (!existingRoom) {
        const room = await prisma.chatRoom.create({
          data: {
            gameId: roomData.gameId,
            name: roomData.name,
            description: roomData.description,
            telegramGroupId: process.env.TELEGRAM_CHAT_ID,
            // TODO: Create topics in Telegram and set telegramTopicId
          },
        });

        console.log(`✅ Created chat room: ${room.name} (${room.gameId})`);
        results.push(`✅ Created: ${room.name}`);
      } else {
        console.log(`⚠️  Chat room already exists: ${existingRoom.name} (${existingRoom.gameId})`);
        results.push(`⚠️ Already exists: ${existingRoom.name}`);
      }
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