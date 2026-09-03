const mockFindUnique = jest.fn();
const mockReadWalletSession = jest.fn();
const mockReadWalletChallenge = jest.fn();
const mockVerifyWalletSignature = jest.fn();
const mockSetWalletSessionCookie = jest.fn();
const mockClearWalletChallengeCookie = jest.fn();
const mockFindOrSyncUserFromCukies = jest.fn();
const mockCreateUserDirectly = jest.fn();
const mockEnsureHubWalletForLogin = jest.fn();
const mockFindHubUserIdByLegacyWallets = jest.fn();

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

jest.mock('@/lib/wallet-auth', () => ({
  clearWalletChallengeCookie: (...args: unknown[]) => mockClearWalletChallengeCookie(...args),
  evmWalletSessionMatchesSignedAddress: jest.fn(() => false),
  isValidEvmWalletAddress: (walletAddress: string) => (
    /^0x[a-f0-9]{40}$/i.test(walletAddress)
    && walletAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  ),
  readWalletChallenge: (...args: unknown[]) => mockReadWalletChallenge(...args),
  readWalletSession: (...args: unknown[]) => mockReadWalletSession(...args),
  resolveWalletType: (walletAddress: string, walletType?: string) => (
    walletType === 'tron' || walletAddress.startsWith('T') ? 'tron' : 'evm'
  ),
  setWalletSessionCookie: (...args: unknown[]) => mockSetWalletSessionCookie(...args),
  verifyWalletSignature: (...args: unknown[]) => mockVerifyWalletSignature(...args),
  walletSessionMatchesAddress: jest.fn(() => false),
}));

jest.mock('@/lib/user-sync', () => ({
  findOrSyncUserFromCukies: (...args: unknown[]) => mockFindOrSyncUserFromCukies(...args),
}));

jest.mock('@/lib/mongodb-hub', () => ({
  createUserDirectly: (...args: unknown[]) => mockCreateUserDirectly(...args),
}));

jest.mock('@/lib/user-wallets', () => ({
  ensureHubWalletForLogin: (...args: unknown[]) => mockEnsureHubWalletForLogin(...args),
  findHubUserIdByLegacyWallets: (...args: unknown[]) => (
    mockFindHubUserIdByLegacyWallets(...args)
  ),
}));

import { POST } from '@/app/api/auth/login/route';

const walletAddress = '0x1111111111111111111111111111111111111111';
const message = 'Cukies wallet login challenge';
const signature = '0xsigned';
const user = {
  id: 'user-1',
  walletAddress,
  username: walletAddress,
  completedQuests: [],
};

