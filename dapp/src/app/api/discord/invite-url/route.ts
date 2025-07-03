import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const inviteUrl = process.env.DISCORD_INVITE_URL || 'https://discord.gg/hyppie';
    
    return NextResponse.json({
      inviteUrl,
    });
  } catch (error) {
    console.error('Failed to get Discord invite URL:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
} 