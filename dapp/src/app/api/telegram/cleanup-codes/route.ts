import { NextResponse } from 'next/server';
import { cleanupOldVerificationCodes } from '@/lib/telegram-utils';
import {
  requireLocalAdminApiAccess,
  requirePrivateSecretApiAccess,
} from '@/lib/operational-access';

export async function POST(request: Request) {
  const accessDenied = requirePrivateSecretApiAccess(
    request.headers.get('x-cleanup-secret'),
    'TELEGRAM_CLEANUP_SECRET',
  );
  if (accessDenied) return accessDenied;

  try {
    // Get optional parameters from request body
    const body = await request.json().catch(() => ({}));
    const maxAgeMinutes = body.maxAgeMinutes ?? 10;
    if (!Number.isSafeInteger(maxAgeMinutes) || maxAgeMinutes < 1 || maxAgeMinutes > 1_440) {
      return NextResponse.json(
        { error: 'maxAgeMinutes must be an integer between 1 and 1440' },
        { status: 400 },
      );
    }
    
    // Run the cleanup
    const deletedCount = await cleanupOldVerificationCodes(
      /\b\d{6}\b/, // Pattern for 6-digit codes
      maxAgeMinutes
    );

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Cleaned up ${deletedCount} old verification messages`
    });

  } catch (error) {
    console.error('Cleanup endpoint error:', error);
    return NextResponse.json({ 
      error: 'Internal server error during cleanup' 
    }, { status: 500 });
  }
}

export async function GET() {
  const accessDenied = await requireLocalAdminApiAccess();
  if (accessDenied) return accessDenied;

  return NextResponse.json({
    message: 'Use POST method to trigger cleanup',
    info: 'This endpoint cleans up old verification codes from Telegram'
  });
}
