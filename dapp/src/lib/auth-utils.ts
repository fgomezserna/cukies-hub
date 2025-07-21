// Server-side utilities for wallet authentication
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

export async function verifyWalletAuth(walletAddress: string): Promise<any> {
  if (!walletAddress) {
    throw new Error('Wallet address is required');
  }

  const user = await prisma.user.findUnique({
    where: { walletAddress: walletAddress.toLowerCase() },
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

export async function getUserFromRequest(request: NextRequest): Promise<any> {
  // Try to get wallet address from various sources
  const walletAddress = 
    request.headers.get('x-wallet-address') || 
    request.headers.get('wallet-address') ||
    request.cookies.get('walletAddress')?.value;

  if (!walletAddress) {
    return null;
  }

  try {
    return await verifyWalletAuth(walletAddress);
  } catch {
    return null;
  }
}