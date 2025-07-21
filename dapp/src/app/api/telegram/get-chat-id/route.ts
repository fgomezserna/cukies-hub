import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ 
        error: 'TELEGRAM_BOT_TOKEN not configured' 
      }, { status: 500 });
    }

    // Get updates from Telegram
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getUpdates`);
    
    if (!response.ok) {
      return NextResponse.json({ 
        error: 'Failed to fetch updates from Telegram' 
      }, { status: 500 });
    }

    const data = await response.json();

    // Extract chat IDs from the updates
    const chatIds = new Set();
    const chats: Array<{
      id: number;
      title: string;
      type: string;
      username: string | null;
    }> = [];

    data.result.forEach((update: any) => {
      if (update.message?.chat) {
        const chat = update.message.chat;
        if (!chatIds.has(chat.id)) {
          chatIds.add(chat.id);
          chats.push({
            id: chat.id,
            title: chat.title || `${chat.first_name} ${chat.last_name}`.trim() || 'Private Chat',
            type: chat.type,
            username: chat.username || null
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      chats: chats,
      instructions: [
        "1. Send a message to your Telegram group",
        "2. Make sure your bot is added to the group",
        "3. Refresh this page to see the chat ID",
        "4. Copy the ID of your group (usually negative number)",
        "5. Add it to your .env.local as TELEGRAM_CHAT_ID",
        "6. Delete this endpoint file after use"
      ]
    });

  } catch (error) {
    console.error('Error fetching chat ID:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}