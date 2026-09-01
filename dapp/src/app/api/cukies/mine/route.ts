import { NextRequest, NextResponse } from 'next/server';

import { verifyWalletAuth } from '@/lib/auth-utils';
import { listMyCukieCollection } from '@/lib/cukies-data/my-collection';
import { UkiEconomyError } from '@/lib/uki-economy/errors';

export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return result;
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? '';
  if (!walletAddress || walletAddress.length > 80) {
    return response({ status: 'error', code: 'INVALID_WALLET' }, 400);
  }
  try {
    await verifyWalletAuth(walletAddress);
  } catch {
    return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
  }
  try {
    return response({ status: 'ok', data: await listMyCukieCollection(walletAddress) });
  } catch (error) {
    if (error instanceof UkiEconomyError && error.code === 'VALIDATION') {
      return response({ status: 'error', code: 'INVALID_WALLET' }, 400);
    }
    return response({ status: 'error', code: 'CUKIE_COLLECTION_UNAVAILABLE' }, 503);
  }
}
