import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Check if bot token and chat ID are configured
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ 
        error: 'TELEGRAM_BOT_TOKEN not configured',
        configured: false 
      }, { status: 500 });
    }

    if (!process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'TELEGRAM_CHAT_ID not configured',
        configured: false 
      }, { status: 500 });
    }

    // Test bot token by getting bot info
    const botInfoResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getMe`);
    
    if (!botInfoResponse.ok) {
      const errorData = await botInfoResponse.json();
      return NextResponse.json({ 
        error: 'Invalid bot token',
        configured: false,
        details: errorData 
      }, { status: 400 });
    }

    const botInfo = await botInfoResponse.json();

    // Test chat ID by getting chat info
    const chatInfoResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID
      })
    });

    if (!chatInfoResponse.ok) {
      const errorData = await chatInfoResponse.json();
      return NextResponse.json({ 
        error: 'Invalid chat ID or bot not in chat',
        configured: false,
        details: errorData 
      }, { status: 400 });
    }

    const chatInfo = await chatInfoResponse.json();

    return NextResponse.json({
      configured: true,
      botInfo: {
        username: botInfo.result.username,
        first_name: botInfo.result.first_name,
        id: botInfo.result.id
      },
      chatInfo: {
        title: chatInfo.result.title,
        type: chatInfo.result.type,
        id: chatInfo.result.id
      }
    });

  } catch (error) {
    console.error('Telegram config test error:', error);
    return NextResponse.json({ 
      error: 'Failed to test Telegram configuration',
      configured: false 
    }, { status: 500 });
  }
}