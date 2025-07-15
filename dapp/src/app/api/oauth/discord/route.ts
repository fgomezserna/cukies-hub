import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { code, walletAddress } = await request.json();

    if (!code || !walletAddress) {
      return NextResponse.json({ 
        error: 'Code and wallet address are required' 
      }, { status: 400 });
    }

    // Find the user first
    const user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
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

    // Save or update the Discord account in the accounts table
    console.log(`[Discord OAuth] Saving account for user ${user.walletAddress}, Discord ID: ${discordUser.id}`);
    
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'discord',
          providerAccountId: discordUser.id,
        },
      },
    });

    if (existingAccount) {
      // Update existing account with new tokens and link to current user
      console.log(`[Discord OAuth] Updating existing account ${existingAccount.id}`);
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          userId: user.id, // Make sure it's linked to the current user
          access_token: accessToken,
          expires_at: tokenData.expires_in ? Math.floor(Date.now() / 1000) + tokenData.expires_in : null,
          refresh_token: tokenData.refresh_token,
          scope: tokenData.scope,
          token_type: tokenData.token_type,
          updatedAt: new Date(),
        },
      });
    } else {
      // Create new account
      console.log(`[Discord OAuth] Creating new account for user ${user.id}`);
      await prisma.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider: 'discord',
          providerAccountId: discordUser.id,
          access_token: accessToken,
          expires_at: tokenData.expires_in ? Math.floor(Date.now() / 1000) + tokenData.expires_in : null,
          refresh_token: tokenData.refresh_token,
          scope: tokenData.scope,
          token_type: tokenData.token_type,
        },
      });
    }
    
    console.log(`[Discord OAuth] Account saved successfully for user ${user.walletAddress}`);
    
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