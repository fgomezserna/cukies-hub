import { NextResponse } from 'next/server';
import { readWalletSession } from '@/lib/wallet-auth';

export async function GET() {
  let walletSession;
  try {
    walletSession = await readWalletSession();
  } catch {
    return NextResponse.json(
      { error: 'Wallet authentication is not configured' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (!walletSession?.signedWalletAddress) {
    return NextResponse.json(
      { error: 'Wallet session is required' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const inviteLink = process.env.TELEGRAM_GROUP_INVITE?.trim();
    if (!inviteLink) {
      return NextResponse.json(
        { error: 'Telegram group invite is not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const inviteUrl = new URL(inviteLink);
    if (inviteUrl.protocol !== 'https:' || inviteUrl.hostname !== 't.me') {
      return NextResponse.json(
        { error: 'Telegram group invite is not configured' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({
      success: true,
      chatInfo: {
        title: 'Cukies World',
      },
      inviteLink: inviteUrl.toString(),
      fallbackLink: null,
    }, { headers: { 'Cache-Control': 'private, no-store' } });

  } catch (error) {
    console.error('Error getting Telegram group invite:', error);
    return NextResponse.json({ 
      error: 'Telegram group invite is not configured'
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
