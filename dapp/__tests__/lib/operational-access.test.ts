const mockReadWalletSession = jest.fn();

jest.mock('@/lib/wallet-auth', () => ({
  isValidEvmWalletAddress: (walletAddress: string) => (
    /^0x[a-f0-9]{40}$/i.test(walletAddress)
    && walletAddress.toLowerCase() !== '0x0000000000000000000000000000000000000000'
  ),
  readWalletSession: (...args: unknown[]) => mockReadWalletSession(...args),
}));

import {
  hasAdminPageAccess,
  requireAdminApiAccess,
  requireLocalAdminApiAccess,
  requirePrivateSecretConfigurationApiAccess,
  requirePrivateSecretApiAccess,
} from '@/lib/operational-access';

const ADMIN_WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x2222222222222222222222222222222222222222';
const PRIVATE_SECRET = 'private-secret-0123456789-ABCDEFGHIJKLMN';
const TELEGRAM_PRIVATE_SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789-abcdef';

const ENVIRONMENT_NAMES = [
  'ADMIN_WALLET_ALLOWLIST',
  'APP_ENV',
  'NODE_ENV',
  'TELEGRAM_WEBHOOK_SECRET',
  'IFTTT_WEBHOOK_SECRET',
  'TELEGRAM_CLEANUP_SECRET',
  'NEXT_PUBLIC_TEST_SECRET',
] as const;

const originalEnvironment = Object.fromEntries(
  ENVIRONMENT_NAMES.map((name) => [name, process.env[name]]),
) as Record<(typeof ENVIRONMENT_NAMES)[number], string | undefined>;

function setEnvironment(name: string, value: string | undefined) {
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else Reflect.set(process.env, name, value);
}

function restoreEnvironment() {
  for (const name of ENVIRONMENT_NAMES) {
    setEnvironment(name, originalEnvironment[name]);
  }
}

function walletSession(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'user-1',
    walletAddress: ADMIN_WALLET,
    signedWalletAddress: ADMIN_WALLET,
    walletType: 'evm',
    issuedAt: '2026-08-08T00:00:00.000Z',
    expiresAt: '2026-09-08T00:00:00.000Z',
    ...overrides,
  };
}

async function expectAccessError(
  response: Response | null,
  status: number,
  error: string,
) {
  expect(response).not.toBeNull();
  if (!response) throw new Error('Expected an access error response');
  expect(response.status).toBe(status);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  const body = await response.json();
  expect(body).toEqual({ error });
  return body;
}

