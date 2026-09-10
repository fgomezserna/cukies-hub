jest.mock('server-only', () => ({}));
jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));
jest.mock('@/lib/legacy-marketplace/live-marketplace', () => ({
  readLegacyMarketplaceOwner: jest.fn(),
  readLegacyMarketplaceMaxBreeds: jest.fn(),
  readLegacyMarketplaceBreedingCount: jest.fn(),
}));

import {
  listBreedingCandidates,
  listCompletedBreeds,
} from '@/lib/cukies-data/data';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import {
  readLegacyMarketplaceBreedingCount,
  readLegacyMarketplaceMaxBreeds,
  readLegacyMarketplaceOwner,
} from '@/lib/legacy-marketplace/live-marketplace';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';

const mockGetIndexerDb = getIndexerDb as jest.MockedFunction<typeof getIndexerDb>;
const mockReadLegacyMarketplaceOwner = readLegacyMarketplaceOwner as jest.Mock;
const mockReadLegacyMarketplaceMaxBreeds = readLegacyMarketplaceMaxBreeds as jest.Mock;
const mockReadLegacyMarketplaceBreedingCount = readLegacyMarketplaceBreedingCount as jest.Mock;

const wallet = '0x00000000000000000000000000000000000000aa';
const collectionAddress = legacyMarketplaceContracts.bsc.contracts.token;

function makeDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: '29',
    tokenId: '29',
    chainId: 56,
    collectionAddressNormalized: collectionAddress,
    network: 'BSC',
    owner: wallet,
    ownerNormalized: wallet.toLowerCase(),
    user: wallet,
    origin: 'original',
    state: 'available',
    cukiNumber: 29,
    numChildren: 0,
    skills: {},
    children: [],
    parents: [],
    ...overrides,
  };
}

