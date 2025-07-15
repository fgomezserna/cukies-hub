import { NextResponse } from 'next/server';

export async function GET() {
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHAT_ID) {
      return NextResponse.json({ 
        error: 'Telegram bot configuration missing' 
      }, { status: 500 });
    }

    // Get chat info to extract the invite link
    const chatInfoResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID
      })
    });

    if (!chatInfoResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to get chat info' 
      }, { status: 500 });
    }

    const chatInfo = await chatInfoResponse.json();
    
    // Try to get the invite link from chat info
    let inviteLink = chatInfo.result.invite_link;
    
    // If no invite link, try to create one
    if (!inviteLink) {
      const createInviteResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/createChatInviteLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          name: 'Hyppie Community Invite',
          creates_join_request: false
        })
      });

      if (createInviteResponse.ok) {
        const inviteData = await createInviteResponse.json();
        inviteLink = inviteData.result.invite_link;
      }
    }

    // Fallback to environment variable if available
    if (!inviteLink && process.env.TELEGRAM_GROUP_INVITE) {
      inviteLink = process.env.TELEGRAM_GROUP_INVITE;
    }

    return NextResponse.json({
      success: true,
      chatInfo: {
        title: chatInfo.result.title,
        type: chatInfo.result.type,
        id: chatInfo.result.id,
        username: chatInfo.result.username
      },
      inviteLink: inviteLink || null,
      // Create a fallback link if we have the username
      fallbackLink: chatInfo.result.username ? `https://t.me/${chatInfo.result.username}` : null
    });

  } catch (error) {
    console.error('Error getting Telegram group invite:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}