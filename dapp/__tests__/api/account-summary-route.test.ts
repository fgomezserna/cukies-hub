jest.mock('@/lib/wallet-auth', () => ({
  evmWalletSessionMatchesSignedAddress: jest.fn(),
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/account-summary', () => ({
  getWalletAccountSummary: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/account/v1/summary/route';
import { getWalletAccountSummary } from '@/lib/account-summary';
import {
  evmWalletSessionMatchesSignedAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

const wallet = '0x1111111111111111111111111111111111111111';

function request() {
  return new NextRequest(`http://localhost/api/account/v1/summary?walletAddress=${wallet}`);
}

describe('/api/account/v1/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (readWalletSession as jest.Mock).mockResolvedValue({ walletType: 'evm', signedWalletAddress: wallet });
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(true);
    (getWalletAccountSummary as jest.Mock).mockResolvedValue({
      walletNormalized: wallet,
      chainId: 97,
      network: { chainId: 97, label: 'BNB Smart Chain Testnet' },
      uki: null,
      credits: null,
      cukies: null,
    });
  });

  it('solo devuelve el resumen de la wallet EVM que firmó la sesión', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(evmWalletSessionMatchesSignedAddress).toHaveBeenCalledWith(
      expect.objectContaining({ walletType: 'evm' }),
      wallet,
    );
    expect(getWalletAccountSummary).toHaveBeenCalledWith(wallet);
  });

  it('rechaza una wallet que no coincide con la firma actual antes de consultar datos', async () => {
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(false);

    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'error', code: 'WALLET_SESSION_REQUIRED' });
    expect(getWalletAccountSummary).not.toHaveBeenCalled();
  });
});
