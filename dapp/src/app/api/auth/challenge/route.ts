import { NextResponse } from 'next/server';

import {
  createWalletChallenge,
  resolveWalletType,
  setWalletChallengeCookie,
} from '@/lib/wallet-auth';

export async function POST(request: Request) {
  try {
    const { walletAddress, walletType } = await request.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const resolvedWalletType = resolveWalletType(walletAddress, walletType);
    const challenge = createWalletChallenge(walletAddress, resolvedWalletType);

    await setWalletChallengeCookie(challenge);

    return NextResponse.json({
      walletAddress: challenge.walletAddress,
      walletType: challenge.walletType,
      message: challenge.message,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    console.error('Wallet challenge API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
