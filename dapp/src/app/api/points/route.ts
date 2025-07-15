import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const pointTransactions = await prisma.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const totalCount = await prisma.pointTransaction.count({
      where: { userId: user.id },
    });

    return NextResponse.json({
      transactions: pointTransactions,
      totalCount,
      hasMore: offset + limit < totalCount,
    });

  } catch (error) {
    console.error('Failed to fetch point transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch point transactions' }, { status: 500 });
  }
} 