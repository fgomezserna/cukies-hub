const mockApplyPresaleReferralCode = jest.fn();
const mockCookies = jest.fn();
const mockReadWalletSession = jest.fn();
const mockEvmWalletSessionMatchesSignedAddress = jest.fn();
const mockIsValidEvmWalletAddress = jest.fn();

jest.mock('next/headers', () => ({
  cookies: (...args: unknown[]) => mockCookies(...args),
}));

jest.mock('@/lib/presale-referrals', () => ({
  applyPresaleReferralCode: (...args: unknown[]) => mockApplyPresaleReferralCode(...args),
}));
jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: (...args: unknown[]) => mockReadWalletSession(...args),
  evmWalletSessionMatchesSignedAddress: (...args: unknown[]) => (
    mockEvmWalletSessionMatchesSignedAddress(...args)
  ),
  isValidEvmWalletAddress: (...args: unknown[]) => mockIsValidEvmWalletAddress(...args),
}));

import { POST } from '@/app/api/presale/referral/attribution/route';

const buyerAddress = '0x1111111111111111111111111111111111111111';
const bodyReferralCode = 'uki-0123456789';
const cookieReferralCode = 'uki-abcdef1234';

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

function createRequest(body: Record<string, unknown>) {
  return new Request('https://hub.test/api/presale/referral/attribution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as never;
}

describe('/api/presale/referral/attribution wallet auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadWalletSession.mockResolvedValue({
      userId: 'buyer-user',
      walletAddress: buyerAddress,
      signedWalletAddress: buyerAddress,
      walletType: 'evm',
    });
    mockIsValidEvmWalletAddress.mockReturnValue(true);
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(true);
    mockCookies.mockResolvedValue(createCookieStore());
    mockApplyPresaleReferralCode.mockResolvedValue({ applied: true });
  });

  it('rechaza atribuir sponsor a una wallet ajena', async () => {
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(false);
    const response = await POST(createRequest({
      walletAddress: buyerAddress,
      referralCode: bodyReferralCode,
    }));

    expect(response.status).toBe(401);
    expect(mockApplyPresaleReferralCode).not.toHaveBeenCalled();
  });

  it('aplica el codigo valido del body para la wallet EVM firmada', async () => {
    const response = await POST(createRequest({
      walletAddress: buyerAddress,
      referralCode: bodyReferralCode,
    }));

    expect(response.status).toBe(200);
    expect(mockApplyPresaleReferralCode).toHaveBeenCalledWith(buyerAddress, bodyReferralCode);
  });

  it('usa la cookie HTTP-only cuando el body no incluye codigo', async () => {
    const cookieStore = createCookieStore(cookieReferralCode);
    mockCookies.mockResolvedValue(cookieStore);

    const response = await POST(createRequest({ walletAddress: buyerAddress }));

    expect(response.status).toBe(200);
    expect(mockApplyPresaleReferralCode).toHaveBeenCalledWith(buyerAddress, cookieReferralCode);
  });

  it('prioriza el codigo valido del body sobre la cookie', async () => {
    const cookieStore = createCookieStore(cookieReferralCode);
    mockCookies.mockResolvedValue(cookieStore);

    await POST(createRequest({
      walletAddress: buyerAddress,
      referralCode: bodyReferralCode,
    }));

    expect(mockApplyPresaleReferralCode).toHaveBeenCalledWith(buyerAddress, bodyReferralCode);
  });

  it('borra la cookie solo despues de aplicar la atribucion', async () => {
    const cookieStore = createCookieStore(cookieReferralCode);
    mockCookies.mockResolvedValue(cookieStore);

    await POST(createRequest({ walletAddress: buyerAddress }));

    expect(cookieStore.set).toHaveBeenCalledWith(
      'ukiReferralCode',
      '',
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        expires: expect.any(Date),
      }),
    );

    jest.clearAllMocks();
    const retainedCookieStore = createCookieStore(cookieReferralCode);
    mockCookies.mockResolvedValue(retainedCookieStore);
    mockReadWalletSession.mockResolvedValue({ signedWalletAddress: buyerAddress, walletType: 'evm' });
    mockIsValidEvmWalletAddress.mockReturnValue(true);
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(true);
    mockApplyPresaleReferralCode.mockResolvedValue({
      applied: false,
      reason: 'purchase_status_unavailable',
    });

    await POST(createRequest({ walletAddress: buyerAddress }));

    expect(retainedCookieStore.set).not.toHaveBeenCalled();
  });

  it('no bloquea una compra cuando no existe codigo de referido', async () => {
    const response = await POST(createRequest({ walletAddress: buyerAddress }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ applied: false, reason: 'no_referral_code' });
    expect(mockApplyPresaleReferralCode).not.toHaveBeenCalled();
  });

  it('rechaza direcciones no EVM antes de consultar la sesion', async () => {
    mockIsValidEvmWalletAddress.mockReturnValue(false);

    const response = await POST(createRequest({
      walletAddress: 'TInvalidForEvm',
      referralCode: bodyReferralCode,
    }));

    expect(response.status).toBe(400);
    expect(mockReadWalletSession).not.toHaveBeenCalled();
  });

  it('no filtra detalles internos en errores 500', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockApplyPresaleReferralCode.mockRejectedValue(
      new Error('mongodb://user:password@private-host/presale'),
    );

    const response = await POST(createRequest({
      walletAddress: buyerAddress,
      referralCode: bodyReferralCode,
    }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(body)).not.toContain('private-host');
    consoleError.mockRestore();
  });
});
