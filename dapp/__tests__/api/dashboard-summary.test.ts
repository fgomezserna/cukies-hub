import { GET } from '@/app/api/dashboard/v1/summary/route';
import { getDashboardSummary } from '@/lib/dashboard/server';
import { prisma } from '@/lib/prisma';
import { readWalletSession } from '@/lib/wallet-auth';

jest.mock('@/lib/dashboard/server', () => ({
  getDashboardSummary: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock('@/lib/wallet-auth', () => ({
  isValidEvmWalletAddress: (value: unknown) => (
    typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value)
  ),
  readWalletSession: jest.fn(),
}));

const mockReadWalletSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockGetDashboardSummary = getDashboardSummary as jest.MockedFunction<typeof getDashboardSummary>;
const mockFindUser = prisma.user.findUnique as jest.Mock;
const signedWallet = '0x1111111111111111111111111111111111111111';

function session(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    walletAddress: '0x2222222222222222222222222222222222222222',
    signedWalletAddress: signedWallet,
    walletType: 'evm' as const,
    issuedAt: '2026-08-30T10:00:00.000Z',
    expiresAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('GET /api/dashboard/v1/summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = 'staging';
    process.env.NEXT_PUBLIC_APP_ENV = 'staging';
    process.env.STAGING_ONLY_GUARD = 'true';
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = '97';
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '97';
    mockReadWalletSession.mockResolvedValue(session());
    mockFindUser.mockResolvedValue({ username: 'tester' });
    mockGetDashboardSummary.mockResolvedValue({ schemaVersion: 'dashboard-staging-v1' } as never);
  });

  it('exige una sesión EVM firmada', async () => {
    mockReadWalletSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'error', code: 'WALLET_SESSION_REQUIRED' });
    expect(mockGetDashboardSummary).not.toHaveBeenCalled();
  });

  it('rechaza una sesión Tron aunque pertenezca a una cuenta', async () => {
    mockReadWalletSession.mockResolvedValue(session({ walletType: 'tron' }) as never);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mockFindUser).not.toHaveBeenCalled();
  });

  it('falla cerrado fuera de Stage y chain 97', async () => {
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = '56';

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error', code: 'DASHBOARD_RUNTIME_UNAVAILABLE' });
    expect(mockFindUser).not.toHaveBeenCalled();
  });

  it('deriva la identidad de la wallet firmante y devuelve no-store', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(mockGetDashboardSummary).toHaveBeenCalledWith({
      runtime: { environment: 'staging', chainId: 97 },
      identity: {
        username: 'tester',
        walletNormalized: signedWallet,
        sessionExpiresAt: '2026-09-30T10:00:00.000Z',
      },
    });
    expect(await response.json()).toEqual({
      status: 'ok',
      data: { schemaVersion: 'dashboard-staging-v1' },
    });
  });

  it('no filtra errores internos de agregación', async () => {
    mockGetDashboardSummary.mockRejectedValue(new Error('secret mongo topology'));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'error', code: 'DASHBOARD_UNAVAILABLE' });
  });
});
