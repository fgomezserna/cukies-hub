jest.mock('server-only', () => ({}));
jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import {
  listBreedingCandidates,
  listCompletedBreeds,
} from '@/lib/cukies-data/data';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';

const mockGetIndexerDb = getIndexerDb as jest.MockedFunction<typeof getIndexerDb>;

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
    });
    expect(collection.find).toHaveBeenCalledWith(
      expect.objectContaining({
        state: 'available',
        network: 'BSC',
        $or: expect.any(Array),
      }),
    );
  });

  it('mantiene unknown cuando falta la evidencia de elegibilidad', async () => {
    documents = [makeDocument({ numChildren: undefined, children: undefined })];

    const response = await listBreedingCandidates({
      owner: wallet,
      network: 'BSC',
      maxBreeds: 1,
    });

    expect(response.status).toBe('partial');
    expect(response.items).toEqual([]);
    expect(response.error).toMatch(/identidad.*Legacy/i);
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
    });
  });
});
