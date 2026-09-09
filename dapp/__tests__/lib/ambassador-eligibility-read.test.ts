const mockCreatePublicClient = jest.fn();
const mockGetCukieMasterWalletStatus = jest.fn();

jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: (...args: unknown[]) => mockCreatePublicClient(...args),
    http: jest.fn(() => ({})),
  };
});

jest.mock('@/lib/contracts/uki-sale', () => ({
  ukiSaleContracts: {
    chainId: 56,
    ukiStakingAddress: '0x1111111111111111111111111111111111111111',
    vestingVaultAddress: '0x2222222222222222222222222222222222222222',
  },
  vestingVaultAbi: [],
  ukiStakingAbi: [],
}));

jest.mock('@/lib/uki-economy/cukie-master/service', () => ({
  getCukieMasterWalletStatus: (...args: unknown[]) => mockGetCukieMasterWalletStatus(...args),
}));

import { getAmbassadorEligibility } from '@/lib/uki-economy/ambassadors/eligibility';

const wallet = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const observedAt = new Date('2026-09-09T10:00:00.000Z');
const requirementRaw = (BigInt(25_000) * BigInt(10) ** BigInt(18)).toString();

function status(overrides: Record<string, unknown> = {}) {
  return {
    routes: {
      uki: {
        currentRequirement: { route: 'uki', ukiRaw: requirementRaw },
        source: {
          route: 'uki',
          totalUkiRaw: '0',
          sourceHash: 'uki-source',
          completeness: { complete: false, warnings: ['indexer unavailable'] },
        },
        sourceCompleteness: { complete: false, nftInventory: true },
      },
      nft: {
        currentRequirement: { route: 'nft', nftPoints: 3 },
        source: {
          route: 'nft',
          originalCukiePoints: 0,
          sourceHash: 'nft-source',
          completeness: { complete: true, warnings: [] },
        },
        sourceCompleteness: { complete: true, nftInventory: true },
      },
    },
    ...overrides,
  };
}

describe('getAmbassadorEligibility on-chain fallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED;
    process.env.CHAIN_INDEXER_BSC_RPC_URL = 'https://rpc.example.invalid';
    mockGetCukieMasterWalletStatus.mockResolvedValue(status());
    mockCreatePublicClient.mockReturnValue({
      getChainId: jest.fn().mockResolvedValue(56),
      getBlockNumber: jest.fn().mockResolvedValue(BigInt(120879904)),
      getBlock: jest.fn().mockResolvedValue({
        number: BigInt(120879904),
        hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        timestamp: BigInt(1_725_000_000),
      }),
      readContract: jest.fn()
        .mockResolvedValueOnce({ totalAmount: BigInt(20_000) * BigInt(10) ** BigInt(18), releasedAmount: BigInt(0) })
        .mockResolvedValueOnce(BigInt(0)),
    });
  });

  afterAll(() => {
    delete process.env.CHAIN_INDEXER_BSC_RPC_URL;
    delete process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED;
  });

  it('usa el requisito vigente de la ronda, no el fallback fijo de 20k', async () => {
    const result = await getAmbassadorEligibility(wallet, observedAt);
    expect(result).toMatchObject({
      isCukieMaster: false,
      reason: 'CUKIE_MASTER_REQUIREMENT_NOT_MET',
      observedAt,
    });
    expect(result.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(mockCreatePublicClient).toHaveBeenCalled();
  });

  it('conserva un positivo UKI aunque la fuente NFT este incompleta', async () => {
    mockGetCukieMasterWalletStatus.mockResolvedValue({
      ...status(),
      routes: {
        ...status().routes,
        uki: {
          ...status().routes.uki,
          source: {
            ...status().routes.uki.source,
            totalUkiRaw: requirementRaw,
            completeness: { complete: true, warnings: [] },
          },
        },
      },
    });

    await expect(getAmbassadorEligibility(wallet, observedAt)).resolves.toMatchObject({
      isCukieMaster: true,
      reason: null,
    });
    expect(mockCreatePublicClient).not.toHaveBeenCalled();
  });

  it('mantiene unknown con UKI negativo y NFT habilitada pero incompleta', async () => {
    mockGetCukieMasterWalletStatus.mockResolvedValue({
      ...status(),
      routes: {
        ...status().routes,
        uki: {
          ...status().routes.uki,
          source: {
            ...status().routes.uki.source,
            completeness: { complete: true, warnings: [] },
          },
        },
        nft: {
          ...status().routes.nft,
          source: {
            ...status().routes.nft.source,
            completeness: { complete: false, warnings: ['nft unavailable'] },
          },
        },
      },
    });

    await expect(getAmbassadorEligibility(wallet, observedAt)).resolves.toMatchObject({
      isCukieMaster: null,
      reason: 'CUKIE_MASTER_SOURCE_UNKNOWN',
      sourceHash: null,
    });
  });

  it('falla cerrado con reason estable ante chain id o shape RPC invalido', async () => {
    mockCreatePublicClient.mockReturnValueOnce({
      getChainId: jest.fn().mockResolvedValue(97),
      getBlockNumber: jest.fn().mockResolvedValue(BigInt(120879904)),
      getBlock: jest.fn(),
      readContract: jest.fn(),
    });

    await expect(getAmbassadorEligibility(wallet, observedAt)).resolves.toMatchObject({
      isCukieMaster: null,
      reason: 'CUKIE_MASTER_SOURCE_UNKNOWN',
      sourceHash: null,
    });
    expect(JSON.stringify(await getAmbassadorEligibility(wallet, observedAt))).not.toContain('indexer unavailable');
  });

  it('no convierte NFT no aplicable en unknown cuando UKI es un negativo confirmado', async () => {
    process.env.CHAIN_INDEXER_CUKIE_MASTER_ENABLED = 'false';
    mockGetCukieMasterWalletStatus.mockResolvedValue({
      routes: {
        uki: {
          currentRequirement: { route: 'uki', ukiRaw: requirementRaw },
          source: {
            route: 'uki',
            totalUkiRaw: '0',
            sourceHash: 'uki-source',
            completeness: { complete: true, warnings: [] },
          },
        },
        nft: {
          currentRequirement: { route: 'nft', nftPoints: 3 },
          source: {
            route: 'nft',
            originalCukiePoints: 0,
            sourceHash: 'nft-source',
            completeness: { complete: false, warnings: ['disabled'] },
          },
          sourceCompleteness: { complete: false, nftInventory: false },
        },
      },
    });

    await expect(getAmbassadorEligibility(wallet, observedAt)).resolves.toMatchObject({
      isCukieMaster: false,
      reason: 'CUKIE_MASTER_REQUIREMENT_NOT_MET',
    });
  });
});
