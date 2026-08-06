jest.mock('@/lib/auth-utils', () => ({ verifyWalletAuth: jest.fn() }));
jest.mock('@/lib/uki-economy/rewards', () => ({ listWalletRewardStatus: jest.fn() }));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/economy/v1/rewards/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { listWalletRewardStatus } from '@/lib/uki-economy/rewards';

const wallet = '0x1111111111111111111111111111111111111111';

describe('GET /api/economy/v1/rewards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyWalletAuth as jest.Mock).mockResolvedValue({ id: 'user-1' });
    (listWalletRewardStatus as jest.Mock).mockResolvedValue({
      walletNormalized: wallet,
      allocations: [],
      claims: [],
      claimableRaw: '0',
      claimPublished: false,
      healthy: true,
    });
  });

  it('returns a no-store wallet-scoped view and never invents a published claim', async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/rewards?walletAddress=${wallet}&limit=20`,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(verifyWalletAuth).toHaveBeenCalledWith(wallet);
    expect(listWalletRewardStatus).toHaveBeenCalledWith({
      walletAddress: wallet,
      cursor: null,
      limit: 20,
    });
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: { claimableRaw: '0', claimPublished: false },
    });
  });

  it('requires the matching wallet session', async () => {
    (verifyWalletAuth as jest.Mock).mockRejectedValue(new Error('no session'));
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/rewards?walletAddress=${wallet}`,
    ));
    expect(response.status).toBe(401);
    expect(listWalletRewardStatus).not.toHaveBeenCalled();
  });

  it('propaga batch y proof validados cuando existe un claim publicado', async () => {
    (listWalletRewardStatus as jest.Mock).mockResolvedValue({
      walletNormalized: wallet,
      allocations: [],
      claims: [],
      claimableRaw: '7500',
      claimPublished: true,
      claimables: [{
        batch: { batchId: `0x${'a'.repeat(64)}`, amountRaw: '7500', chainId: 56 },
        proof: { leaf: `0x${'b'.repeat(64)}`, siblings: [] },
        onChainStatus: 'claimable',
      }],
    });
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/rewards?walletAddress=${wallet}`,
    ));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: {
        claimableRaw: '7500',
        claimPublished: true,
        claimables: [{
          batch: { amountRaw: '7500', chainId: 56 },
          proof: { siblings: [] },
          onChainStatus: 'claimable',
        }],
      },
    });
  });
});
