import { NextRequest, NextResponse } from 'next/server';

import { getCuki } from '@/lib/cukies-data/data';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: Promise<{
    tokenId: string;
  }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { tokenId } = await context.params;
  const item = await getCuki(tokenId);

  if (!item) {
    return NextResponse.json(
      { error: `Cukie ${tokenId} not found` },
      { status: 404 },
    );
  }

  return NextResponse.json({ item });
}
