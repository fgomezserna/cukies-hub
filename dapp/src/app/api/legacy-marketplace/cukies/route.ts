import { NextRequest, NextResponse } from 'next/server';

import { listLegacyMarketplaceCukies } from '@/lib/legacy-marketplace/data';

export const dynamic = 'force-dynamic';

function getNumberParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const response = await listLegacyMarketplaceCukies({
    limit: getNumberParam(searchParams, 'limit'),
    offset: getNumberParam(searchParams, 'offset'),
    search: searchParams.get('search') ?? undefined,
    network: searchParams.get('network') ?? undefined,
    state: searchParams.get('state') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    owner: searchParams.get('owner') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  });

  return NextResponse.json(response, {
    status: response.source === 'empty' ? 502 : 200,
  });
}
