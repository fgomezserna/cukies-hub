import { readWalletSession } from '@/lib/wallet-auth';
import { getAmbassadorDashboard } from '@/lib/uki-economy/ambassadors/public';
import { GET } from '@/app/api/economy/v1/ambassadors/summary/route';

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));
jest.mock('@/lib/uki-economy/ambassadors/public', () => ({
  getAmbassadorDashboard: jest.fn(),
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const mockSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockDashboard = getAmbassadorDashboard as jest.MockedFunction<typeof getAmbassadorDashboard>;

describe('ambassador summary API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = 'production';
    process.env.STAGING_ONLY_GUARD = 'false';
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = '56';
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '56';
    mockSession.mockResolvedValue({
      userId: 'user-1',
      walletAddress: WALLET,
      signedWalletAddress: WALLET,
      walletType: 'evm',
      issuedAt: '2026-09-02T10:00:00.000Z',
      expiresAt: '2026-09-03T10:00:00.000Z',
    });
    mockDashboard.mockResolvedValue({
      walletNormalized: WALLET,
      profile: { invitationCode: 'cw-123456789abc' },
      ownAttribution: null,
      referrals: [],
      commissions: {
        totals: {
          totalRaw: '0',
          pendingRaw: '0',
          claimableRaw: '0',
          claimedRaw: '0',
          expiredRaw: '0',
        },
        history: [],
      },
    });
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.STAGING_ONLY_GUARD;
    delete process.env.NEXT_PUBLIC_UKI_CHAIN_ID;
    delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
  });

  it('devuelve el panel únicamente para la wallet EVM firmada', async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(mockDashboard).toHaveBeenCalledWith(WALLET);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      policy: { version: 'ambassador-direct-v1', commissionBps: 500, levels: 1 },
      dashboard: { walletNormalized: WALLET, profile: { invitationCode: 'cw-123456789abc' } },
    });
  });

  it('rechaza consultas sin sesión firmada antes de tocar Mongo', async () => {
    mockSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ status: 'error', code: 'AUTH_REQUIRED' });
    expect(mockDashboard).not.toHaveBeenCalled();
  });

  it('falla cerrado si la red configurada no coincide con producción', async () => {
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '97';

    const response = await GET();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'AMBASSADOR_RUNTIME_MISCONFIGURED',
    });
    expect(mockSession).not.toHaveBeenCalled();
  });
});
