import { NextRequest, NextResponse } from 'next/server';
import { processTelegramMessage } from '@/lib/telegram-chat-utils';

export async function POST(request: NextRequest) {
  try {
    const update = await request.json();
    
    // Log the incoming update for debugging
    console.log('Received Telegram update:', JSON.stringify(update, null, 2));

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

export async function GET(request: NextRequest) {
  // This endpoint can be used to verify webhook setup
  return NextResponse.json({ 
    message: 'Telegram webhook endpoint is active',
    timestamp: new Date().toISOString(),
  });
}