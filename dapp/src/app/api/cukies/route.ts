import { NextRequest, NextResponse } from 'next/server';

import { listCukies } from '@/lib/cukies-data/data';

export const dynamic = 'force-dynamic';

function getNumberParam(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  if (!value) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const response = await listCukies({
    limit: getNumberParam(searchParams, 'limit'),
    offset: getNumberParam(searchParams, 'offset'),
    search: searchParams.get('search') ?? undefined,
    network: searchParams.get('network') ?? undefined,
    state: searchParams.get('state') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    generation: searchParams.get('generation') ?? undefined,
    owner: searchParams.get('owner') ?? undefined,
    sort: searchParams.get('sort') ?? undefined,
  });

  return NextResponse.json(response);
}
