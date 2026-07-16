const mockGetPresaleReferralStatus = jest.fn();
const mockReadWalletSession = jest.fn();
const mockEvmWalletSessionMatchesSignedAddress = jest.fn();
const mockIsValidEvmWalletAddress = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

jest.mock('@/lib/presale-referrals', () => ({
  getPresaleReferralStatus: (...args: unknown[]) => mockGetPresaleReferralStatus(...args),
}));

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: (...args: unknown[]) => mockReadWalletSession(...args),
  evmWalletSessionMatchesSignedAddress: (...args: unknown[]) => (
    mockEvmWalletSessionMatchesSignedAddress(...args)
  ),
  isValidEvmWalletAddress: (...args: unknown[]) => mockIsValidEvmWalletAddress(...args),
}));

import { GET } from '@/app/api/presale/referral/status/route';

const baseStatus = {
  walletAddress: '0x1111111111111111111111111111111111111111',
  normalizedWalletAddress: '0x1111111111111111111111111111111111111111',
  totalUkiPurchased: 0,
  referralLink: null,
};

const buyerAddress = '0x1111111111111111111111111111111111111111';

describe('/api/presale/referral/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPresaleReferralStatus.mockResolvedValue(baseStatus);
    mockReadWalletSession.mockResolvedValue({
      userId: 'buyer-user',
      walletAddress: buyerAddress,
      signedWalletAddress: buyerAddress,
      walletType: 'evm',
    });
    mockIsValidEvmWalletAddress.mockReturnValue(true);
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(true);
  });

  it('consulta estado solo para la wallet EVM firmada', async () => {
    const response = await GET(new Request(
      `https://cukies.world/api/presale/referral/status?walletAddress=${buyerAddress}`,
    ) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockEvmWalletSessionMatchesSignedAddress).toHaveBeenCalledWith(
      expect.objectContaining({ signedWalletAddress: buyerAddress, walletType: 'evm' }),
      buyerAddress,
    );
    expect(mockGetPresaleReferralStatus).toHaveBeenCalledWith(
      buyerAddress,
      'https://cukies.world',
    );
    expect(body).toEqual(baseStatus);
    expect(body).not.toHaveProperty('referralAttribution');
  });

  it('ignora applyReferral y nunca convierte GET en una mutacion', async () => {
    const response = await GET(new Request(
      `https://cukies.world/api/presale/referral/status?walletAddress=${buyerAddress}&applyReferral=1`,
    ) as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockGetPresaleReferralStatus).toHaveBeenCalledTimes(1);
    expect(body).toEqual(baseStatus);
  });

  it('rechaza una direccion que no sea EVM valida antes de leer la sesion', async () => {
    mockIsValidEvmWalletAddress.mockReturnValue(false);

    const response = await GET(new Request(
      'https://cukies.world/api/presale/referral/status?walletAddress=TInvalidForEvm',
    ) as never);

    expect(response.status).toBe(400);
    expect(mockReadWalletSession).not.toHaveBeenCalled();
    expect(mockGetPresaleReferralStatus).not.toHaveBeenCalled();
  });

  it.each([
    ['sesion TRON', { walletType: 'tron', signedWalletAddress: 'TSessionAddress' }],
    ['wallet primaria sin firma', {
      walletType: 'evm',
      walletAddress: buyerAddress,
      signedWalletAddress: '0x2222222222222222222222222222222222222222',
    }],
  ])('rechaza %s aunque walletAddress coincida en otro campo', async (_label, sessionPatch) => {
    mockReadWalletSession.mockResolvedValue({
      userId: 'buyer-user',
      walletAddress: buyerAddress,
      ...sessionPatch,
    });
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(false);

    const response = await GET(new Request(
      `https://cukies.world/api/presale/referral/status?walletAddress=${buyerAddress}`,
    ) as never);

    expect(response.status).toBe(401);
    expect(mockGetPresaleReferralStatus).not.toHaveBeenCalled();
  });
});
