import { NextResponse } from 'next/server';
import { cleanupOldVerificationCodes } from '@/lib/telegram-utils';

export async function POST(request: Request) {
  try {
    // Optional: Add authentication here to prevent unauthorized cleanup
    // For example, check for a secret header or API key
    const authHeader = request.headers.get('x-cleanup-secret');
    if (authHeader !== process.env.TELEGRAM_CLEANUP_SECRET) {
      return NextResponse.json({ 
        error: 'Unauthorized' 
      }, { status: 401 });
    }

    // Get optional parameters from request body
    const body = await request.json().catch(() => ({}));
    const maxAgeMinutes = body.maxAgeMinutes || 10;
    
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
  // GET endpoint for manual testing (should be protected in production)
  return NextResponse.json({
    message: 'Use POST method to trigger cleanup',
    info: 'This endpoint cleans up old verification codes from Telegram'
  });
}