jest.mock('server-only', () => ({}));
jest.mock('@/lib/indexer-db/mongodb', () => ({ getIndexerDb: jest.fn() }));

import { buildCukiFilter } from '@/lib/cukies-data/data';

describe('legacy marketplace public query', () => {
  it('requires active listing evidence bound to the current owner and network', () => {
    const filter = buildCukiFilter({ marketplaceOnly: true });
    expect(filter).toMatchObject({
      state: 'onSale',
      marketplaceListingStatus: 'active',
      ownerNormalized: { $type: 'string', $ne: '' },
      marketplaceListingOwnerNormalized: { $type: 'string', $ne: '' },
      marketplaceListingEventId: { $type: 'string', $ne: '' },
      $expr: {
        $and: [
          { $eq: ['$ownerNormalized', '$marketplaceListingOwnerNormalized'] },
          { $eq: ['$network', '$marketplaceListingChain'] },
        ],
      },
    });
    expect(filter.$and).toContainEqual({
      $nor: [{
        metadataSource: 'legacy.cukies',
        legacyProjectionKind: { $ne: 'canonical' },
      }],
    });
  });

  it('applies the same fail-closed evidence to any onSale inventory query', () => {
    expect(buildCukiFilter({ state: 'onSale', network: 'BSC' })).toMatchObject({
      network: 'BSC',
      state: 'onSale',
      marketplaceListingStatus: 'active',
      ownerNormalized: { $type: 'string', $ne: '' },
      marketplaceListingOwnerNormalized: { $type: 'string', $ne: '' },
      marketplaceListingEventId: { $type: 'string', $ne: '' },
      $expr: {
        $and: [
          { $eq: ['$ownerNormalized', '$marketplaceListingOwnerNormalized'] },
          { $eq: ['$network', '$marketplaceListingChain'] },
        ],
      },
    });
  });

  it('does not hide non-marketplace inventory states from their dedicated views', () => {
    expect(buildCukiFilter({ state: 'staking', owner: '0xABC' })).toMatchObject({
      state: 'staking',
      $or: [
        { ownerNormalized: '0xabc' },
        expect.any(Object),
        expect.any(Object),
      ],
    });
  });
});
