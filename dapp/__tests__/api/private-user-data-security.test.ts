const mockVerifyWalletAuth = jest.fn();
const mockPointTransactions = jest.fn();
const mockPointCount = jest.fn();
const mockFindUser = jest.fn();

jest.mock('@/lib/auth-utils', () => ({
  verifyWalletAuth: (...args: unknown[]) => mockVerifyWalletAuth(...args),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockFindUser(...args) },
    pointTransaction: {
      findMany: (...args: unknown[]) => mockPointTransactions(...args),
      count: (...args: unknown[]) => mockPointCount(...args),
    },
  },
}));

import { GET as getPoints } from '@/app/api/points/route';
import { GET as getDailyStatus } from '@/app/api/points/daily-status/route';
import { GET as getReferrals } from '@/app/api/referrals/route';

describe('private user data ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyWalletAuth.mockRejectedValue(new Error('Wallet session is required'));
  });

  it.each([
    ['points history', getPoints, '/api/points?walletAddress=0xabc'],
    ['daily status', getDailyStatus, '/api/points/daily-status?walletAddress=0xabc'],
    ['referral details', getReferrals, '/api/referrals?walletAddress=0xabc'],
  ])('does not expose %s for an arbitrary wallet query', async (_label, handler, path) => {
    const response = await handler(new Request(`http://localhost${path}`) as never);

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(mockVerifyWalletAuth).toHaveBeenCalledWith('0xabc');
    expect(mockFindUser).not.toHaveBeenCalled();
    expect(mockPointTransactions).not.toHaveBeenCalled();
    expect(mockPointCount).not.toHaveBeenCalled();
  });
});
