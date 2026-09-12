import { NextRequest, NextResponse } from 'next/server';

import { getLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { tokenId } = await context.params;
  const item = await getLegacyMarketplaceCuki(tokenId, {
    network: request.nextUrl.searchParams.get('network') ?? undefined,
    chainId: request.nextUrl.searchParams.get('chainId') ?? undefined,
    collection: request.nextUrl.searchParams.get('collection') ?? undefined,
  });

  if (!item) {
    return NextResponse.json(
      { error: `Cukie ${tokenId} not found` },
      { status: 404 },
    );
  }

  return NextResponse.json({ item });
}
