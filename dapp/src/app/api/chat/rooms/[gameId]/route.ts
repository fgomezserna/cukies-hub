import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const room = await prisma.chatRoom.findUnique({
      where: { gameId: params.gameId },
      include: {
        _count: {
          select: {
            members: true,
            messages: true,
          },
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: 'Chat room not found' }, { status: 404 });
    }

    return NextResponse.json(room);
  } catch (error) {
    console.error('Error fetching chat room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description, telegramTopicId, telegramGroupId, isActive } = await request.json();

    const room = await prisma.chatRoom.update({
      where: { gameId: params.gameId },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(telegramTopicId !== undefined && { telegramTopicId }),
        ...(telegramGroupId !== undefined && { telegramGroupId }),
        ...(isActive !== undefined && { isActive }),
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

    return NextResponse.json(room);
  } catch (error) {
    console.error('Error updating chat room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}