import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { cookies } from 'next/headers';

import {
  AMBASSADOR_CONFIRMATION_COOKIE, createAmbassadorConfirmation,
  verifyAmbassadorConfirmation, clearAmbassadorConfirmation,
} from '@/lib/uki-economy/ambassadors/confirmation';

jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const account = privateKeyToAccount(generatePrivateKey());
const sponsor = privateKeyToAccount(generatePrivateKey());
const cookieValues = new Map<string, string>();
const input = {
  wallet: account.address.toLowerCase(), ambassadorWallet: sponsor.address.toLowerCase(),
  sessionEvidenceHash: '1'.repeat(64), target: { invitationCode: 'cw-123456789abc' },
  origin: 'https://stage.test', chainId: 97, now: Date.parse('2026-09-07T11:00:00Z'),
};

describe('confirmación criptográfica de embajador', () => {
  beforeEach(() => {
    cookieValues.clear();
    process.env.NEXTAUTH_SECRET = 'test-only-ambassador-secret';
    jest.mocked(cookies).mockResolvedValue({
      get: (key: string) => cookieValues.has(key) ? { value: cookieValues.get(key) } : undefined,
      set: (key: string, value: string) => cookieValues.set(key, value),
    } as never);
  });
  afterEach(() => { delete process.env.NEXTAUTH_SECRET; });

  async function sign() {
    const { message } = await createAmbassadorConfirmation(input);
    return account.signMessage({ message });
  }

  it('vincula firma real a wallet, sponsor y sesión, sin transacción', async () => {
    const { message } = await createAmbassadorConfirmation(input);
    expect(message).toContain(input.ambassadorWallet);
    expect(message).toContain('permanente');
    expect(message).toContain('ni requiere gas');
    const signature = await account.signMessage({ message });
    expect(await verifyAmbassadorConfirmation({ ...input, signature })).toMatch(/^[0-9a-f]{64}$/);
    await clearAmbassadorConfirmation();
    expect(await verifyAmbassadorConfirmation({ ...input, signature })).toBeNull();
  });

  it('no admite reutilizar firma de login ni firma de otra wallet', async () => {
    const { message } = await createAmbassadorConfirmation(input);
    for (const signature of [
      await account.signMessage({ message: 'Cukies Hub wants you to sign in with your wallet.' }),
      await sponsor.signMessage({ message }),
    ]) expect(await verifyAmbassadorConfirmation({ ...input, signature })).toBeNull();
  });

  it.each([
    { wallet: sponsor.address.toLowerCase() },
    { ambassadorWallet: account.address.toLowerCase() },
    { sessionEvidenceHash: '2'.repeat(64) },
    { target: { invitationCode: 'cw-ffffffffffff' } },
    { origin: 'https://production.test' },
    { chainId: 56 },
    { now: input.now + 5 * 60_000 },
    { now: input.now - 1 },
  ])('rechaza modificación del ámbito de la firma: %j', async (changed) => {
    const signature = await sign();
    expect(await verifyAmbassadorConfirmation({ ...input, signature, ...changed })).toBeNull();
  });

  it('rechaza cookie manipulada y reto reemplazado por otra confirmación', async () => {
    const signature = await sign();
    const original = cookieValues.get(AMBASSADOR_CONFIRMATION_COOKIE)!;
    cookieValues.set(AMBASSADOR_CONFIRMATION_COOKIE, `x${original}`);
    expect(await verifyAmbassadorConfirmation({ ...input, signature })).toBeNull();
    await createAmbassadorConfirmation(input);
    expect(await verifyAmbassadorConfirmation({ ...input, signature })).toBeNull();
  });

  it('rechaza un MAC multibyte malformado sin lanzar errores', async () => {
    const signature = await sign();
    const body = cookieValues.get(AMBASSADOR_CONFIRMATION_COOKIE)!.split('.')[0];
    cookieValues.set(AMBASSADOR_CONFIRMATION_COOKIE, `${body}.${'é'.repeat(43)}`);
    expect(await verifyAmbassadorConfirmation({ ...input, signature })).toBeNull();
  });

  it('incluye la dirección configurada para Cukies World y no admite sustituirla', async () => {
    const direct = { ...input, target: { sponsor: 'cukies_world' as const } };
    const { message } = await createAmbassadorConfirmation(direct);
    expect(message).toContain(`Cukies World (${input.ambassadorWallet})`);
    const signature = await account.signMessage({ message });
    expect(await verifyAmbassadorConfirmation({ ...direct, signature })).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyAmbassadorConfirmation({ ...input, signature })).toBeNull();
  });
});
