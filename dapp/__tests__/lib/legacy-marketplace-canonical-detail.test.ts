jest.mock('server-only', () => ({}));
jest.mock('@/lib/mongodb-cukies', () => ({
  cukiesDb: {
    cukies: jest.fn(),
    points: jest.fn(),
    txNfts: jest.fn(),
    processedEvents: jest.fn(),
  },
}));
jest.mock('@/lib/legacy-marketplace/graphql', () => ({
  fetchLegacyMarketplaceGraphQL: jest.fn(),
  legacyMarketplaceCukiSelection: '',
}));

import { getLegacyMarketplaceCuki } from '@/lib/legacy-marketplace/data';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import { cukiesDb } from '@/lib/mongodb-cukies';

function installDocuments(documents: unknown[]) {
  const cursor = {
    limit: jest.fn().mockReturnThis(),
    toArray: jest.fn().mockResolvedValue(documents),
  };
  const collection = { find: jest.fn().mockReturnValue(cursor) };
  (cukiesDb.cukies as jest.Mock).mockResolvedValue(collection);
  return collection;
}

describe('detalle canónico del marketplace Legacy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('usa tokenId y no expone el `_id` compuesto como token', async () => {
    const collectionAddress = legacyMarketplaceContracts.bsc.contracts.token;
    const document = {
      _id: `BSC:56:${collectionAddress.toLowerCase()}:42`,
      tokenId: '42',
      metadataSource: 'legacy.cukies',
      legacyProjectionKind: 'canonical',
      network: 'BSC',
      chainId: 56,
      collectionAddressNormalized: collectionAddress.toLowerCase(),
      user: '0x0000000000000000000000000000000000000042',
      state: 'available',
      parents: [],
      children: [],
      history: [],
    };
    const collection = installDocuments([document]);

    await expect(getLegacyMarketplaceCuki('42', {
      network: 'BSC',
      chainId: 56,
      collection: collectionAddress,
    })).resolves.toMatchObject({ id: '42', tokenId: '42', network: 'BSC' });
    expect(collection.find).toHaveBeenCalledWith({
      $and: expect.arrayContaining([
        { tokenId: '42' },
        expect.objectContaining({ $nor: expect.any(Array) }),
      ]),
    }, expect.any(Object));
  });

  it('falla cerrado ante dos identidades sin selector de red', async () => {
    installDocuments([
      { _id: 'BSC:56:token:42', tokenId: '42', network: 'BSC' },
      { _id: 'TRON:mainnet:token:42', tokenId: '42', network: 'TRON' },
    ]);

    await expect(getLegacyMarketplaceCuki('42')).resolves.toBeNull();
  });
});
