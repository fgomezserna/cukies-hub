import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { resend, EMAIL_CONFIG } from '@/lib/resend';
import { createVerificationEmailTemplate, createVerificationEmailSubject } from '@/lib/email-templates';

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

    // Send verification email using Resend
    console.log('🔍 Attempting to send email with Resend...');
    console.log('📧 From:', EMAIL_CONFIG.from);
    console.log('📧 To:', email);
    console.log('🔑 API Key configured:', !!process.env.RESEND_API_KEY);
    
    try {
      const emailHtml = createVerificationEmailTemplate(verificationCode);
      const emailSubject = createVerificationEmailSubject();

      console.log('📨 Calling resend.emails.send...');
      const result = await resend.emails.send({
        from: EMAIL_CONFIG.from,
        to: email,
        subject: emailSubject,
        html: emailHtml,
      });

      console.log('🎉 Resend response:', result);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Failed to send verification email:', emailError);
      console.error('❌ Error details:', JSON.stringify(emailError, null, 2));
      
      // Clean up the verification record since email failed
      await prisma.emailVerification.deleteMany({
        where: { email, walletAddress }
      });
      
      return NextResponse.json({
        error: 'Failed to send verification email. Please try again.'
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email',
      // Show code in development for easier testing
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
