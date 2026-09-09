import { NextRequest, NextResponse } from 'next/server';

import { reconcileLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';
import { getLegacyMarketplaceCollection } from '@/lib/legacy-marketplace/identity';
import type { LegacyCukiNetwork } from '@/lib/legacy-marketplace/types';

export const dynamic = 'force-dynamic';

function response(body: unknown, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'no-store');
  return result;
}

function isExpectedCollection(
  network: LegacyCukiNetwork,
  collection: string,
) {
  const expected = getLegacyMarketplaceCollection(network);
  if (!expected) return false;
  return network === 'BSC'
    ? collection.toLowerCase() === expected.toLowerCase()
    : collection === expected;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const tokenId = typeof body.tokenId === 'string' ? body.tokenId : '';
    const network = body.network === 'BSC' || body.network === 'TRON'
      ? body.network
      : null;
    const collection = typeof body.collection === 'string' ? body.collection : '';
    if (
      body.source !== 'legacy'
      || !/^\d{1,78}$/.test(tokenId)
      || !network
      || !isExpectedCollection(network, collection)
    ) {
      return response({ status: 'error', code: 'INVALID_RECONCILIATION_REQUEST' }, 400);
    }
    const result = await reconcileLegacyMarketplaceCuki(tokenId, network);
    if (!result) {
      return response({ status: 'error', code: 'LEGACY_CUKI_NOT_FOUND' }, 404);
    }
    return response({
      status: 'ok',
      data: {
        item: result.item,
        changed: result.changed,
        paused: result.paused,
      },
    }, 200);
  } catch {
    return response({ status: 'error', code: 'LEGACY_RECONCILIATION_UNAVAILABLE' }, 503);
  }
}
