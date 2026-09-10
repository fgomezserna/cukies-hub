import { NextRequest, NextResponse } from 'next/server';

import { listLegacyCukiePoints } from '@/lib/legacy-marketplace/data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const wallets = [
    ...searchParams.getAll('wallet'),
    ...(searchParams.get('wallets')?.split(',') ?? []),
  ].filter((wallet) => wallet.trim().length > 0);

  // The current indexer point_transactions collection is not populated for
  // Legacy history. Use the reconciled historical `points` source explicitly;
  // the adapter marks its coverage as partial instead of presenting it as a
  // current cross-source projection.
  const response = await listLegacyCukiePoints({
    wallets,
    network: searchParams.get('network') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    limit: Number(searchParams.get('limit') ?? 24),
    offset: Number(searchParams.get('offset') ?? 0),
  });

  return NextResponse.json(response);
}
