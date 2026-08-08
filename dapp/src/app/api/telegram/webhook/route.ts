import { NextRequest, NextResponse } from 'next/server';
import { processTelegramMessage } from '@/lib/telegram-chat-utils';
import { requirePrivateSecretApiAccess } from '@/lib/operational-access';

export async function POST(request: NextRequest) {
  const accessDenied = requirePrivateSecretApiAccess(
    request.headers.get('x-telegram-bot-api-secret-token'),
    'TELEGRAM_WEBHOOK_SECRET',
  );
  if (accessDenied) return accessDenied;

  try {
    const update = await request.json();

    // Check if this is a message update
    if (update.message) {
      await processTelegramMessage(update.message);
    }

    // Always return 200 OK to acknowledge receipt
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error processing Telegram webhook:', error);
    
    // Still return 200 OK to prevent Telegram from retrying
    return NextResponse.json({ ok: true });
  }
}
