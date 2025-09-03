import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export async function POST(request: Request) {
  try {
    const { email, walletAddress } = await request.json();

    if (!email || !walletAddress) {
      return NextResponse.json({ 
        error: 'Email and wallet address are required' 
      }, { status: 400 });
    }

    if (!isValidEmail(email)) {
      return NextResponse.json({ 
        error: 'Valid email is required' 
      }, { status: 400 });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { walletAddress }
    });

    if (!user) {
      return NextResponse.json({ 
        error: 'User not found' 
      }, { status: 404 });
    }

    // Check if email is already used by another user
    const existingUser = await prisma.user.findFirst({
      where: { 
        email: email,
        walletAddress: { not: walletAddress }
      }
    });

    if (existingUser) {
      return NextResponse.json({ 
        error: 'Email already registered by another user' 
      }, { status: 409 });
    }

    // Generate verification code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing verification codes for this email/wallet
    await prisma.emailVerification.deleteMany({
      where: {
        OR: [
          { email: email },
          { walletAddress: walletAddress }
        ]
      }
    });

    // Store verification code
    await prisma.emailVerification.create({
      data: {
        email,
        verificationCode,
        walletAddress,
        expiresAt
      }
    });

    // In a real implementation, you would send the email here
    // For now, we'll return the code for testing purposes
    console.log(`Email verification code for ${email}: ${verificationCode}`);

    // TODO: Integrate with an email service like SendGrid, Nodemailer, etc.
    // await sendVerificationEmail(email, verificationCode);

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email',
      // Remove this in production and actually send the email
      verificationCode: process.env.NODE_ENV === 'development' ? verificationCode : undefined,
      expiresAt: expiresAt.getTime()
    });

  } catch (error) {
    console.error('Error sending verification email:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
