import { NextRequest, NextResponse } from 'next/server';

import { verifyWalletAuth } from '@/lib/auth-utils';
import { UkiEconomyError } from '@/lib/uki-economy/errors';
import { listWalletRewardStatus } from '@/lib/uki-economy/rewards';

export const dynamic = 'force-dynamic';

function result(body: unknown, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim();
  if (!walletAddress || walletAddress.length > 80) {
    return result({ status: 'error', code: 'INVALID_WALLET' }, 400);
  }
  try {
    await verifyWalletAuth(walletAddress);
  } catch {
    return result({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
  }
  try {
    const limitText = request.nextUrl.searchParams.get('limit');
    const data = await listWalletRewardStatus({
      walletAddress,
      cursor: request.nextUrl.searchParams.get('cursor'),
      limit: limitText === null ? undefined : Number(limitText),
    });
    return result({ status: 'ok', data });
  } catch (error) {
    if (error instanceof UkiEconomyError && error.code === 'VALIDATION') {
      return result({ status: 'error', code: 'INVALID_REWARD_REQUEST' }, 400);
    }
    if (error instanceof UkiEconomyError && error.code === 'CONFLICT') {
      return result({ status: 'error', code: 'REWARD_DATA_CONFLICT' }, 409);
    }
    return result({ status: 'error', code: 'REWARD_SERVICE_UNAVAILABLE' }, 503);
  }
}
