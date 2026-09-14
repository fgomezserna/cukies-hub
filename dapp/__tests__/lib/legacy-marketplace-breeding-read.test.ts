jest.mock('@/lib/legacy-marketplace/bsc', () => ({
  legacyBscPublicClient: {
    readContract: jest.fn(),
  },
}));

jest.mock('tronweb', () => {
  class FakeTronWeb {
    static instances: FakeTronWeb[] = [];
    static nextResult: unknown = BigInt(0);
    readonly fullNode: { host: string };
    contractAddress: string | null = null;
    setAddressValue: string | null = null;

    constructor(options: { fullHost: string }) {
      this.fullNode = { host: options.fullHost };
      FakeTronWeb.instances.push(this);
    }

    setAddress(address: string) {
      this.setAddressValue = address;
    }

    contract(_abi: unknown, address: string) {
      this.contractAddress = address;
      return {
        getNumBreedsByCukie: (_tokenId: string) => ({
          call: async () => FakeTronWeb.nextResult,
        }),
      };
    }
  }

  return { TronWeb: FakeTronWeb };
});

import {
  readLegacyMarketplaceBreedingCount,
  readLegacyMarketplaceMaxBreeds,
  readLegacyMarketplaceOwner,
} from '@/lib/legacy-marketplace/live-marketplace';
import { legacyBscPublicClient } from '@/lib/legacy-marketplace/bsc';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { TronWeb } from 'tronweb';

const mockReadContract = legacyBscPublicClient.readContract as jest.Mock;
const bscOwner = '0x00000000000000000000000000000000000000aa';
const maxTokenId = '115792089237316195423570985008687907853269984665640564039457584007913129639935';

describe('lecturas canónicas de breeding Legacy', () => {
  beforeEach(() => {
    mockReadContract.mockReset();
    (TronWeb as unknown as { instances: unknown[] }).instances = [];
    (TronWeb as unknown as { nextResult: unknown }).nextResult = BigInt(0);
  });

  it('lee el contador por NFT con el contrato BSC56 y conserva el límite uint256', async () => {
    mockReadContract.mockResolvedValue(BigInt(7));

    await expect(readLegacyMarketplaceBreedingCount({
      network: 'BSC',
      tokenId: maxTokenId,
    })).resolves.toBe(7);

    expect(mockReadContract).toHaveBeenCalledWith(expect.objectContaining({
      address: legacyMarketplaceContracts.bsc.contracts.breedingPoints,
      functionName: 'getNumBreedsByCukie',
      args: [BigInt(maxTokenId)],
    }));
  });

  it('lee ownerOf y máximo desde los contratos canónicos BSC56', async () => {
    mockReadContract
      .mockResolvedValueOnce(bscOwner)
      .mockResolvedValueOnce(BigInt(Number.MAX_SAFE_INTEGER));

    await expect(readLegacyMarketplaceOwner({ network: 'BSC', tokenId: '29' } as Parameters<typeof readLegacyMarketplaceOwner>[0])).resolves.toBe(bscOwner);
    await expect(readLegacyMarketplaceMaxBreeds('BSC')).resolves.toBe(Number.MAX_SAFE_INTEGER);

    expect(mockReadContract.mock.calls[0][0]).toEqual(expect.objectContaining({
      address: legacyMarketplaceContracts.bsc.contracts.token,
      functionName: 'ownerOf',
      args: [BigInt(29)],
    }));
    expect(mockReadContract.mock.calls[1][0]).toEqual(expect.objectContaining({
      address: legacyMarketplaceContracts.bsc.contracts.breedingPoints,
      functionName: 'getMaxBreedsByCukie',
    }));
  });

  it('falla cerrado ante respuesta de contador malformada o transporte caído', async () => {
    mockReadContract.mockResolvedValue('not-a-count');
    await expect(readLegacyMarketplaceBreedingCount({ network: 'BSC', tokenId: '29' }))
      .rejects.toThrow('INVALID_LEGACY_BREEDING_COUNT');

    mockReadContract.mockRejectedValue(new Error('RPC timeout'));
    await expect(readLegacyMarketplaceBreedingCount({ network: 'BSC', tokenId: '29' }))
      .rejects.toThrow('LEGACY_MARKETPLACE_BREEDING_COUNT_UNAVAILABLE');
  });

  it('usa el RPC TRON read-only y parsea el contador contractual', async () => {
    (TronWeb as unknown as { nextResult: unknown }).nextResult = BigInt(4);

    await expect(readLegacyMarketplaceBreedingCount({
      network: 'TRON',
      tokenId: '29',
    })).resolves.toBe(4);

    const instance = (TronWeb as unknown as {
      instances: Array<{
        fullNode: { host: string };
        setAddressValue: string | null;
        contractAddress: string | null;
      }>;
    }).instances.at(-1);
    expect(instance).toMatchObject({
      fullNode: { host: legacyMarketplaceContracts.tron.readRpcUrl },
      setAddressValue: legacyMarketplaceContracts.tron.contracts.breedingPoints,
      contractAddress: legacyMarketplaceContracts.tron.contracts.breedingPoints,
    });
  });
});
