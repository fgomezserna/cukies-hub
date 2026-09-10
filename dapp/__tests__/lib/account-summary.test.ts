jest.mock('@/lib/contracts/uki-sale', () => ({
  erc20Abi: [],
  ukiSaleContracts: {
    chainId: 97,
    ukiTokenAddress: '0x0000000000000000000000000000000000000001',
  },
}));

jest.mock('@/lib/cukies-data/my-collection', () => ({
  listMyCukieCollection: jest.fn(),
}));

jest.mock('@/lib/uki-economy/credits', () => ({
  getCompetitionCreditWalletStatus: jest.fn(),
}));

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(),
    http: jest.fn(() => 'transport'),
    isAddress: jest.fn(() => true),
  };
});

import { createPublicClient } from 'viem';

import { getWalletAccountSummary } from '@/lib/account-summary';
import { listMyCukieCollection } from '@/lib/cukies-data/my-collection';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits';

const wallet = '0x1111111111111111111111111111111111111111';

describe('getWalletAccountSummary', () => {
  const readContract = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (createPublicClient as jest.Mock).mockReturnValue({ readContract });
  });

  it('mantiene unknown como disponible no confirmado y no convierte el cero materializado en listo', async () => {
    readContract.mockResolvedValue(BigInt(0));
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({
      materialization: { balance: 'unknown' },
      balance: {
        availableCredits: 0,
        reservedCredits: null,
        spentCredits: null,
        blocked: false,
      },
    });
    (listMyCukieCollection as jest.Mock).mockResolvedValue({
      items: [{}, {}, {}],
      summary: {
        total: 3,
        inWallet: 2,
        available: 1,
        onSale: 1,
        inPool: 0,
        inCukieMaster: 1,
        otherInUse: 0,
      },
    });

    const result = await getWalletAccountSummary(wallet);

    expect(result.chainId).toBe(97);
    expect(result.uki).toMatchObject({ balance: '0', balanceRaw: '0', symbol: 'UKI' });
    expect(result.credits).toMatchObject({ availableCredits: null, materialization: 'unknown' });
    expect(result.cukies).toMatchObject({ available: 1, coverage: 'complete' });
    expect(createPublicClient).toHaveBeenCalledWith(expect.objectContaining({ chain: expect.objectContaining({ id: 97 }) }));
  });

  it('descarta una cobertura parcial en lugar de presentar sus totales como definitivos', async () => {
    readContract.mockResolvedValue(BigInt(0));
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({
      materialization: { balance: 'ready' },
      balance: { availableCredits: 0, reservedCredits: 0, spentCredits: 0, blocked: false },
    });
    (listMyCukieCollection as jest.Mock).mockResolvedValue({
      items: [],
      coverage: 'partial',
      summary: {
        total: 0,
        inWallet: 0,
        available: 0,
        onSale: 0,
        inPool: 0,
        inCukieMaster: 0,
        otherInUse: 0,
      },
    });

    const result = await getWalletAccountSummary(wallet);

    expect(result.cukies).toBeNull();
  });

  it('rechaza un resumen completo cuya cobertura no coincide con los items reales', async () => {
    readContract.mockResolvedValue(BigInt(0));
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({
      materialization: { balance: 'ready' },
      balance: { availableCredits: 0, reservedCredits: 0, spentCredits: 0, blocked: false },
    });
    (listMyCukieCollection as jest.Mock).mockResolvedValue({
      items: [{}],
      summary: {
        total: 0,
        inWallet: 0,
        available: 0,
        onSale: 0,
        inPool: 0,
        inCukieMaster: 0,
        otherInUse: 0,
      },
    });

    const result = await getWalletAccountSummary(wallet);

    expect(result.cukies).toBeNull();
  });

  it('aísla fallos parciales y conserva los datos reales de los recursos que sí responden', async () => {
    readContract.mockRejectedValue(new Error('RPC unavailable'));
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({
      materialization: { balance: 'ready' },
      balance: {
        availableCredits: 4,
        reservedCredits: 1,
        spentCredits: 2,
        blocked: false,
      },
    });
    (listMyCukieCollection as jest.Mock).mockRejectedValue(new Error('collection unavailable'));

    const result = await getWalletAccountSummary(wallet);

    expect(result.uki).toBeNull();
    expect(result.credits).toMatchObject({ availableCredits: 4, reservedCredits: 1, spentCredits: 2 });
    expect(result.cukies).toBeNull();
  });
});
