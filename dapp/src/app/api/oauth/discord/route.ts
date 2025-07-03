import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { code, walletAddress } = await request.json();

    if (!code || !walletAddress) {
      return NextResponse.json({ 
        error: 'Code and wallet address are required' 
      }, { status: 400 });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${process.env.NEXTAUTH_URL}/oauth/discord/callback.html`,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Discord token exchange failed:', error);
      return NextResponse.json({ 
        error: 'Failed to exchange code for token' 
      }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      return NextResponse.json({ 
        error: 'Failed to get user info from Discord' 
      }, { status: 400 });
    }

    const discordUser = await userResponse.json();
    
    return NextResponse.json({
      success: true,
      discordUser: {
        id: discordUser.id,
        username: discordUser.username,
        discriminator: discordUser.discriminator,
        avatar: discordUser.avatar,
        global_name: discordUser.global_name,
      },
    });

  } catch (error) {
    console.error('Discord OAuth error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
} 