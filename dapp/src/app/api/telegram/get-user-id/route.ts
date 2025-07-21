import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json({ 
        error: 'Username is required' 
      }, { status: 400 });
    }

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json({ 
        error: 'Telegram bot not configured' 
      }, { status: 500 });
    }

    const cleanUsername = username.replace('@', '');
    
    // Get user info from username
    const userResponse = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: `@${cleanUsername}`
      })
    });

    if (!userResponse.ok) {
      const errorData = await userResponse.json();
      
      if (errorData.description?.includes('not found')) {
        return NextResponse.json({ 
          error: 'Username not found or not public',
          suggestions: [
            'Check your username is correct',
            'Make sure your username is public (visible to others)',
            'Verify you have set a username in Telegram settings'
          ]
        }, { status: 404 });
      }
      
      return NextResponse.json({ 
        error: 'Failed to get user info' 
      }, { status: 400 });
    }

    const userData = await userResponse.json();
    
    return NextResponse.json({
      success: true,
      user: {
        id: userData.result.id,
        username: userData.result.username,
        first_name: userData.result.first_name,
        last_name: userData.result.last_name,
        type: userData.result.type
      }
    });

  } catch (error) {
    console.error('Error getting user ID:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}