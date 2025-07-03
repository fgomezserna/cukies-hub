import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ 
        error: 'Wallet address is required' 
      }, { status: 400 });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { walletAddress },
      include: {
        accounts: {
          where: {
            provider: 'discord'
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user has Discord account connected
    const discordAccount = user.accounts.find(acc => acc.provider === 'discord');
    
    if (!discordAccount) {
      return NextResponse.json({ 
        error: 'Discord account not connected. Please connect your Discord account first.',
        requiresConnection: true
      }, { status: 400 });
    }

    if (!discordAccount.access_token) {
      return NextResponse.json({ 
        error: 'Discord connection expired. Please reconnect your Discord account.',
        requiresReconnection: true
      }, { status: 401 });
    }

    // Check if access token is still valid and get user's guilds
    console.log(`[Discord Verification] Checking guilds for user ${user.walletAddress}`);
    
    const guildsResponse = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${discordAccount.access_token}`,
      },
    });

    if (!guildsResponse.ok) {
      console.log(`[Discord Verification] Token validation failed:`, guildsResponse.status, guildsResponse.statusText);
      // Token might be expired, need to reconnect
      return NextResponse.json({ 
        error: 'Discord connection expired. Please reconnect your Discord account.',
        requiresReconnection: true
      }, { status: 401 });
    }

    const guilds = await guildsResponse.json();
    const TARGET_GUILD_ID = process.env.DISCORD_GUILD_ID;

    if (!TARGET_GUILD_ID) {
      console.error('DISCORD_GUILD_ID environment variable not set');
      return NextResponse.json({ 
        error: 'Discord server verification not configured' 
      }, { status: 500 });
    }

    // Check if user is member of our Discord server
    const isMember = guilds.some((guild: any) => guild.id === TARGET_GUILD_ID);
    
    console.log(`[Discord Verification] User has ${guilds.length} guilds. Target guild: ${TARGET_GUILD_ID}. Is member: ${isMember}`);

    if (!isMember) {
      return NextResponse.json({ 
        error: 'You are not a member of our Discord server yet.',
        requiresJoin: true,
        guildId: TARGET_GUILD_ID
      }, { status: 400 });
    }
    
    console.log(`[Discord Verification] Membership verified successfully for user ${user.walletAddress}`);
    
    return NextResponse.json({
      success: true,
      isMember: true,
      guildId: TARGET_GUILD_ID,
    });

  } catch (error) {
    console.error('Discord membership verification error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
} 