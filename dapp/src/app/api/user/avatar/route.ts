import { NextRequest, NextResponse } from 'next/server';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, avatar } = body;
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const user = await verifyWalletAuth(walletAddress);
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!avatar || typeof avatar !== 'string') {
      return NextResponse.json({ 
        error: 'Avatar data is required' 
      }, { status: 400 });
    }

    // Basic validation for base64 image
    if (!avatar.startsWith('data:image/')) {
      return NextResponse.json({ 
        error: 'Invalid image format' 
      }, { status: 400 });
    }

    // In a production environment, you would:
    // 1. Upload to Cloudinary, S3, or another service
    // 2. Get back a URL
    // 3. Save that URL to the database
    
    // For now, we'll store the base64 string directly
    // Note: This is not recommended for production as it can make the database very large
    const updatedUser = await prisma.user.update({
      where: { walletAddress: user.walletAddress },
      data: {
        profilePictureUrl: avatar,
      },
      select: {
        id: true,
        profilePictureUrl: true,
      },
    });

    return NextResponse.json({
      success: true,
      profilePictureUrl: updatedUser.profilePictureUrl,
    });

  } catch (error) {
    console.error('Error uploading avatar:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}