import { NextRequest, NextResponse } from 'next/server';

import { listLegacyCukiePoints } from '@/lib/legacy-marketplace/data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const wallets = [
    ...searchParams.getAll('wallet'),
    ...(searchParams.get('wallets')?.split(',') ?? []),
  ].filter((wallet) => wallet.trim().length > 0);

  // The new indexer collection is not a complete legacy points projection.
  // Use the inspected historical `points` source and expose its coverage in
  // the response instead of presenting a partial current total as canonical.
  const response = await listLegacyCukiePoints({
    wallets,
    network: searchParams.get('network') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    limit: Number(searchParams.get('limit') ?? 24),
    offset: Number(searchParams.get('offset') ?? 0),
  });

  return NextResponse.json(response);
}
