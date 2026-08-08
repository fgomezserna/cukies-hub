import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyWalletAuth } from '@/lib/auth-utils';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  const limit = Number(searchParams.get('limit') ?? 50);
  const offset = Number(searchParams.get('offset') ?? 0);

  if (!walletAddress) {
    return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 });
  }

  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset > 10_000
  ) {
    return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 });
  }

  try {
    let user;
    try {
      user = await verifyWalletAuth(walletAddress);
    } catch {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } },
      );
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

    return NextResponse.json(
      {
        transactions: pointTransactions,
        totalCount,
        hasMore: offset + limit < totalCount,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );

  } catch (error) {
    console.error('Failed to fetch point transactions:', error);
    return NextResponse.json({ error: 'Failed to fetch point transactions' }, { status: 500 });
  }
}
