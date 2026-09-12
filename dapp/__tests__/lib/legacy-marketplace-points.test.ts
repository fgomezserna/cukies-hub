jest.mock('server-only', () => ({}));
jest.mock('@/lib/mongodb-cukies', () => ({
  cukiesDb: { points: jest.fn() },
}));
jest.mock('@/lib/legacy-marketplace/graphql', () => ({
  fetchLegacyMarketplaceGraphQL: jest.fn(),
  legacyMarketplaceCukiSelection: '',
}));

import { cukiesDb } from '@/lib/mongodb-cukies';
import { listLegacyCukiePoints } from '@/lib/legacy-marketplace/data';

const pointsCollection = cukiesDb.points as jest.Mock;

function setupCollection({
  documents = [],
  total = documents.length,
  summary = [],
  networkFacets = [],
  typeFacets = [],
}: {
  documents?: unknown[];
  total?: number;
  summary?: unknown[];
  networkFacets?: unknown[];
  typeFacets?: unknown[];
} = {}) {
  const page = {
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue(documents),
  };
  const collection = {
    find: jest.fn().mockReturnValue(page),
    countDocuments: jest.fn().mockResolvedValue(total),
    aggregate: jest.fn()
      .mockReturnValueOnce({ toArray: jest.fn().mockResolvedValue(summary) })
      .mockReturnValueOnce({ toArray: jest.fn().mockResolvedValue(networkFacets) })
      .mockReturnValueOnce({ toArray: jest.fn().mockResolvedValue(typeFacets) }),
  };
  pointsCollection.mockResolvedValue(collection);
  return { collection, page };
}

describe('historial Legacy de Cukie Points', () => {
  beforeEach(() => jest.clearAllMocks());

  it('publica la fuente histórica con total, suma y paginación coherentes', async () => {
    const { page } = setupCollection({
      documents: [{
        _id: 'tx-2',
        address: '0x00000000000000000000000000000000000000aa',
        points: -7,
        type: 'Breeding',
        date: '1640861169',
        txID: '0xhash',
        network: 'BSC',
      }],
      total: 31,
      summary: [{ totalPoints: 93, totalTransactions: 31 }],
      networkFacets: [{ _id: 'BSC', count: 31 }],
      typeFacets: [{ _id: 'Breeding', count: 31 }],
    });

    const response = await listLegacyCukiePoints({
      limit: 1,
      offset: 12,
      network: 'BSC',
      type: 'Breeding',
    });

    expect(response).toMatchObject({
      source: 'legacy',
      status: 'partial',
      coverage: 'legacy-historical',
      total: 31,
      offset: 12,
      limit: 1,
      summary: {
        totalPoints: 93,
        totalTransactions: 31,
        facets: {
          networks: [{ value: 'BSC', count: 31 }],
          types: [{ value: 'Breeding', count: 31 }],
        },
      },
    });
    expect(response.items[0]).toMatchObject({
      id: 'tx-2',
      points: -7,
      network: 'BSC',
      date: 1640861169000,
    });
    expect(page.sort).toHaveBeenCalledWith({ date: -1, _id: -1 });
    expect(page.skip).toHaveBeenCalledWith(12);
    expect(page.limit).toHaveBeenCalledWith(1);
  });

  it('mantiene TRON exacto y normaliza la coincidencia EVM por BSC', async () => {
    const { collection: tronCollection } = setupCollection();
    await listLegacyCukiePoints({ wallets: ['TaExacta'], network: 'TRON' });
    const tronFilter = tronCollection.find.mock.calls[0][0];
    expect(tronFilter.$and).toHaveLength(2);
    expect(tronFilter.$and[0]).toHaveProperty('network', /^TRON$/i);
    expect(tronFilter.$and[1]).toEqual({
      $or: [{ network: 'TRON', address: 'TaExacta' }],
    });

    const { collection: bscCollection } = setupCollection();
    await listLegacyCukiePoints({ wallets: ['0xAbCd'], network: 'BSC' });
    const bscFilter = bscCollection.find.mock.calls[0][0];
    expect(bscFilter.$and).toHaveLength(2);
    expect(bscFilter.$and[0]).toHaveProperty('network', /^BSC$/i);
    expect(bscFilter.$and[1]).toMatchObject({
      $or: [{
        network: 'BSC',
        $or: [
          { address: expect.any(RegExp) },
          { addressNormalized: '0xabcd' },
        ],
      }],
    });
    expect(bscFilter.$and[1].$or[0].$or[0].address.flags).toContain('i');
  });

  it('no filtra por ALL y devuelve fuente no disponible sin convertirla en cero verificado', async () => {
    const { collection } = setupCollection();
    await listLegacyCukiePoints({ type: 'ALL' });
    const allFilter = collection.find.mock.calls[0][0];
    expect(allFilter.$and).toHaveLength(1);
    expect(allFilter.$and[0]).toHaveProperty('$or');

    pointsCollection.mockRejectedValueOnce(new Error('INTERNAL_DB_CONNECTION_DETAILS'));
    const unavailable = await listLegacyCukiePoints({});
    expect(unavailable).toMatchObject({
      source: 'empty',
      status: 'unknown',
      coverage: 'unavailable',
      total: 0,
      summary: { totalPoints: 0, totalTransactions: 0 },
    });
    expect(unavailable.error).toBe('No se pudo cargar el historial de Cukie Points.');
    expect(JSON.stringify(unavailable)).not.toContain('INTERNAL_DB_CONNECTION_DETAILS');
  });
});
