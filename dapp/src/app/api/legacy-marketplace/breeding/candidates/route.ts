import { NextRequest, NextResponse } from 'next/server';

import { listLegacyBreedingCandidates } from '@/lib/legacy-marketplace/data';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const maxBreeds = searchParams.get('maxBreeds');

  const response = await listLegacyBreedingCandidates({
    owner: searchParams.get('owner') ?? undefined,
    network: searchParams.get('network') ?? undefined,
    maxBreeds: maxBreeds !== null ? Number(maxBreeds) : undefined,
    limit: Number(searchParams.get('limit') ?? 60),
  });

  return NextResponse.json(response);
}
