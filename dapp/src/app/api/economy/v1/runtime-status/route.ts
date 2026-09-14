import { NextRequest, NextResponse } from 'next/server';

import { verifyWalletAuth } from '@/lib/auth-utils';
import { getAppRuntimeStatus } from '@/lib/app-runtime/server';
import { validCreditWallet } from '@/lib/uki-economy/credits/rules';

export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return result;
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? '';
  let validInput = false;
  try {
    validCreditWallet(walletAddress);
    validInput = true;
  } catch {
    validInput = false;
  }
  if (!validInput) {
    return response({ status: 'error', code: 'INVALID_WALLET' }, 400);
  }

  try {
    await verifyWalletAuth(walletAddress);
  } catch {
    return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
  }

  try {
    const data = await getAppRuntimeStatus(walletAddress);
    return response({ status: 'ok', data });
  } catch {
    return response({ status: 'error', code: 'RUNTIME_STATUS_UNAVAILABLE' }, 503);
  }
}
