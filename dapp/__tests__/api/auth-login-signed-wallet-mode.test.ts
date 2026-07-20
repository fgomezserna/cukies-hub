const mockPrismaFindUnique = jest.fn();
const mockReadWalletSession = jest.fn();
const mockWalletSessionMatchesAddress = jest.fn();
const mockEvmWalletSessionMatchesSignedAddress = jest.fn();
const mockReadWalletChallenge = jest.fn();
const mockVerifyWalletSignature = jest.fn();
const mockSetWalletSessionCookie = jest.fn();
const mockClearWalletChallengeCookie = jest.fn();
const mockEnsureHubWalletForLogin = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockPrismaFindUnique(...args),
    },
  },
}));

jest.mock('@/lib/wallet-auth', () => ({
  clearWalletChallengeCookie: (...args: unknown[]) => mockClearWalletChallengeCookie(...args),
  evmWalletSessionMatchesSignedAddress: (...args: unknown[]) => (
    mockEvmWalletSessionMatchesSignedAddress(...args)
  ),
  isValidEvmWalletAddress: (walletAddress: string) => (
    /^0x[a-f0-9]{40}$/i.test(walletAddress) &&
    walletAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  ),
  readWalletChallenge: (...args: unknown[]) => mockReadWalletChallenge(...args),
  readWalletSession: (...args: unknown[]) => mockReadWalletSession(...args),
  resolveWalletType: (walletAddress: string, walletType?: string) => (
    walletType === 'tron' || walletAddress.startsWith('T') ? 'tron' : 'evm'
  ),
  setWalletSessionCookie: (...args: unknown[]) => mockSetWalletSessionCookie(...args),
  verifyWalletSignature: (...args: unknown[]) => mockVerifyWalletSignature(...args),
  walletSessionMatchesAddress: (...args: unknown[]) => mockWalletSessionMatchesAddress(...args),
}));

jest.mock('@/lib/user-sync', () => ({
  findOrSyncUserFromCukies: jest.fn(),
}));

jest.mock('@/lib/mongodb-hub', () => ({
  createUserDirectly: jest.fn(),
}));

jest.mock('@/lib/user-wallets', () => ({
  ensureHubWalletForLogin: (...args: unknown[]) => mockEnsureHubWalletForLogin(...args),
}));

import { POST } from '@/app/api/auth/login/route';

const buyerAddress = '0x1111111111111111111111111111111111111111';
const otherAddress = '0x2222222222222222222222222222222222222222';
const sessionUser = {
  id: 'buyer-user',
  walletAddress: buyerAddress,
  username: 'buyer',
  completedQuests: [],
};

function loginRequest(body: Record<string, unknown>) {
  return new Request('https://hub.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/auth/login requireSignedWallet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadWalletSession.mockResolvedValue({
      userId: sessionUser.id,
      walletAddress: buyerAddress,
      signedWalletAddress: otherAddress,
      walletType: 'evm',
    });
    mockWalletSessionMatchesAddress.mockReturnValue(true);
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(false);
    mockPrismaFindUnique.mockResolvedValue(sessionUser);
    mockVerifyWalletSignature.mockResolvedValue(true);
    mockSetWalletSessionCookie.mockResolvedValue(undefined);
    mockClearWalletChallengeCookie.mockResolvedValue(undefined);
    mockEnsureHubWalletForLogin.mockResolvedValue(undefined);
  });

  it('mantiene la reutilizacion legacy de una sesion asociada a la wallet primaria', async () => {
    const response = await POST(loginRequest({ walletAddress: buyerAddress }));

    expect(response.status).toBe(200);
    expect(mockWalletSessionMatchesAddress).toHaveBeenCalled();
    expect(mockEvmWalletSessionMatchesSignedAddress).not.toHaveBeenCalled();
    expect(mockPrismaFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: sessionUser.id },
    }));
  });

  it('no reutiliza la wallet primaria si requireSignedWallet esta activo', async () => {
    const response = await POST(loginRequest({
      walletAddress: buyerAddress,
      walletType: 'evm',
      requireSignedWallet: true,
    }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({
      error: 'Wallet signature is required',
      requiresSignature: true,
    });
    expect(mockEvmWalletSessionMatchesSignedAddress).toHaveBeenCalledWith(
      expect.objectContaining({ signedWalletAddress: otherAddress }),
      buyerAddress,
    );
    expect(mockWalletSessionMatchesAddress).not.toHaveBeenCalled();
    expect(mockPrismaFindUnique).not.toHaveBeenCalled();
  });

  it('reutiliza una sesion EVM solo si la wallet firmada coincide', async () => {
    mockEvmWalletSessionMatchesSignedAddress.mockReturnValue(true);

    const response = await POST(loginRequest({
      walletAddress: buyerAddress,
      walletType: 'evm',
      requireSignedWallet: true,
    }));

    expect(response.status).toBe(200);
    expect(mockPrismaFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: sessionUser.id },
    }));
  });

  it('rechaza el modo estricto para una sesion o solicitud TRON', async () => {
    const response = await POST(loginRequest({
      walletAddress: 'TJRabPrwbZy45sbavfcjinPJC18kjpRTv8',
      walletType: 'tron',
      requireSignedWallet: true,
    }));

    expect(response.status).toBe(400);
    expect(mockReadWalletSession).not.toHaveBeenCalled();
    expect(mockPrismaFindUnique).not.toHaveBeenCalled();
  });

  it('rechaza la zero address antes de autenticarla en modo estricto', async () => {
    const response = await POST(loginRequest({
      walletAddress: '0x0000000000000000000000000000000000000000',
      walletType: 'evm',
      requireSignedWallet: true,
    }));

    expect(response.status).toBe(400);
    expect(mockReadWalletSession).not.toHaveBeenCalled();
    expect(mockVerifyWalletSignature).not.toHaveBeenCalled();
  });

  it('acepta una nueva firma valida despues de rechazar la sesion primaria', async () => {
    const message = 'Cukies signed EVM challenge';
    mockReadWalletChallenge.mockResolvedValue({
      walletAddress: buyerAddress,
      walletType: 'evm',
      message,
    });

    const response = await POST(loginRequest({
      walletAddress: buyerAddress,
      walletType: 'evm',
      message,
      signature: '0xsigned',
      requireSignedWallet: true,
    }));

    expect(response.status).toBe(200);
    expect(mockVerifyWalletSignature).toHaveBeenCalledWith({
      walletAddress: buyerAddress,
      walletType: 'evm',
      message,
      signature: '0xsigned',
    });
    expect(mockSetWalletSessionCookie).toHaveBeenCalledWith({
      userId: sessionUser.id,
      walletAddress: buyerAddress,
      signedWalletAddress: buyerAddress,
      walletType: 'evm',
    });
  });
});
