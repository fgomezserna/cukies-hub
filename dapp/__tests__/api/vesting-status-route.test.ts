jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
  evmWalletSessionMatchesSignedAddress: jest.fn(),
}));
jest.mock('@/lib/vesting-onchain', () => {
  class VestingOnChainUnavailableError extends Error {}
  class VestingOnChainValidationError extends Error {}
  return {
    VestingOnChainUnavailableError,
    VestingOnChainValidationError,
    readWalletVestingStatus: jest.fn(),
  };
});

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/vesting/v1/status/route';
import {
  VestingOnChainUnavailableError,
  readWalletVestingStatus,
} from '@/lib/vesting-onchain';
import {
  evmWalletSessionMatchesSignedAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

const wallet = '0x1111111111111111111111111111111111111111';

describe('GET /api/vesting/v1/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (readWalletSession as jest.Mock).mockResolvedValue({ signedWalletAddress: wallet, walletType: 'evm' });
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(true);
    (readWalletVestingStatus as jest.Mock).mockResolvedValue({
      walletNormalized: wallet,
      chainId: 97,
      totalAmountRaw: '10000',
      releasableRaw: '500',
    });
  });

  function request() {
    return new NextRequest(`http://localhost/api/vesting/v1/status?walletAddress=${wallet}`);
  }

  it('devuelve solo el vesting de la wallet firmante y evita caché privada', async () => {
    const result = await GET(request());

    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(readWalletVestingStatus).toHaveBeenCalledWith(wallet);
    expect(await result.json()).toMatchObject({
      status: 'ok',
      data: { chainId: 97, totalAmountRaw: '10000', releasableRaw: '500' },
    });
  });

  it('rechaza una sesión que no corresponda a la wallet antes de leer BSC', async () => {
    (evmWalletSessionMatchesSignedAddress as jest.Mock).mockReturnValue(false);

    const result = await GET(request());

    expect(result.status).toBe(401);
    expect(readWalletVestingStatus).not.toHaveBeenCalled();
  });

  it('falla cerrado con 503 cuando la lectura on-chain no es verificable', async () => {
    (readWalletVestingStatus as jest.Mock).mockRejectedValue(new VestingOnChainUnavailableError());

    const result = await GET(request());

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ status: 'error', code: 'VESTING_UNAVAILABLE' });
  });
});
