const mockCookies = jest.fn();
const mockApplyPresaleReferralCode = jest.fn();
const mockGetPresaleReferralStatus = jest.fn();

jest.mock('next/headers', () => ({
  cookies: (...args: unknown[]) => mockCookies(...args),
}));

jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

jest.mock('@/lib/presale-referrals', () => ({
  applyPresaleReferralCode: (...args: unknown[]) => mockApplyPresaleReferralCode(...args),
  getPresaleReferralStatus: (...args: unknown[]) => mockGetPresaleReferralStatus(...args),
}));

import { GET } from '@/app/api/presale/referral/status/route';

function createCookieStore(referralCode?: string) {
  return {
    get: jest.fn((name: string) => (
      name === 'ukiReferralCode' && referralCode
        ? { value: referralCode }
        : undefined
    )),
    set: jest.fn(),
  };
}

const baseStatus = {
  walletAddress: '0xbuyer',
  normalizedWalletAddress: '0xbuyer',
  totalUkiPurchased: 0,
  referralLink: null,
};

describe('/api/presale/referral/status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPresaleReferralStatus.mockResolvedValue(baseStatus);
  });

  it('no consume la cookie de referido en una consulta pasiva de estado', async () => {
    const cookieStore = createCookieStore('uki-sponsor');
    mockCookies.mockResolvedValue(cookieStore);

    const response = await GET(new Request(
      'https://cukies.world/api/presale/referral/status?walletAddress=0xbuyer',
    ) as never);
    const body = await response.json();

    expect(mockApplyPresaleReferralCode).not.toHaveBeenCalled();
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(body.referralAttribution).toBeNull();
  });

  it('aplica y borra la cookie cuando el caller pide atribucion explicita', async () => {
    const cookieStore = createCookieStore('uki-sponsor');
    mockCookies.mockResolvedValue(cookieStore);
    mockApplyPresaleReferralCode.mockResolvedValue({ applied: true, pendingSponsorCode: 'uki-sponsor' });

    const response = await GET(new Request(
      'https://cukies.world/api/presale/referral/status?walletAddress=0xbuyer&applyReferral=1',
    ) as never);
    const body = await response.json();

    expect(mockApplyPresaleReferralCode).toHaveBeenCalledWith('0xbuyer', 'uki-sponsor');
    expect(cookieStore.set).toHaveBeenCalledWith('ukiReferralCode', '', {
      expires: expect.any(Date),
      path: '/',
    });
    expect(body.referralAttribution).toEqual({ applied: true, pendingSponsorCode: 'uki-sponsor' });
  });

  it('conserva la cookie si la atribucion explicita no se pudo aplicar', async () => {
    const cookieStore = createCookieStore('uki-sponsor');
    mockCookies.mockResolvedValue(cookieStore);
    mockApplyPresaleReferralCode.mockResolvedValue({
      applied: false,
      reason: 'invalid_or_locked_code',
    });

    const response = await GET(new Request(
      'https://cukies.world/api/presale/referral/status?walletAddress=0xbuyer&applyReferral=1',
    ) as never);
    const body = await response.json();

    expect(mockApplyPresaleReferralCode).toHaveBeenCalledWith('0xbuyer', 'uki-sponsor');
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect(body.referralAttribution).toEqual({
      applied: false,
      reason: 'invalid_or_locked_code',
    });
  });
});
