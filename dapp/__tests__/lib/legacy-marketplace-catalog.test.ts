jest.mock('server-only', () => ({}));
jest.mock('@/lib/mongodb-cukies', () => ({ cukiesDb: jest.fn() }));

import { buildLegacyMarketplaceMongoFilter } from '@/lib/legacy-marketplace/data';
import {
  getLegacyMarketplaceDetailHref,
  matchesLegacyMarketplaceIdentity,
} from '@/lib/legacy-marketplace/identity';
import { legacyMarketplaceContracts } from '@/lib/legacy-marketplace/config';
import type { LegacyMarketplaceCukiItem } from '@/lib/legacy-marketplace/types';

const cuki = {
  id: '4000000008733',
  tokenId: '4000000008733',
  chainId: null,
  collectionAddress: legacyMarketplaceContracts.tron.contracts.token,
  network: 'TRON',
} as LegacyMarketplaceCukiItem;

describe('catálogo e identidad del marketplace Legacy', () => {
  it('publica solo anuncios con estado de venta y precio bruto positivo', () => {
    const filter = buildLegacyMarketplaceMongoFilter({ marketplaceOnly: true });
    expect(filter.$and).toEqual(expect.arrayContaining([
      {
        state: 'onSale',
        priceOriginal: { $type: 'string', $regex: /^[1-9]\d*$/ },
      },
    ]));
    expect(filter.$and?.[0]).toHaveProperty('$or');
  });

  it('acepta los valores canonicos de tipo y generacion compartidos con V2', () => {
    const filter = buildLegacyMarketplaceMongoFilter({
      type: 'rare',
      generation: 'second_generation',
    });
    expect(filter.$and).toEqual(expect.arrayContaining([
      { type: { $in: [3, '3', 'rare', 'raro'] } },
      { 'skills.generation': { $in: [2, '2', 'second_generation', 'second'] } },
    ]));
  });

  it('mantiene red, colección y token en el enlace de detalle', () => {
    const href = getLegacyMarketplaceDetailHref(cuki);
    expect(href).toContain('/marketplace/4000000008733?');
    expect(href).toContain('source=legacy');
    expect(href).toContain('network=TRON');
    expect(href).toContain(`collection=${legacyMarketplaceContracts.tron.contracts.token}`);
  });

  it('falla cerrado si el detalle no coincide con la identidad enlazada', () => {
    expect(matchesLegacyMarketplaceIdentity(cuki, {
      network: 'TRON',
      collection: legacyMarketplaceContracts.tron.contracts.token,
    })).toBe(true);
    expect(matchesLegacyMarketplaceIdentity(cuki, { network: 'BSC' })).toBe(false);
  });
});
