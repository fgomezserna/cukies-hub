import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { getOrCreateWebGameChatRoom, isValidGameChatId } from '@/lib/game-chat-room';

type RouteContext = { params: Promise<{ gameId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  try {
    if (!isValidGameChatId(params.gameId)) {
      return NextResponse.json({ error: 'Invalid game chat id' }, { status: 400 });
    }
    const { walletAddress } = await request.json();
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the chat room
    const room = await getOrCreateWebGameChatRoom(params.gameId);

    if (!room.isActive) {
      return NextResponse.json({ error: 'Chat room is not active' }, { status: 403 });
    }

    // Check if user is already a member
    const existingMembership = await prisma.chatRoomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      if (existingMembership.isActive) {
        return NextResponse.json({ message: 'Already a member' }, { status: 200 });
      } else {
        // Reactivate membership
        await prisma.chatRoomMember.update({
          where: { id: existingMembership.id },
          data: { isActive: true, joinedAt: new Date() },
        });
      }
    } else {
      // Create new membership
      await prisma.chatRoomMember.create({
        data: {
          roomId: room.id,
          userId: user.id,
        },
      });
    }

    // Create system message about user joining
    await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        content: `${user.username || user.walletAddress} joined the chat`,
        messageType: 'SYSTEM',
        isFromWeb: true,
      },
    });

    return NextResponse.json({ message: 'Successfully joined chat room' });
  } catch (error) {
    console.error('Error joining chat room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  try {
    if (!isValidGameChatId(params.gameId)) {
      return NextResponse.json({ error: 'Invalid game chat id' }, { status: 400 });
    }
    const { walletAddress } = await request.json();
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the chat room
    const room = await getOrCreateWebGameChatRoom(params.gameId);

    // Update membership to inactive
    await prisma.chatRoomMember.updateMany({
      where: {
        roomId: room.id,
        userId: user.id,
      },
      data: { isActive: false },
    });

    // Create system message about user leaving
    await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        content: `${user.username || user.walletAddress} left the chat`,
        messageType: 'SYSTEM',
        isFromWeb: true,
      },
    });

    return NextResponse.json({ message: 'Successfully left chat room' });
  } catch (error) {
    console.error('Error leaving chat room:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
