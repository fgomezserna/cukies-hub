import { NextRequest, NextResponse } from 'next/server';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userProfile = await prisma.user.findUnique({
      where: { walletAddress: user.walletAddress },
      select: {
        id: true,
        username: true,
        email: true,
        profilePictureUrl: true,
        walletAddress: true,
        bio: true,
      },
    });

    return NextResponse.json(userProfile);
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, username, email, bio } = body;
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate username if provided
    if (username !== undefined) {
      if (typeof username !== 'string' || username.trim().length < 3) {
        return NextResponse.json({ 
          error: 'Username must be at least 3 characters long' 
        }, { status: 400 });
      }

      // Check if username is already taken
      const existingUser = await prisma.user.findUnique({
        where: { username: username.trim() },
      });

      if (existingUser && existingUser.walletAddress !== user.walletAddress) {
        return NextResponse.json({ 
          error: 'Username already taken' 
        }, { status: 400 });
      }
    }

    // Validate email if provided
    if (email !== undefined && email !== null) {
      if (email !== '' && !isValidEmail(email)) {
        return NextResponse.json({ 
          error: 'Invalid email format' 
        }, { status: 400 });
      }

      if (email !== '') {
        // Check if email is already taken
        const existingEmail = await prisma.user.findFirst({
          where: { 
            email: email,
            NOT: { walletAddress: user.walletAddress }
          },
        });

        if (existingEmail) {
          return NextResponse.json({ 
            error: 'Email already registered' 
          }, { status: 400 });
        }
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { walletAddress: user.walletAddress },
      data: {
        ...(username !== undefined && { username: username.trim() }),
        ...(email !== undefined && { email: email || null }),
        ...(bio !== undefined && { bio: bio || null }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        profilePictureUrl: true,
        walletAddress: true,
        bio: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error('Error updating user profile:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}