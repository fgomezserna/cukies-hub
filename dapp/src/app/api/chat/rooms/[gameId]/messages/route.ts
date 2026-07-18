import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { getOrCreateWebGameChatRoom, isValidGameChatId } from '@/lib/game-chat-room';

type RouteContext = { params: Promise<{ gameId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  try {
    if (!isValidGameChatId(params.gameId)) {
      return NextResponse.json({ error: 'Invalid game chat id' }, { status: 400 });
    }
    // For GET requests, we'll check if a wallet address is provided in query params
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const before = searchParams.get('before'); // For pagination
    const after = searchParams.get('after'); // For new messages

    // Find the chat room
    const room = await getOrCreateWebGameChatRoom(params.gameId);

    if (!room.isActive) {
      return NextResponse.json({ error: 'Chat room is not active' }, { status: 403 });
    }

    // Build query conditions
    const whereConditions: any = {
      roomId: room.id,
      isDeleted: false,
      isFromTelegram: false,
    };

    if (before) {
      whereConditions.createdAt = { lt: new Date(before) };
    }
    
    if (after) {
      whereConditions.createdAt = { gt: new Date(after) };
    }

    const messages = await prisma.chatMessage.findMany({
      where: whereConditions,
      include: {
        user: {
          select: {
            id: true,
            username: true,
            walletAddress: true,
            profilePictureUrl: true,
          },
        },
        replyTo: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                walletAddress: true,
                profilePictureUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            replies: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Reverse to show oldest first
    messages.reverse();

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  try {
    if (!isValidGameChatId(params.gameId)) {
      return NextResponse.json({ error: 'Invalid game chat id' }, { status: 400 });
    }
    let requestData;
    try {
      requestData = await request.json();
    } catch (jsonError) {
      console.error('JSON parsing error:', jsonError);
      return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
    }
    
    const { walletAddress, content, messageType = 'TEXT', replyToId } = requestData;
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Message content is required' }, { status: 400 });
    }

    if (content.length > 2000) {
      return NextResponse.json({ error: 'Message is too long' }, { status: 400 });
    }

    // Find the chat room
    const room = await getOrCreateWebGameChatRoom(params.gameId);

    if (!room.isActive) {
      return NextResponse.json({ error: 'Chat room is not active' }, { status: 403 });
    }

    // Check if user is a member of the room
    const membership = await prisma.chatRoomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (!membership || !membership.isActive) {
      // Auto-join user to room
      await prisma.chatRoomMember.create({
        data: {
          roomId: room.id,
          userId: user.id,
        },
      });
    }

    // Create the message
    const message = await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        userId: user.id,
        content: content.trim(),
        messageType,
        replyToId,
        isFromWeb: true,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            walletAddress: true,
            profilePictureUrl: true,
          },
        },
        replyTo: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                walletAddress: true,
                profilePictureUrl: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    console.error('Error creating message:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
