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
        completedQuests: {
          include: {
            quest: true,
          },
        },
      },
    });

    if (!user) {
      const newUser = await prisma.user.create({
        data: {
          walletAddress: lowercasedAddress,
          username: `user_${lowercasedAddress.slice(0, 6)}`,
        },
      });
      // Now fetch the user with the same includes as above to ensure consistent object shape
      user = await prisma.user.findUnique({
        where: {
            id: newUser.id,
        },
        include: {
            lastCheckIn: true,
            completedQuests: {
                include: {
                    quest: true
                }
            }
        }
      });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Login API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
} 