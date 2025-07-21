import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const rooms = await prisma.chatRoom.findMany({
      select: {
        id: true,
        gameId: true,
        name: true,
        telegramGroupId: true,
        telegramTopicId: true,
        isActive: true,
        _count: {
          select: {
            messages: true,
            members: true
          }
        }
      }
    });

    // Get recent messages for each room
    const roomsWithMessages = await Promise.all(
      rooms.map(async (room) => {
        const recentMessages = await prisma.chatMessage.findMany({
          where: { roomId: room.id },
          take: 3,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            content: true,
            isFromTelegram: true,
            isFromWeb: true,
            telegramMessageId: true,
            createdAt: true
          }
        });

        return {
          ...room,
          recentMessages
        };
      })
    );

    return NextResponse.json({ 
      rooms: roomsWithMessages,
      telegramConfig: {
        botToken: process.env.TELEGRAM_BOT_TOKEN ? 'configured' : 'missing',
        groupId: process.env.TELEGRAM_CHAT_ID || 'missing'
      }
    });
  } catch (error) {
    console.error('Error fetching chat config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}