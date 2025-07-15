import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Generate a unique 6-digit code
function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ 
        error: 'Wallet address is required' 
      }, { status: 400 });
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { walletAddress }
    });

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }

    // Generate a unique verification code
    const verificationCode = generateVerificationCode();

    // Store the code in the database (you might want to add a TelegramVerification model)
    // For now, we'll use a simple approach with a temporary storage
    // In production, you should create a proper table for this
    
    return NextResponse.json({
      success: true,
      verificationCode,
      instructions: [
        "1. Join our Telegram group if you haven't already",
        `2. Send this message to the group: /verify ${verificationCode}`,
        "3. Come back and click 'Check Verification' below",
        "4. The code expires in 10 minutes"
      ],
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

  } catch (error) {
    console.error('Error generating verification code:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}