import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    console.log('Raw request body:', body);
    const { content, topicId = 1532 } = JSON.parse(body);
    
    if (!content) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: "-1002115931584",
        text: `🤖 <b>Test Bot</b>: ${content}`,
        parse_mode: 'HTML',
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