jest.mock('@/lib/uki-marketplace/inventory', () => ({
  listUkiMarketplaceSellerInventory: jest.fn(),
}));
jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
  evmWalletSessionMatchesSignedAddress: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/marketplace/v1/inventory/route';
import { listUkiMarketplaceSellerInventory } from '@/lib/uki-marketplace/inventory';
import {
  evmWalletSessionMatchesSignedAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

const wallet = '0x00000000000000000000000000000000000000aa';

function request(walletAddress = wallet) {
  return new NextRequest(
    `http://localhost/api/marketplace/v1/inventory?walletAddress=${walletAddress}`,
  );
}

describe('/api/marketplace/v1/inventory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (readWalletSession as jest.Mock).mockResolvedValue({
      walletType: 'evm',
      signedWalletAddress: wallet,
    });
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(true);
    (listUkiMarketplaceSellerInventory as jest.Mock).mockResolvedValue([
      { assetId: 'asset-73', tokenId: '73' },
    ]);
  });

  it('devuelve solo el inventario privado de la wallet firmante', async () => {
    const result = await GET(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(listUkiMarketplaceSellerInventory).toHaveBeenCalledWith({ walletAddress: wallet });
    expect(await result.json()).toEqual({
      status: 'ok',
      data: { items: [{ assetId: 'asset-73', tokenId: '73' }] },
    });
  });

  it('rechaza otra wallet antes de consultar el inventario', async () => {
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(false);
    const result = await GET(request('0x00000000000000000000000000000000000000bb'));
    expect(result.status).toBe(401);
    expect(listUkiMarketplaceSellerInventory).not.toHaveBeenCalled();
    expect(await result.json()).toEqual({ status: 'error', code: 'WALLET_SESSION_REQUIRED' });
  });
});
