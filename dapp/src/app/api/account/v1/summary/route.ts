import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';

import { getWalletAccountSummary } from '@/lib/account-summary';
import { evmWalletSessionMatchesSignedAddress, readWalletSession } from '@/lib/wallet-auth';

export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return result;
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? '';
  if (!walletAddress || !isAddress(walletAddress)) {
    return response({ status: 'error', code: 'INVALID_WALLET' }, 400);
  }

  try {
    const session = await readWalletSession();
    if (!session || !evmWalletSessionMatchesSignedAddress(session, walletAddress)) {
      return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
    }
  } catch {
    return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
  }

  try {
    return response({ status: 'ok', data: await getWalletAccountSummary(walletAddress) });
  } catch {
    return response({ status: 'error', code: 'ACCOUNT_SUMMARY_UNAVAILABLE' }, 503);
  }
}
