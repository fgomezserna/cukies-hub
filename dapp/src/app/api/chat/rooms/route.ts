import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rooms = await prisma.chatRoom.findMany({
      where: { isActive: true },
      include: {
        _count: {
          select: {
            members: true,
            messages: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(rooms);
  } catch (error) {
    console.error('Error fetching chat rooms:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { gameId, name, description, telegramTopicId, telegramGroupId } = await request.json();

    if (!gameId || !name) {
      return NextResponse.json({ error: 'Game ID and name are required' }, { status: 400 });
    }

    // Check if room already exists for this game
    const existingRoom = await prisma.chatRoom.findUnique({
      where: { gameId },
    });

    if (existingRoom) {
      return NextResponse.json({ error: 'Chat room already exists for this game' }, { status: 409 });
    }

    const room = await prisma.chatRoom.create({
      data: {
        gameId,
        name,
        description,
        telegramTopicId,
        telegramGroupId,
      },
      include: {
        _count: {
          select: {
            members: true,
            messages: true,
          },
        },
      },
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    console.error('Error creating chat room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}