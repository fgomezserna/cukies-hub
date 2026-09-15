jest.mock('server-only', () => ({}));
jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import { getCuki } from '@/lib/cukies-data/data';
import { getIndexerDb } from '@/lib/indexer-db/mongodb';

const mockGetIndexerDb = getIndexerDb as jest.MockedFunction<typeof getIndexerDb>;

function cursorWith(documents: unknown[]) {
  return {
    limit: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue(documents),
  };
}

function installDb(documents: Array<Record<string, unknown>>) {
  const cukiesCursor = cursorWith(documents);
  const emptyCursor = cursorWith([]);
  const cukies = { find: jest.fn().mockReturnValue(cukiesCursor) };
  const history = { find: jest.fn().mockReturnValue(emptyCursor) };
  const chainEvents = { find: jest.fn().mockReturnValue(emptyCursor) };
  mockGetIndexerDb.mockResolvedValue({
    collection: jest.fn((name: string) => {
      if (name === 'cukies') return cukies;
      if (name === 'tx_nfts') return history;
      if (name === 'chain_events') return chainEvents;
      throw new Error(`Colección inesperada: ${name}`);
    }),
  } as never);
  return { cukies };
}

describe('detalle canónico de Cukies por red', () => {
  beforeEach(() => mockGetIndexerDb.mockReset());

  it('resuelve el tokenId del documento compuesto y excluye el snapshot metadata', async () => {
    const document = {
      _id: 'BSC:56:0x0dbdebcc62f11005bf434abfad74564e896ac861:42',
      tokenId: '42',
      metadataSource: 'legacy.cukies',
      legacyProjectionKind: 'canonical',
      network: 'BSC',
      chainId: 56,
      collectionAddressNormalized: '0x0dbdebcc62f11005bf434abfad74564e896ac861',
      owner: '0x0000000000000000000000000000000000000042',
      state: 'available',
      parents: [],
      children: [],
    };
    const { cukies } = installDb([document]);

    await expect(getCuki('42', {
      network: 'BSC',
      chainId: 56,
      collection: document.collectionAddressNormalized,
    })).resolves.toMatchObject({ tokenId: '42', network: 'BSC' });
    expect(cukies.find).toHaveBeenCalledWith({
      $and: expect.arrayContaining([
        {
          $nor: [{
            metadataSource: 'legacy.cukies',
            legacyProjectionKind: { $ne: 'canonical' },
          }],
        },
        { $or: [{ tokenId: '42' }, { _id: '42' }] },
        { network: 'BSC' },
      ]),
    });
  });

  it('falla cerrado si el token existe en BSC y TRON sin selector de identidad', async () => {
    installDb([
      { _id: 'BSC:56:token:42', tokenId: '42', network: 'BSC' },
      { _id: 'TRON:mainnet:token:42', tokenId: '42', network: 'TRON' },
    ]);

    await expect(getCuki('42')).resolves.toBeNull();
  });
});
