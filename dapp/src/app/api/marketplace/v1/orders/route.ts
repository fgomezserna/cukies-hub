import { NextRequest, NextResponse } from 'next/server';

import {
  listPublicUkiMarketplaceOrders,
  listSellerUkiMarketplaceOrders,
  UkiMarketplaceUnavailableError,
  UkiMarketplaceValidationError,
} from '@/lib/uki-marketplace';
import {
  evmWalletSessionMatchesSignedAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200, isPrivate = false) {
  const result = NextResponse.json(body, { status });
  result.headers.set(
    'Cache-Control',
    isPrivate ? 'private, no-store, max-age=0' : 'public, max-age=0, must-revalidate',
  );
  return result;
}

function parseLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('limit');
  if (raw === null) return undefined;
  if (!/^\d+$/.test(raw)) throw new UkiMarketplaceValidationError('invalid limit');
  return Number(raw);
}

export async function GET(request: NextRequest) {
  const scope = request.nextUrl.searchParams.get('scope') ?? 'public';
  const isPrivate = scope === 'seller';

  try {
    const limit = parseLimit(request);
    if (scope === 'public') {
      const orders = await listPublicUkiMarketplaceOrders({ limit });
      return response({ status: 'ok', data: { orders } });
    }
    if (scope !== 'seller') {
      return response({ status: 'error', code: 'INVALID_MARKETPLACE_SCOPE' }, 400);
    }

    const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? '';
    const session = await readWalletSession();
    if (!session || !evmWalletSessionMatchesSignedAddress(session, walletAddress)) {
      return response(
        { status: 'error', code: 'WALLET_SESSION_REQUIRED' },
        401,
        true,
      );
    }
    const orders = await listSellerUkiMarketplaceOrders({ walletAddress, limit });
    return response({ status: 'ok', data: { orders } }, 200, true);
  } catch (error) {
    if (error instanceof UkiMarketplaceValidationError) {
      return response({ status: 'error', code: 'INVALID_MARKETPLACE_REQUEST' }, 400, isPrivate);
    }
    if (error instanceof UkiMarketplaceUnavailableError) {
      return response({ status: 'error', code: 'UKI_MARKETPLACE_UNAVAILABLE' }, 503, isPrivate);
    }
    return response({ status: 'error', code: 'UKI_MARKETPLACE_UNAVAILABLE' }, 503, isPrivate);
  }
}
