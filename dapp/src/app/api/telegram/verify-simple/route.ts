import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { walletAddress, verificationCode } = await request.json();

    if (!walletAddress || !verificationCode) {
      return NextResponse.json({ 
        error: 'Wallet address and verification code are required' 
      }, { status: 400 });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Telegram bot configuration missing' 
      }, { status: 500 });
    }

    // Get recent messages from the group to find the verification code
    const updatesResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (!updatesResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to check Telegram messages' 
      }, { status: 500 });
    }

    const updatesData = await updatesResponse.json();
    
    // Look for the verification code in recent messages
    let verificationFound = false;
    let telegramUser = null;

    for (const update of updatesData.result) {
      if (update.message?.text?.includes(verificationCode)) {
        // Check if message is from our group
        if (update.message.chat.id.toString() === process.env.TELEGRAM_CHAT_ID) {
          verificationFound = true;
          telegramUser = update.message.from;
          break;
        }
      }
    }

    if (!verificationFound) {
      return NextResponse.json({ 
        error: 'Verification code not found in group messages. Please make sure you sent the code to the correct group.' 
      }, { status: 404 });
    }

    // Check if this Telegram user is already verified by another wallet
    const existingUser = await prisma.user.findFirst({
      where: {
        telegramUsername: telegramUser.username || `user_${telegramUser.id}`,
        walletAddress: {
          not: walletAddress
        }
      }
    });

    if (existingUser) {
      return NextResponse.json({ 
        error: 'This Telegram account is already verified by another user' 
      }, { status: 409 });
    }

    // Update user's telegram info
    await prisma.user.update({
      where: { walletAddress },
      data: { 
        telegramUsername: telegramUser.username || `user_${telegramUser.id}`
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Telegram verification completed successfully',
      user: {
        id: telegramUser.id,
        username: telegramUser.username,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name
      }
    });

  } catch (error) {
    console.error('Simple telegram verification error:', error);
    return NextResponse.json({ 
      error: 'Internal server error during verification' 
    }, { status: 500 });
  }
}