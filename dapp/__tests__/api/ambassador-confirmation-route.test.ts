import { POST } from '@/app/api/economy/v1/ambassadors/confirmation/route';
import { readWalletSession } from '@/lib/wallet-auth';
import { createAmbassadorConfirmation } from '@/lib/uki-economy/ambassadors/confirmation';
import { getCanonicalAmbassadorEnrollment, getCanonicalAmbassadorInvitationWallet } from '@/lib/uki-economy/ambassadors/service';

jest.mock('@/lib/wallet-auth', () => ({ readWalletSession: jest.fn() }));
jest.mock('@/lib/uki-economy/ambassadors/service', () => ({
  getCanonicalAmbassadorEnrollment: jest.fn(), getCanonicalAmbassadorInvitationWallet: jest.fn(),
}));
jest.mock('@/lib/uki-economy/ambassadors/confirmation', () => ({
  createAmbassadorConfirmation: jest.fn(), ambassadorConfirmationOrigin: () => 'https://hub.test',
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const SPONSOR = '0x2222222222222222222222222222222222222222';
const target = { invitationCode: 'cw-123456789abc' };
const request = (body: unknown = target) => new Request('https://hub.test/api/economy/v1/ambassadors/confirmation', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('reto de firma de embajador', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(process.env, { APP_ENV: 'staging', STAGING_ONLY_GUARD: 'true',
      NEXT_PUBLIC_UKI_CHAIN_ID: '97', CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
      AMBASSADOR_ATTRIBUTION_WRITES_ENABLED: 'true', AMBASSADOR_DEFAULT_WALLET_ADDRESS: SPONSOR });
    jest.mocked(readWalletSession).mockResolvedValue({ userId: 'user', walletAddress: WALLET,
      signedWalletAddress: WALLET, walletType: 'evm', issuedAt: '2026-09-07T10:00:00Z', expiresAt: '2026-09-08T10:00:00Z' });
    jest.mocked(getCanonicalAmbassadorEnrollment).mockResolvedValue({
      canChooseSponsor: true, canInvite: false, isPresaleParticipant: false,
    });
    jest.mocked(getCanonicalAmbassadorInvitationWallet).mockResolvedValue(SPONSOR);
    jest.mocked(createAmbassadorConfirmation).mockResolvedValue({ message: 'Firma específica', expiresAt: '2026-09-07T10:05:00Z' });
  });
  afterEach(() => {
    for (const key of ['APP_ENV', 'STAGING_ONLY_GUARD', 'NEXT_PUBLIC_UKI_CHAIN_ID',
      'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID', 'AMBASSADOR_ATTRIBUTION_WRITES_ENABLED',
      'AMBASSADOR_DEFAULT_WALLET_ADDRESS']) delete process.env[key];
  });

  it('emite reto para la wallet de sesión y el sponsor resuelto por servidor', async () => {
    const response = await POST(request({ ...target, walletAddress: SPONSOR, ambassadorWallet: WALLET }));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(createAmbassadorConfirmation).toHaveBeenCalledWith(expect.objectContaining({
      wallet: WALLET, ambassadorWallet: SPONSOR, target, chainId: 97, origin: 'https://hub.test',
    }));
  });

  it('sin invitador requiere una wallet Cukies World configurada', async () => {
    expect((await POST(request({ sponsor: 'cukies_world' }))).status).toBe(200);
    expect(createAmbassadorConfirmation).toHaveBeenCalledWith(expect.objectContaining({ ambassadorWallet: SPONSOR }));
    jest.mocked(createAmbassadorConfirmation).mockClear();
    delete process.env.AMBASSADOR_DEFAULT_WALLET_ADDRESS;
    expect((await POST(request({ sponsor: 'cukies_world' }))).status).toBe(503);
    expect(createAmbassadorConfirmation).not.toHaveBeenCalled();
  });

  it('no solicita firma a compradores sin sponsor ni a cuentas confirmadas', async () => {
    for (const isPresaleParticipant of [true, false]) {
      jest.mocked(getCanonicalAmbassadorEnrollment).mockResolvedValue({ isPresaleParticipant, canChooseSponsor: false, canInvite: true });
      const response = await POST(request());
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ code: isPresaleParticipant ? 'PRESALE_SPONSOR_LOCKED' : 'AMBASSADOR_ALREADY_CONFIRMED' });
    }
    expect(createAmbassadorConfirmation).not.toHaveBeenCalled();
  });

  it('sin sesión o con escrituras desactivadas no consulta datos ni emite reto', async () => {
    jest.mocked(readWalletSession).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    process.env.AMBASSADOR_ATTRIBUTION_WRITES_ENABLED = 'false';
    expect((await POST(request())).status).toBe(503);
    expect(getCanonicalAmbassadorEnrollment).not.toHaveBeenCalled();
    expect(createAmbassadorConfirmation).not.toHaveBeenCalled();
  });

  it('rechaza self-referral, enlaces desactivados y targets ambiguos', async () => {
    jest.mocked(getCanonicalAmbassadorInvitationWallet).mockResolvedValue(WALLET);
    const self = await POST(request());
    expect(self.status).toBe(409);
    expect(await self.json()).toMatchObject({ code: 'AMBASSADOR_CYCLE' });
    jest.mocked(getCanonicalAmbassadorInvitationWallet).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(404);
    expect((await POST(request({ ...target, sponsor: 'cukies_world' }))).status).toBe(400);
    expect(createAmbassadorConfirmation).not.toHaveBeenCalled();
  });
});
