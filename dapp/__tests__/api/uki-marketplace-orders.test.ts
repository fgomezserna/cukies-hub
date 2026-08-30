jest.mock('@/lib/uki-marketplace', () => {
  class UkiMarketplaceUnavailableError extends Error {}
  class UkiMarketplaceValidationError extends Error {}
  return {
    listPublicUkiMarketplaceOrders: jest.fn(),
    listSellerUkiMarketplaceOrders: jest.fn(),
    UkiMarketplaceUnavailableError,
    UkiMarketplaceValidationError,
  };
});
jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
  evmWalletSessionMatchesSignedAddress: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/marketplace/v1/orders/route';
import {
  listPublicUkiMarketplaceOrders,
  listSellerUkiMarketplaceOrders,
  UkiMarketplaceUnavailableError,
} from '@/lib/uki-marketplace';
import {
  evmWalletSessionMatchesSignedAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

const wallet = '0x00000000000000000000000000000000000000aa';

function request(query = '') {
  return new NextRequest(`http://localhost/api/marketplace/v1/orders${query}`);
}

describe('/api/marketplace/v1/orders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listPublicUkiMarketplaceOrders as jest.Mock).mockResolvedValue([{ orderId: '0xpublic' }]);
    (listSellerUkiMarketplaceOrders as jest.Mock).mockResolvedValue([{ orderId: '0xprivate' }]);
    (readWalletSession as jest.Mock).mockResolvedValue({ signedWalletAddress: wallet });
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(true);
  });

  it('returns only live-validated public orders without private cache semantics', async () => {
    const response = await GET(request('?limit=12'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
    expect(listPublicUkiMarketplaceOrders).toHaveBeenCalledWith({ limit: 12 });
    expect(await response.json()).toEqual({
      status: 'ok',
      data: { orders: [{ orderId: '0xpublic' }] },
    });
  });

  it('requires the session to be signed by the seller wallet before returning history', async () => {
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(false);
    const denied = await GET(request(`?scope=seller&walletAddress=${wallet}`));
    expect(denied.status).toBe(401);
    expect(denied.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(listSellerUkiMarketplaceOrders).not.toHaveBeenCalled();

    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(true);
    const allowed = await GET(request(`?scope=seller&walletAddress=${wallet}&limit=20`));
    expect(allowed.status).toBe(200);
    expect(listSellerUkiMarketplaceOrders).toHaveBeenCalledWith({
      walletAddress: wallet,
      limit: 20,
    });
    expect(allowed.headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });

  it('rejects unknown scopes and malformed limits before reading marketplace data', async () => {
    const scope = await GET(request('?scope=all'));
    expect(scope.status).toBe(400);
    expect(await scope.json()).toEqual({ status: 'error', code: 'INVALID_MARKETPLACE_SCOPE' });

    const limit = await GET(request('?limit=1.5'));
    expect(limit.status).toBe(400);
    expect(await limit.json()).toEqual({ status: 'error', code: 'INVALID_MARKETPLACE_REQUEST' });
    expect(listPublicUkiMarketplaceOrders).not.toHaveBeenCalled();
  });

  it('fails closed with a stable 503 code when live verification is unavailable', async () => {
    (listPublicUkiMarketplaceOrders as jest.Mock).mockRejectedValue(
      new UkiMarketplaceUnavailableError(),
    );
    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'UKI_MARKETPLACE_UNAVAILABLE',
    });
  });
});
