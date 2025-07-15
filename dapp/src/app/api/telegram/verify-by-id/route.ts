import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { telegramId, walletAddress } = await request.json();

    if (!telegramId || !walletAddress) {
      return NextResponse.json({ 
        error: 'Telegram ID and wallet address are required' 
      }, { status: 400 });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Telegram bot configuration missing' 
      }, { status: 500 });
    }

    // Check if user is member of the chat
    const membershipResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        user_id: parseInt(telegramId)
      })
    });

    if (!membershipResponse.ok) {
      const errorData = await membershipResponse.json();
      
      if (errorData.description?.includes('not found') || errorData.description?.includes('not a member')) {
        return NextResponse.json({ 
          error: 'User is not a member of the Telegram group',
          requiresJoin: true
        }, { status: 403 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to verify Telegram membership' 
      }, { status: 400 });
    }

    const membershipData = await membershipResponse.json();
    const memberStatus = membershipData.result.status;
    const userInfo = membershipData.result.user;

    // Check if user has valid membership status
    const validStatuses = ['creator', 'administrator', 'member'];
    
    if (!validStatuses.includes(memberStatus)) {
      return NextResponse.json({ 
        error: 'User is not an active member of the Telegram group',
        requiresJoin: true
      }, { status: 403 });
    }

    // Store the telegram ID and username (if available)
    const telegramUsername = userInfo.username || null;
    
    // Check if this Telegram ID is already used by another user
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { telegramUsername: telegramUsername || '' },
          // We could add telegramId field to the schema if needed
        ],
        walletAddress: {
          not: walletAddress
        }
      }
    });

    if (existingUser && telegramUsername) {
      return NextResponse.json({ 
        error: 'This Telegram account is already verified by another user' 
      }, { status: 409 });
    }

    // Update user's telegram info
    await prisma.user.update({
      where: { walletAddress },
      data: { 
        telegramUsername: telegramUsername || `user_${telegramId}` // fallback if no username
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Telegram membership verified successfully',
      user: {
        id: userInfo.id,
        username: userInfo.username,
        first_name: userInfo.first_name,
        last_name: userInfo.last_name
      },
      status: memberStatus
    });

  } catch (error) {
    console.error('Telegram verification error:', error);
    return NextResponse.json({ 
      error: 'Internal server error during Telegram verification' 
    }, { status: 500 });
  }
}