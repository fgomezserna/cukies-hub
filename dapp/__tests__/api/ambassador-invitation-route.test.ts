import { getPublicAmbassadorInvitation } from '@/lib/uki-economy/ambassadors/public';
import { DomainValidationError } from '@/lib/uki-economy/errors';
import { GET } from '@/app/api/economy/v1/ambassadors/invitations/[code]/route';

jest.mock('@/lib/uki-economy/ambassadors/public', () => ({
  getPublicAmbassadorInvitation: jest.fn(),
}));

const mockGetInvitation = getPublicAmbassadorInvitation as jest.MockedFunction<
  typeof getPublicAmbassadorInvitation
>;

function request(code: string) {
  return GET(
    new Request(`https://cukies.world/api/economy/v1/ambassadors/invitations/${code}`),
    { params: Promise.resolve({ code }) },
  );
}

describe('ambassador invitation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.APP_ENV = 'production';
    process.env.STAGING_ONLY_GUARD = 'false';
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = '56';
    process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID = '56';
  });

  afterEach(() => {
    delete process.env.APP_ENV;
    delete process.env.STAGING_ONLY_GUARD;
    delete process.env.NEXT_PUBLIC_UKI_CHAIN_ID;
    delete process.env.CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID;
  });

  it('resuelve un código opaco sin exponer la wallet completa', async () => {
    mockGetInvitation.mockResolvedValue({
      invitationCode: 'cw-123456789abc',
      ambassadorWalletMasked: '0x2222…2222',
    });

    const response = await request('cw-123456789abc');

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age=60');
    expect(await response.json()).toEqual({
      status: 'ok',
      invitation: {
        invitationCode: 'cw-123456789abc',
        ambassadorWalletMasked: '0x2222…2222',
      },
    });
  });

  it('distingue códigos válidos inexistentes de códigos mal formados', async () => {
    mockGetInvitation.mockResolvedValueOnce(null);
    const missing = await request('cw-123456789abc');
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ status: 'error', code: 'INVITATION_NOT_FOUND' });

    mockGetInvitation.mockRejectedValueOnce(new DomainValidationError('invalid'));
    const invalid = await request('wallet-visible');
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ status: 'error', code: 'INVALID_INVITATION_CODE' });
  });

  it('falla cerrado si producción no está configurada para BSC mainnet', async () => {
    process.env.NEXT_PUBLIC_UKI_CHAIN_ID = '97';

    const response = await request('cw-123456789abc');

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'AMBASSADOR_RUNTIME_MISCONFIGURED',
    });
    expect(mockGetInvitation).not.toHaveBeenCalled();
  });
});
