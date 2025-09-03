import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Check how many verification codes are active
    const activeCodesCount = await prisma.emailVerification.count({
      where: {
        isUsed: false,
        expiresAt: {
          gt: new Date()
        }
      }
    });

    // Check how many expired codes need cleanup
    const expiredCodesCount = await prisma.emailVerification.count({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });

    // Check if Resend is configured
    const resendConfigured = !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);

    return NextResponse.json({
      status: 'healthy',
      resendConfigured,
      activeVerificationCodes: activeCodesCount,
      expiredCodes: expiredCodesCount,
      cleanupNeeded: expiredCodesCount > 0,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Email system health check failed:', error);
    return NextResponse.json({
      status: 'error',
      error: 'Failed to check email system status'
    }, { status: 500 });
  }
}