describe('operational admin access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restoreEnvironment();
    process.env.ADMIN_WALLET_ALLOWLIST = ADMIN_WALLET;
    mockReadWalletSession.mockResolvedValue(walletSession());
  });

  afterAll(restoreEnvironment);

  it.each([
    undefined,
    '',
    'not-a-wallet',
    `${ADMIN_WALLET},`,
    `${ADMIN_WALLET},${ADMIN_WALLET.toUpperCase()}`,
    '0x0000000000000000000000000000000000000000',
  ])('fails closed when ADMIN_WALLET_ALLOWLIST is invalid: %s', async (allowlist) => {
    if (allowlist === undefined) delete process.env.ADMIN_WALLET_ALLOWLIST;
    else process.env.ADMIN_WALLET_ALLOWLIST = allowlist;

    const response = await requireAdminApiAccess();

    await expectAccessError(response, 503, 'Service unavailable');
    expect(mockReadWalletSession).not.toHaveBeenCalled();
  });

  it('returns 401 when there is no signed wallet session', async () => {
    mockReadWalletSession.mockResolvedValue(null);

    await expectAccessError(await requireAdminApiAccess(), 401, 'Unauthorized');
  });

  it('returns 403 for a valid signed wallet that is not allowlisted', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession({
      walletAddress: OTHER_WALLET,
      signedWalletAddress: OTHER_WALLET,
    }));

    await expectAccessError(await requireAdminApiAccess(), 403, 'Forbidden');
  });

  it('does not authorize an allowlisted primary wallet when another wallet signed', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession({
      walletAddress: ADMIN_WALLET,
      signedWalletAddress: OTHER_WALLET,
    }));

    await expectAccessError(await requireAdminApiAccess(), 403, 'Forbidden');
  });

  it('does not authorize a TRON session through an EVM allowlist entry', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession({ walletType: 'tron' }));

    await expectAccessError(await requireAdminApiAccess(), 403, 'Forbidden');
  });

  it('authorizes only the EVM wallet that signed the session', async () => {
    process.env.ADMIN_WALLET_ALLOWLIST = ` ${OTHER_WALLET}, ${ADMIN_WALLET.toUpperCase()} `;

    await expect(requireAdminApiAccess()).resolves.toBeNull();
  });

  it('maps wallet-session configuration failures to a generic 503', async () => {
    mockReadWalletSession.mockRejectedValue(new Error('NEXTAUTH_SECRET leaked detail'));

    const response = await requireAdminApiAccess();
    const body = await expectAccessError(response, 503, 'Service unavailable');
    expect(JSON.stringify(body)).not.toContain('NEXTAUTH_SECRET');
  });

  it('reads the admin allowlist at runtime instead of caching it at module load', async () => {
    await expect(hasAdminPageAccess()).resolves.toBe(true);

    process.env.ADMIN_WALLET_ALLOWLIST = OTHER_WALLET;

    await expect(hasAdminPageAccess()).resolves.toBe(false);
  });

  it('returns false to pages for anonymous, forbidden and misconfigured access', async () => {
    mockReadWalletSession.mockResolvedValue(null);
    await expect(hasAdminPageAccess()).resolves.toBe(false);

    mockReadWalletSession.mockResolvedValue(walletSession({ signedWalletAddress: OTHER_WALLET }));
    await expect(hasAdminPageAccess()).resolves.toBe(false);

    delete process.env.ADMIN_WALLET_ALLOWLIST;
    await expect(hasAdminPageAccess()).resolves.toBe(false);
  });
});

describe('local operational admin access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restoreEnvironment();
    process.env.ADMIN_WALLET_ALLOWLIST = ADMIN_WALLET;
    mockReadWalletSession.mockResolvedValue(walletSession());
  });

  afterAll(restoreEnvironment);

  it('hides local-only APIs outside a local development runtime', async () => {
    process.env.APP_ENV = 'production';
    setEnvironment('NODE_ENV', 'production');

    await expectAccessError(await requireLocalAdminApiAccess(), 404, 'Not found');
    expect(mockReadWalletSession).not.toHaveBeenCalled();
  });

  it('fails closed when APP_ENV and NODE_ENV disagree', async () => {
    process.env.APP_ENV = 'local';
    setEnvironment('NODE_ENV', 'production');

    await expectAccessError(await requireLocalAdminApiAccess(), 404, 'Not found');
    expect(mockReadWalletSession).not.toHaveBeenCalled();
  });

  it('still requires an authenticated admin in local development', async () => {
    process.env.APP_ENV = 'local';
    setEnvironment('NODE_ENV', 'development');
    mockReadWalletSession.mockResolvedValue(null);

    await expectAccessError(await requireLocalAdminApiAccess(), 401, 'Unauthorized');
  });

  it('authorizes an allowlisted admin in local development', async () => {
    process.env.APP_ENV = 'development';
    setEnvironment('NODE_ENV', 'development');

    await expect(requireLocalAdminApiAccess()).resolves.toBeNull();
  });
});

