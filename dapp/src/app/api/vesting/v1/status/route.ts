import { NextRequest, NextResponse } from 'next/server';

import {
  VestingOnChainUnavailableError,
  VestingOnChainValidationError,
  readWalletVestingStatus,
} from '@/lib/vesting-onchain';
import {
  evmWalletSessionMatchesSignedAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return result;
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? '';
  const session = await readWalletSession();
  if (!session || !evmWalletSessionMatchesSignedAddress(session, walletAddress)) {
    return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
  }
  try {
    const status = await readWalletVestingStatus(walletAddress);
    return response({ status: 'ok', data: status });
  } catch (error) {
    if (error instanceof VestingOnChainValidationError) {
      return response({ status: 'error', code: 'INVALID_VESTING_REQUEST' }, 400);
    }
    if (error instanceof VestingOnChainUnavailableError) {
      return response({ status: 'error', code: 'VESTING_UNAVAILABLE' }, 503);
    }
    return response({ status: 'error', code: 'VESTING_UNAVAILABLE' }, 503);
  }
}
