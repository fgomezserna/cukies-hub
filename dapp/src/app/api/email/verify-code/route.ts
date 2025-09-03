import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { email, verificationCode, walletAddress } = await request.json();

    if (!email || !verificationCode || !walletAddress) {
      return NextResponse.json({ 
        error: 'Email, verification code, and wallet address are required' 
      }, { status: 400 });
    }

    // Find the verification record
    const verification = await prisma.emailVerification.findFirst({
      where: {
        email,
        verificationCode,
        walletAddress,
        isUsed: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    if (!verification) {
      return NextResponse.json({ 
        error: 'Invalid or expired verification code' 
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

    // Update user email and mark verification as used in a transaction
    await prisma.$transaction([
      // Update user with verified email
      prisma.user.update({
        where: { walletAddress },
        data: { email }
      }),
      // Mark verification as used
      prisma.emailVerification.update({
        where: { id: verification.id },
        data: { isUsed: true }
      }),
      // Clean up old verification codes for this email/wallet
      prisma.emailVerification.deleteMany({
        where: {
          AND: [
            {
              OR: [
                { email },
                { walletAddress }
              ]
            },
            {
              id: { not: verification.id }
            }
          ]
        }
      })
    ]);

    return NextResponse.json({
      success: true,
      message: 'Email verified successfully',
      email
    });

  } catch (error) {
    console.error('Error verifying email:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