function request(body: unknown) {
  return new Request('https://hub.test/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function signedBody(overrides: Record<string, unknown> = {}) {
  return {
    walletAddress,
    walletType: 'evm',
    message,
    signature,
    ...overrides,
  };
}

describe('API /auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadWalletSession.mockResolvedValue(null);
    mockReadWalletChallenge.mockResolvedValue({
      walletAddress,
      walletType: 'evm',
      message,
    });
    mockVerifyWalletSignature.mockResolvedValue(true);
    mockSetWalletSessionCookie.mockResolvedValue(undefined);
    mockClearWalletChallengeCookie.mockResolvedValue(undefined);
    mockFindOrSyncUserFromCukies.mockResolvedValue(null);
    mockCreateUserDirectly.mockResolvedValue('user-1');
    mockEnsureHubWalletForLogin.mockResolvedValue(undefined);
    mockFindHubUserIdByLegacyWallets.mockResolvedValue(null);
  });

  it('devuelve el usuario existente tras validar la firma', async () => {
    mockFindUnique.mockResolvedValue(user);

    const response = await POST(request(signedBody()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(user);
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { walletAddress },
      include: {
        lastCheckIn: true,
        completedQuests: { include: { quest: true } },
      },
    });
    expect(mockVerifyWalletSignature).toHaveBeenCalledWith({
      walletAddress,
      walletType: 'evm',
      message,
      signature,
    });
    expect(mockEnsureHubWalletForLogin).toHaveBeenCalledWith(user.id, walletAddress, 'evm');
    expect(mockSetWalletSessionCookie).toHaveBeenCalledWith({
      userId: user.id,
      walletAddress,
      signedWalletAddress: walletAddress,
      walletType: 'evm',
    });
    expect(mockClearWalletChallengeCookie).toHaveBeenCalled();
  });

  it('reutiliza una wallet secundaria ya vinculada a un usuario', async () => {
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user);
    mockFindHubUserIdByLegacyWallets.mockResolvedValue(user.id);

    const response = await POST(request(signedBody()));

    expect(response.status).toBe(200);
    expect(mockFindHubUserIdByLegacyWallets).toHaveBeenCalledWith({
      walletAddresses: [walletAddress],
    });
    expect(mockFindOrSyncUserFromCukies).not.toHaveBeenCalled();
    expect(mockCreateUserDirectly).not.toHaveBeenCalled();
    expect(mockSetWalletSessionCookie).toHaveBeenCalledWith({
      userId: user.id,
      walletAddress,
      signedWalletAddress: walletAddress,
      walletType: 'evm',
    });
  });

  it('reutiliza una wallet sincronizada desde la base Cukies', async () => {
    mockFindUnique.mockResolvedValue(null);
    mockFindOrSyncUserFromCukies.mockResolvedValue(user);

    const response = await POST(request(signedBody()));

    expect(response.status).toBe(200);
    expect(mockFindOrSyncUserFromCukies).toHaveBeenCalledWith(walletAddress);
    expect(mockCreateUserDirectly).not.toHaveBeenCalled();
    expect(mockEnsureHubWalletForLogin).toHaveBeenCalledWith(user.id, walletAddress, 'evm');
    expect(mockSetWalletSessionCookie).toHaveBeenCalledWith({
      userId: user.id,
      walletAddress,
      signedWalletAddress: walletAddress,
      walletType: 'evm',
    });
  });

  it('crea directamente un usuario nuevo y lo vuelve a leer con relaciones', async () => {
    mockFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(user);

    const response = await POST(request(signedBody()));

    expect(response.status).toBe(200);
    expect(mockCreateUserDirectly).toHaveBeenCalledWith({
      walletAddress,
      username: walletAddress,
    });
    expect(mockFindUnique).toHaveBeenLastCalledWith({
      where: { id: user.id },
      include: {
        lastCheckIn: true,
        completedQuests: { include: { quest: true } },
      },
    });
  });

  it.each([
    [{}, 'missing'],
    [{ walletAddress: 123 }, 'non-string'],
    [{ walletAddress: '' }, 'empty'],
  ])('rechaza walletAddress invalida (%s)', async (body, _caseName) => {
    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Wallet address is required' });
    expect(mockReadWalletSession).not.toHaveBeenCalled();
  });

  it('exige firma cuando no hay una sesion reutilizable', async () => {
    const response = await POST(request({ walletAddress }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Wallet signature is required',
      requiresSignature: true,
    });
  });

  it('rechaza un challenge que no coincide con la wallet', async () => {
    mockReadWalletChallenge.mockResolvedValue({
      walletAddress: '0x2222222222222222222222222222222222222222',
      walletType: 'evm',
      message,
    });

    const response = await POST(request(signedBody()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: 'Invalid or expired wallet challenge',
      requiresSignature: true,
    });
    expect(mockVerifyWalletSignature).not.toHaveBeenCalled();
  });

  it('devuelve 500 sin filtrar detalles ante un error de base de datos', async () => {
    mockFindUnique.mockRejectedValue(new Error('Database error'));

    const response = await POST(request(signedBody()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal Server Error' });
  });

  it('devuelve 500 ante JSON malformado', async () => {
    const response = await POST(request('invalid json'));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal Server Error' });
  });
});