describe('private server-to-server secrets', () => {
  beforeEach(() => {
    restoreEnvironment();
  });

  afterAll(restoreEnvironment);

  it.each([
    'TELEGRAM_WEBHOOK_SECRET',
    'IFTTT_WEBHOOK_SECRET',
    'TELEGRAM_CLEANUP_SECRET',
  ] as const)('fails closed when %s is missing or too short', async (environmentName) => {
    delete process.env[environmentName];
    await expectAccessError(
      requirePrivateSecretApiAccess(PRIVATE_SECRET, environmentName),
      503,
      'Service unavailable',
    );

    process.env[environmentName] = 'short-secret';
    await expectAccessError(
      requirePrivateSecretApiAccess('short-secret', environmentName),
      503,
      'Service unavailable',
    );

    process.env[environmentName] = ' '.repeat(32);
    await expectAccessError(
      requirePrivateSecretApiAccess(' '.repeat(32), environmentName),
      503,
      'Service unavailable',
    );
  });

  it.each([
    'generate-a-random-secret-with-at-least-32-bytes',
    'a'.repeat(64),
    ` ${PRIVATE_SECRET}`,
  ])('rejects placeholders, low-diversity values and whitespace: %s', async (secret) => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;

    await expectAccessError(
      requirePrivateSecretApiAccess(secret, 'TELEGRAM_WEBHOOK_SECRET'),
      503,
      'Service unavailable',
    );
  });

  it.each([
    'private:secret-0123456789-ABCDEFGHIJKLMN',
    'AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789.',
    `AbCdEfGhIjKlMnOpQrStUvWxYz_${'0'.repeat(230)}`,
  ])('rejects Telegram secrets the Bot API cannot register: %s', async (secret) => {
    process.env.TELEGRAM_WEBHOOK_SECRET = secret;

    await expectAccessError(
      requirePrivateSecretApiAccess(secret, 'TELEGRAM_WEBHOOK_SECRET'),
      503,
      'Service unavailable',
    );
  });

  it('rejects secrets reused by public config or another operational contract', async () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = PRIVATE_SECRET;
    process.env.NEXT_PUBLIC_TEST_SECRET = PRIVATE_SECRET;
    await expectAccessError(
      requirePrivateSecretApiAccess(PRIVATE_SECRET, 'TELEGRAM_WEBHOOK_SECRET'),
      503,
      'Service unavailable',
    );

    delete process.env.NEXT_PUBLIC_TEST_SECRET;
    process.env.TELEGRAM_CLEANUP_SECRET = PRIVATE_SECRET;
    await expectAccessError(
      requirePrivateSecretApiAccess(PRIVATE_SECRET, 'TELEGRAM_WEBHOOK_SECRET'),
      503,
      'Service unavailable',
    );
  });

  it('can reject invalid configuration before a webhook body is read', async () => {
    delete process.env.IFTTT_WEBHOOK_SECRET;
    await expectAccessError(
      requirePrivateSecretConfigurationApiAccess('IFTTT_WEBHOOK_SECRET'),
      503,
      'Service unavailable',
    );

    process.env.IFTTT_WEBHOOK_SECRET = PRIVATE_SECRET;
    expect(requirePrivateSecretConfigurationApiAccess('IFTTT_WEBHOOK_SECRET')).toBeNull();
  });

  it.each([
    undefined,
    null,
    'wrong-secret-that-is-also-at-least-32-bytes',
    `${PRIVATE_SECRET} `,
  ])('returns a generic 401 for a non-matching candidate: %s', async (candidate) => {
    process.env.TELEGRAM_WEBHOOK_SECRET = TELEGRAM_PRIVATE_SECRET;

    const response = requirePrivateSecretApiAccess(candidate, 'TELEGRAM_WEBHOOK_SECRET');

    const body = await expectAccessError(response, 401, 'Unauthorized');
    expect(JSON.stringify(body)).not.toContain(TELEGRAM_PRIVATE_SECRET);
  });

  it('accepts a Telegram Bot API-compatible base64url secret', () => {
    process.env.TELEGRAM_WEBHOOK_SECRET = TELEGRAM_PRIVATE_SECRET;

    expect(
      requirePrivateSecretApiAccess(TELEGRAM_PRIVATE_SECRET, 'TELEGRAM_WEBHOOK_SECRET'),
    ).toBeNull();
  });

  it('accepts only the exact configured secret and reads it at runtime', () => {
    process.env.IFTTT_WEBHOOK_SECRET = PRIVATE_SECRET;
    expect(requirePrivateSecretApiAccess(PRIVATE_SECRET, 'IFTTT_WEBHOOK_SECRET')).toBeNull();

    process.env.IFTTT_WEBHOOK_SECRET = `${PRIVATE_SECRET}-rotated`;
    expect(requirePrivateSecretApiAccess(PRIVATE_SECRET, 'IFTTT_WEBHOOK_SECRET')).not.toBeNull();
    expect(
      requirePrivateSecretApiAccess(`${PRIVATE_SECRET}-rotated`, 'IFTTT_WEBHOOK_SECRET'),
    ).toBeNull();
  });
});
