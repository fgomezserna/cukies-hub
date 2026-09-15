import { NextRequest, NextResponse } from 'next/server';

import { getCuki } from '@/lib/cukies-data/data';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { tokenId } = await context.params;
  const searchParams = request.nextUrl.searchParams;
  const item = await getCuki(tokenId, {
    network: searchParams.get('network') ?? undefined,
    collection: searchParams.get('collection')
      ?? searchParams.get('collectionAddress')
      ?? undefined,
    chainId: searchParams.get('chainId'),
  });

  if (!item) {
    return NextResponse.json(
      { error: `Cukie ${tokenId} not found` },
      { status: 404 },
    );
  }

  return NextResponse.json({ item });
}
