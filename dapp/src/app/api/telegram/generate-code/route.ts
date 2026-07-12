import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { hashTelegramVerificationToken } from '@/lib/telegram-linking';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress) {
      return NextResponse.json({ 
        error: 'Wallet address is required' 
      }, { status: 400, headers: NO_STORE_HEADERS });
    }

    const authenticatedUser = await verifyWalletAuth(walletAddress);
    const verificationCode = randomBytes(32).toString('base64url');
    const tokenHash = hashTelegramVerificationToken(verificationCode);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    // Only the hash is durable; generating another command invalidates the previous one.
    await prisma.telegramLinkChallenge.upsert({
      where: { userId: authenticatedUser.id },
      create: {
        userId: authenticatedUser.id,
        tokenHash,
        expiresAt,
      },
      update: {
        tokenHash,
        expiresAt,
        consumedAt: null,
        consumedTelegramUserId: null,
        consumedTelegramUsername: null,
        consumedTelegramDisplay: null,
      },
    });

    const verificationCommand = `/verify ${verificationCode}`;
    
    return NextResponse.json(
      {
        success: true,
        verificationCode,
        verificationCommand,
        instructions: [
          "1. Join our Telegram group if you haven't already",
          `2. Send this command in a private chat with our bot: ${verificationCommand}`,
          "3. Come back and click 'Check Verification' below",
          "4. The code expires in 10 minutes"
        ],
        expiresAt: expiresAt.getTime(),
      },
      { headers: NO_STORE_HEADERS },
    );

  } catch {
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
