import { NextRequest, NextResponse } from 'next/server';

import { listCukiePoints } from '@/lib/cukies-data/data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const wallets = [
    ...searchParams.getAll('wallet'),
    ...(searchParams.get('wallets')?.split(',') ?? []),
  ].filter((wallet) => wallet.trim().length > 0);

  const response = await listCukiePoints({
    wallets,
    network: searchParams.get('network') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    limit: Number(searchParams.get('limit') ?? 24),
    offset: Number(searchParams.get('offset') ?? 0),
  });

  return NextResponse.json(response);
}
