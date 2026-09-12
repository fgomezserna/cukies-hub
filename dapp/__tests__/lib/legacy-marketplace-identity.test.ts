jest.mock('server-only', () => ({}));

jest.mock('@/lib/mongodb-cukies', () => ({
  cukiesDb: {
    cukies: jest.fn(),
    points: jest.fn(),
    txNfts: jest.fn(),
    processedEvents: jest.fn(),
  },
}));
jest.mock('@/lib/legacy-marketplace/live-marketplace', () => ({
  readLegacyMarketplaceLiveState: jest.fn(),
}));
jest.mock('@/lib/legacy-marketplace/graphql', () => ({
  fetchLegacyMarketplaceGraphQL: jest.fn(),
  legacyMarketplaceCukiSelection: '',
}));

import {
  buildLegacyMarketplaceIdentityFilter,
  normalizeLegacyMarketplaceIdentityInput,
  getLegacyMarketplaceDocumentIdentity,
  isLegacyMarketplaceDocument,
} from '@/lib/legacy-marketplace/identity';
import { buildLegacyMarketplaceMongoFilter } from '@/lib/legacy-marketplace/data';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';

const indexedBsc97 = {
  network: 'BSC',
  chain: 'BSC',
  chainId: 97,
  collectionAddressNormalized: '0xd4c7b16db234d7f62ba6a8f30153faf85feabec8',
};

describe('identidad Legacy en la BD unificada', () => {
  it('acepta BSC 56/TRON históricos aunque falten campos, y excluye BSC 97', () => {
    expect(getLegacyMarketplaceDocumentIdentity({ network: 'BSC' })).toMatchObject({
      network: 'BSC',
      chainId: 56,
    });
    expect(getLegacyMarketplaceDocumentIdentity({ network: 'TRON' })).toMatchObject({
      network: 'TRON',
      chainId: null,
    });
    expect(getLegacyMarketplaceDocumentIdentity({
      network: 'BSC',
      chainId: 56,
      collectionAddressNormalized: legacyMarketplaceContracts.bsc.contracts.token,
    })).not.toBeNull();
    expect(getLegacyMarketplaceDocumentIdentity(indexedBsc97)).toBeNull();
    expect(isLegacyMarketplaceDocument(indexedBsc97)).toBe(false);
    expect(isLegacyMarketplaceDocument({ network: 'TRON' }, 'BSC')).toBe(false);
  });

  it('no convierte un selector explícito de 97/otra colección en una lectura Legacy', () => {
    expect(normalizeLegacyMarketplaceIdentityInput({ network: 'BSC', chainId: 97 })).toBeNull();
    expect(normalizeLegacyMarketplaceIdentityInput({
      network: 'BSC',
      collection: indexedBsc97.collectionAddressNormalized,
    })).toBeNull();
    expect(normalizeLegacyMarketplaceIdentityInput({ network: 'all' })).toEqual({});
    expect(normalizeLegacyMarketplaceIdentityInput({ network: 'BSC', chainId: 56 })).toEqual({
      network: 'BSC',
      chainId: 56,
    });
  });

  it('compone el filtro de identidad en listado y facetas, sin sobrescribir el $or de búsqueda', () => {
    const filter = buildLegacyMarketplaceMongoFilter({
      search: '42',
      network: 'all',
      marketplaceOnly: true,
    });
    expect(filter.$and).toHaveLength(3);
    const identity = filter.$and?.[0] as { $or?: unknown[] };
    expect(identity.$or).toHaveLength(2);

    const bscFilter = buildLegacyMarketplaceIdentityFilter({ network: 'BSC' });
    expect(bscFilter).toHaveProperty('network');
    expect(bscFilter).toHaveProperty('$and');
  });
});