describe('identidad Legacy en lecturas de breeding', () => {
  let documents: Array<Record<string, unknown>>;
  let cursor: {
    sort: jest.Mock;
    skip: jest.Mock;
    limit: jest.Mock;
    toArray: jest.Mock;
  };
  let collection: {
    find: jest.Mock;
    countDocuments: jest.Mock;
  };

  beforeEach(() => {
    documents = [];
    cursor = {
      sort: jest.fn(() => cursor),
      skip: jest.fn(() => cursor),
      limit: jest.fn(() => cursor),
      toArray: jest.fn(async () => documents),
    };
    collection = {
      find: jest.fn(() => cursor),
      countDocuments: jest.fn(async () => documents.length),
    };
    mockGetIndexerDb.mockResolvedValue({
      collection: jest.fn(() => collection),
    } as never);
    mockReadLegacyMarketplaceOwner.mockClear();
    mockReadLegacyMarketplaceMaxBreeds.mockClear().mockResolvedValue(1);
    mockReadLegacyMarketplaceBreedingCount.mockClear().mockResolvedValue(0);
    mockReadLegacyMarketplaceOwner.mockImplementation(async (item: { owner: string | null }) => {
      if (!item.owner) throw new Error('owner unavailable');
      return item.owner;
    });
  });

  it('solo publica candidatos BSC 56 con colección y propietario canónicos', async () => {
    documents = [
      makeDocument(),
      makeDocument({ _id: '97', tokenId: '97', chainId: 97 }),
      makeDocument({
        _id: 'wrong-contract',
        tokenId: 'wrong-contract',
        collectionAddressNormalized: '0x0000000000000000000000000000000000000001',
      }),
      makeDocument({
        _id: 'null-identity',
        tokenId: 'null-identity',
        chainId: null,
        collectionAddressNormalized: null,
      }),
      makeDocument({
        _id: 'alias-only',
        tokenId: 'alias-only',
        ownerNormalized: undefined,
      }),
    ];

    const response = await listBreedingCandidates({
      owner: wallet,
      network: 'BSC',
      maxBreeds: 1,
      limit: 60,
    });

    expect(response.status).toBe('partial');
    expect(response.items.map((item) => item.tokenId)).toEqual(['29']);
    expect(response.items[0]).toMatchObject({
      collectionAddress,
      chainId: 56,
      ownerNormalized: wallet.toLowerCase(),
      identityVerified: true,
      ownershipVerified: true,
      ownershipSource: 'legacy-ownerOf',
    });
    expect(collection.find).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'available',
        network: 'BSC',
        $or: expect.any(Array),
      }),
    );
  });

  it('mantiene partial cuando falla el contador canónico aunque haya relaciones materializadas', async () => {
    documents = [makeDocument({ numChildren: undefined, children: ['31'] })];
    mockReadLegacyMarketplaceBreedingCount.mockRejectedValue(new Error('RPC unavailable'));

    const response = await listBreedingCandidates({
      owner: wallet,
      network: 'BSC',
      maxBreeds: 1,
    });

    expect(response.status).toBe('partial');
    expect(response.items).toEqual([]);
    expect(response.error).toMatch(/identidad.*Legacy|elegibilidad.*Legacy/i);
  });

  it('excluye la selección cuando ownerOf no aporta una observación actual', async () => {
    documents = [makeDocument({ updatedAt: new Date('2000-01-01') })];
    mockReadLegacyMarketplaceOwner.mockRejectedValue(new Error('RPC unavailable'));

    const candidates = await listBreedingCandidates({
      owner: wallet,
      network: 'BSC',
      maxBreeds: 1,
    });
    const completed = await listCompletedBreeds({
      wallets: [wallet],
      network: 'BSC',
    });

    expect(candidates).toMatchObject({ status: 'partial', items: [] });
    expect(completed).toMatchObject({ status: 'partial', items: [] });
  });

  it('no trata el maxBreeds de la petición como una prueba contractual', async () => {
    documents = [makeDocument()];
    mockReadLegacyMarketplaceMaxBreeds.mockResolvedValue(2);

    const response = await listBreedingCandidates({
      owner: wallet,
      network: 'BSC',
      maxBreeds: 1,
    });

    expect(response).toMatchObject({ status: 'partial', items: [] });
    expect(mockReadLegacyMarketplaceOwner).not.toHaveBeenCalled();
  });

  it('cierra la selección cuando el contador importado está desactualizado', async () => {
    documents = [makeDocument({ numChildren: 0, children: [] })];
    mockReadLegacyMarketplaceBreedingCount.mockResolvedValue(1);

    const response = await listBreedingCandidates({
      owner: wallet,
      network: 'BSC',
      maxBreeds: 1,
    });

    expect(response).toMatchObject({ status: 'partial', items: [] });
    expect(mockReadLegacyMarketplaceBreedingCount).toHaveBeenCalledWith(
      expect.objectContaining({ tokenId: '29', network: 'BSC' }),
    );
  });

  it('exige la dirección TRON Base58 exacta y no verifica un alias en mayúsculas', async () => {
    const tronOwner = legacyMarketplaceContracts.tron.contracts.token;
    documents = [makeDocument({
      network: 'TRON',
      chainId: null,
      collectionAddressNormalized: tronOwner,
      owner: tronOwner,
      user: tronOwner,
      ownerNormalized: tronOwner.toUpperCase(),
    })];

    const aliasResponse = await listBreedingCandidates({
      owner: tronOwner.toUpperCase(),
      network: 'TRON',
      maxBreeds: 1,
    });
    expect(aliasResponse).toMatchObject({ status: 'partial', items: [] });

    const canonicalResponse = await listBreedingCandidates({
      owner: tronOwner,
      network: 'TRON',
      maxBreeds: 1,
    });
    expect(canonicalResponse).toMatchObject({
      status: 'verified',
      items: [{ owner: tronOwner, ownershipVerified: true }],
    });
  });

  it('filtra resultados completados por identidad y propiedad Legacy actuales', async () => {
    documents = [
      makeDocument({ origin: 'breed', state: 'available' }),
      makeDocument({
        _id: 'wrong-chain',
        tokenId: 'wrong-chain',
        origin: 'breed',
        chainId: 97,
      }),
      makeDocument({
        _id: 'wrong-contract',
        tokenId: 'wrong-contract',
        origin: 'breed',
        collectionAddressNormalized: '0x0000000000000000000000000000000000000001',
      }),
      makeDocument({
        _id: 'alias-only',
        tokenId: 'alias-only',
        origin: 'breed',
        ownerNormalized: undefined,
      }),
    ];

    const response = await listCompletedBreeds({
      wallets: [wallet],
      network: 'BSC',
      limit: 24,
      offset: 0,
    });

    expect(response.status).toBe('partial');
    expect(response.items.map((item) => item.tokenId)).toEqual(['29']);
    expect(response.items[0]).toMatchObject({
      origin: 'breed',
      collectionAddress,
      chainId: 56,
      ownerNormalized: wallet.toLowerCase(),
      identityVerified: true,
      ownershipVerified: true,
      ownershipSource: 'legacy-ownerOf',
    });
  });
});
