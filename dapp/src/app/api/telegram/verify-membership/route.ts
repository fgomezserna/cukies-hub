import { NextResponse } from 'next/server';
import { verifyTelegramMembership } from '@/lib/telegram-utils';
import { verifyWalletAuth } from '@/lib/auth-utils';

export async function POST(request: Request) {
  try {
    const { telegramUsername, walletAddress } = await request.json();

    if (!telegramUsername || !walletAddress) {
      return NextResponse.json({ 
        error: 'Telegram username and wallet address are required' 
      }, { status: 400 });
    }

    const authenticatedUser = await verifyWalletAuth(walletAddress);
    const result = await verifyTelegramMembership(
      telegramUsername,
      authenticatedUser.walletAddress,
    );
    
    if (!result.success) {
      return NextResponse.json({ 
        error: result.error,
        requiresJoin: result.requiresJoin
      }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      message: 'Telegram membership verified successfully',
      username: result.username
    });

  } catch (error) {
    console.error('Telegram verification error:', error);
    return NextResponse.json({ 
      error: 'Internal server error during Telegram verification' 
    }, { status: 500 });
  }
}
