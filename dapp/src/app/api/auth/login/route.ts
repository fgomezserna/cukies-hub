import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { walletAddress } = await request.json();

    if (!walletAddress || typeof walletAddress !== 'string') {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
    }

    const lowercasedAddress = walletAddress.toLowerCase();

    let user = await prisma.user.findUnique({
      where: {
        walletAddress: lowercasedAddress,
      },
      include: {
        lastCheckIn: true,
      }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          walletAddress: lowercasedAddress,
          // You can set initial values for other fields here if needed
          // For example, setting the initial username to a portion of the wallet address
          username: `user_${lowercasedAddress.slice(0, 6)}`
        },
        include: {
          lastCheckIn: true,
        }
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 