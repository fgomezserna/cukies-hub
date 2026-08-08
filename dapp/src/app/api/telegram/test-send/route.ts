import { NextRequest, NextResponse } from 'next/server';
import { requireLocalAdminApiAccess } from '@/lib/operational-access';

export async function POST(request: NextRequest) {
  const accessDenied = await requireLocalAdminApiAccess();
  if (accessDenied) return accessDenied;

  try {
    const { content, topicId } = await request.json();
    
    if (typeof content !== 'string' || !content.trim() || content.length > 4_000) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    if (!Number.isSafeInteger(topicId) || topicId <= 0) {
      return NextResponse.json({ error: 'A positive integer topicId is required' }, { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
    if (!botToken || !chatId) {
      return NextResponse.json({ error: 'Telegram bot configuration missing' }, { status: 503 });
    }

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🤖 Test Bot: ${content.trim()}`,
        message_thread_id: topicId
      })
    });
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error sending to Telegram:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
