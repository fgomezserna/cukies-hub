// Server-side utilities for wallet authentication
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';
import { readWalletSession, requireWalletSession } from '@/lib/wallet-auth';

export async function verifyWalletAuth(walletAddress: string): Promise<any> {
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  const session = await requireWalletSession(walletAddress);
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      walletAddress: true,
      username: true,
      profilePictureUrl: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

export async function getUserFromRequest(_request: NextRequest): Promise<any> {
  const session = await readWalletSession();

  if (!session) {
    return null;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        walletAddress: true,
        username: true,
        profilePictureUrl: true,
      },
    });

    return user;
  } catch {
    return null;
  }
}
