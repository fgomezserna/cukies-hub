import { NextRequest, NextResponse } from 'next/server';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const { walletAddress, username } = await request.json();
    
    if (!walletAddress || !username) {
      return NextResponse.json({ error: 'Wallet address and username are required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate username format
    if (typeof username !== 'string' || username.trim().length < 3) {
      return NextResponse.json({ 
        valid: false,
        error: 'Username must be at least 3 characters long' 
      });
    }

    // Check if username is already taken by another user
    const existingUser = await prisma.user.findUnique({
      where: { username: username.trim() },
      select: { walletAddress: true }
    });

    if (existingUser && existingUser.walletAddress !== user.walletAddress) {
      return NextResponse.json({ 
        valid: false,
        error: 'Username already taken' 
      });
    }

    // Username is available
    return NextResponse.json({ 
      valid: true,
      message: 'Username is available' 
    });

  } catch (error) {
    console.error('Error validating username:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}