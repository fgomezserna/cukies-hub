import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ 
        error: 'Telegram bot not configured' 
      }, { status: 500 });
    }

    // Get recent updates to find users who messaged the bot
    const updatesResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (!updatesResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to get updates from Telegram' 
      }, { status: 500 });
    }

    const updatesData = await updatesResponse.json();
    
    // Extract unique users from recent messages
    const users = new Map();
    
    updatesData.result.forEach((update: any) => {
      if (update.message?.from) {
        const user = update.message.from;
        if (!users.has(user.id)) {
          users.set(user.id, {
            id: user.id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            message_text: update.message.text,
            date: new Date(update.message.date * 1000).toLocaleString()
          });
        }
      }
    });

    const recentUsers = Array.from(users.values()).slice(0, 10);

    return NextResponse.json({
      success: true,
      instructions: [
        "To get your Telegram ID:",
        "1. Send any message to the bot",
        "2. Refresh this page",
        "3. Find your message in the list below",
        "4. Copy your ID number",
        "5. Use it in the verification form"
      ],
      recentUsers,
      botUsername: process.env.TELEGRAM_BOT_TOKEN ? 
        `@${process.env.TELEGRAM_BOT_TOKEN.split(':')[0]}` : 'Bot not configured'
    });

  } catch (error) {
    console.error('Error getting Telegram updates:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}