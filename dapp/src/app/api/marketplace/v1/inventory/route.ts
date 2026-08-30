import { NextRequest, NextResponse } from 'next/server';

import { listUkiMarketplaceSellerInventory } from '@/lib/uki-marketplace/inventory';
import {
  UkiMarketplaceUnavailableError,
  UkiMarketplaceValidationError,
} from '@/lib/uki-marketplace/errors';
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
    const items = await listUkiMarketplaceSellerInventory({ walletAddress });
    return response({ status: 'ok', data: { items } });
  } catch (error) {
    if (error instanceof UkiMarketplaceValidationError) {
      return response({ status: 'error', code: 'INVALID_MARKETPLACE_REQUEST' }, 400);
    }
    if (error instanceof UkiMarketplaceUnavailableError) {
      return response({ status: 'error', code: 'UKI_MARKETPLACE_UNAVAILABLE' }, 503);
    }
    return response({ status: 'error', code: 'UKI_MARKETPLACE_UNAVAILABLE' }, 503);
  }
}
