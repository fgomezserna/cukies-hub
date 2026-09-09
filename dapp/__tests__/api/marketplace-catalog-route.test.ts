jest.mock('@/lib/legacy-marketplace/data', () => ({
  listLegacyMarketplaceCukies: jest.fn(),
  reconcileLegacyMarketplaceCatalogCandidates: jest.fn(),
}));
jest.mock('@/lib/uki-marketplace', () => ({
  listPublicUkiMarketplacePage: jest.fn(),
}));
jest.mock('@/lib/legacy-marketplace/live-marketplace', () => ({
  verifyLegacyMarketplaceListings: jest.fn(async (items: unknown[]) => items),
  verifyLegacyMarketplaceListingsByNetwork: jest.fn(async (items: unknown[]) => ({
    items,
    unavailableNetworks: [],
  })),
}));

import { NextRequest } from 'next/server';

import { GET } from '@/app/api/marketplace/v1/catalog/route';
import {
  listLegacyMarketplaceCukies,
  reconcileLegacyMarketplaceCatalogCandidates,
} from '@/lib/legacy-marketplace/data';
import { verifyLegacyMarketplaceListingsByNetwork } from '@/lib/legacy-marketplace/live-marketplace';
import { listPublicUkiMarketplacePage } from '@/lib/uki-marketplace';

const legacyList = listLegacyMarketplaceCukies as jest.Mock;
const reconcileLegacy = reconcileLegacyMarketplaceCatalogCandidates as jest.Mock;
const ukiList = listPublicUkiMarketplacePage as jest.Mock;
const verifyLegacy = verifyLegacyMarketplaceListingsByNetwork as jest.Mock;

const facets = {
  states: [],
  networks: [],
  types: [],
  generations: [],
};

function legacyItem(tokenId: string, timestamp: number, network = 'BSC') {
  return { tokenId, timestamp, network, type: '1', skills: { generation: 1 } };
}

function ukiItem(tokenId: string, listedAt: string, orderId = tokenId) {
  return {
    orderId: `0x${orderId.padStart(64, '0')}`,
    chainId: 97,
    marketplaceAddress: '0x0000000000000000000000000000000000001001',
    collectionAddress: '0x0000000000000000000000000000000000001002',
    tokenId,
    seller: '0x00000000000000000000000000000000000000aa',
    ukiPriceRaw: '1000000000000000000',
    expiresAt: '2027-01-01T00:00:00.000Z',
    nonceRaw: '1',
    feeBps: 100,
    status: 'active',
    attentionReason: null,
    buyer: null,
    paymentToken: null,
    paymentAmountRaw: null,
    feeAmountRaw: null,
    listedAt,
    soldAt: null,
    cancelledAt: null,
    expiredAt: null,
    invalidatedAt: null,
    catalogCursor: `cursor-${tokenId}`,
  };
}

function request(query: string) {
  return new NextRequest(`http://localhost/api/marketplace/v1/catalog?${query}`);
}

describe('/api/marketplace/v1/catalog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    legacyList.mockResolvedValue({
      source: 'mongo',
      items: [],
      total: 0,
      offset: 0,
      limit: 24,
      facets,
    });
    ukiList.mockResolvedValue({ orders: [], nextCursor: null, hasMore: false });
    verifyLegacy.mockImplementation(async (items: unknown[]) => ({
      items,
      unavailableNetworks: [],
    }));
    reconcileLegacy.mockResolvedValue(undefined);
  });

  it('avanza por páginas reales sin duplicar ni omitir más de cien resultados', async () => {
    const legacy = Array.from({ length: 130 }, (_, index) =>
      legacyItem(String(index + 1), 2_000_000_000 - index),
    );
    const uki = [
      ukiItem('900', '2025-01-01T00:00:00.000Z'),
      ukiItem('901', '2025-01-01T00:00:00.000Z'),
    ];
    legacyList.mockImplementation(async ({ offset, limit }: { offset: number; limit: number }) => ({
      source: 'mongo',
      items: legacy.slice(offset, offset + limit),
      total: legacy.length,
      offset,
      limit,
      facets,
    }));
    ukiList.mockResolvedValue({
      orders: uki,
      nextCursor: 'cursor-901',
      hasMore: false,
    });

    const seen: string[] = [];
    let query = 'scope=all&limit=24';
    for (let page = 0; page < 8; page += 1) {
      const response = await GET(request(query));
      const body = await response.json();
      expect(response.status).toBe(200);
      seen.push(...body.data.items.map((entry: { source: string; item: { tokenId: string } }) => `${entry.source}:${entry.item.tokenId}`));
      if (!body.data.hasMore) break;
      query = new URLSearchParams({
        scope: 'all',
        limit: '24',
        legacyOffset: String(body.data.cursors.legacyOffset),
        ...(body.data.cursors.ukiCursor ? { ukiCursor: body.data.cursors.ukiCursor } : {}),
      }).toString();
    }

    expect(seen).toHaveLength(132);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain('legacy:130');
    expect(seen).toContain('uki:900');
    expect(seen).toContain('uki:901');
  });

  it('mantiene el orden de cada fuente en empates y busca UKI antes de paginar', async () => {
    const first = legacyItem('9', 1_700_000_000);
    const second = legacyItem('1', 1_700_000_000);
    legacyList.mockResolvedValue({ source: 'mongo', items: [first, second], total: 2, offset: 0, limit: 24, facets });
    ukiList.mockImplementation(async ({ search }: { search?: string }) => ({
      orders: search === 'wallet' ? [ukiItem('77', '2023-11-14T22:13:20.000Z')] : [],
      nextCursor: null,
      hasMore: false,
    }));

    const response = await GET(request('scope=all&limit=24&search=wallet'));
    const body = await response.json();
    expect(body.data.items.map((entry: { source: string; item: { tokenId: string } }) => `${entry.source}:${entry.item.tokenId}`)).toEqual([
      'legacy:9',
      'legacy:1',
      'uki:77',
    ]);
    expect(ukiList).toHaveBeenCalledWith({ limit: 24, cursor: undefined, search: 'wallet' });
  });

  it('conserva una fuente cuando la otra falla y comunica fallo total', async () => {
    legacyList.mockResolvedValue({ source: 'mongo', items: [legacyItem('1', 2_000_000_000)], total: 1, offset: 0, limit: 24, facets });
    ukiList.mockRejectedValue(new Error('UKI down'));
    const partial = await GET(request('scope=all&limit=24'));
    const partialBody = await partial.json();
    expect(partialBody.data.sources).toEqual({ legacy: 'ready', uki: 'unavailable' });
    expect(partialBody.data.items).toHaveLength(1);

    legacyList.mockRejectedValue(new Error('Legacy down'));
    const unavailable = await GET(request('scope=all&limit=24'));
    const unavailableBody = await unavailable.json();
    expect(unavailableBody.data.sources).toEqual({ legacy: 'unavailable', uki: 'unavailable' });
    expect(unavailableBody.data.items).toEqual([]);
  });

  it('rechaza ordenar precios sin una moneda única y conserva filtros Legacy válidos', async () => {
    expect((await GET(request('scope=all&sort=price-asc'))).status).toBe(400);

    await GET(request('scope=legacy&network=BSC&type=2&generation=1&sort=price-asc'));
    expect(legacyList).toHaveBeenCalledWith(expect.objectContaining({
      network: 'BSC',
      type: '2',
      generation: '1',
      sort: 'price-asc',
      marketplaceOnly: true,
    }));
    expect(ukiList).not.toHaveBeenCalled();
  });

  it('descarta anuncios Legacy obsoletos y avanza por los candidatos ya verificados', async () => {
    const candidates = Array.from({ length: 48 }, (_, index) =>
      legacyItem(String(index + 1), 2_000_000_000 - index),
    );
    legacyList.mockImplementation(async ({ offset, limit }: { offset: number; limit: number }) => ({
      source: 'mongo',
      items: candidates.slice(offset, offset + limit),
      total: candidates.length,
      offset,
      limit,
      facets,
    }));
    verifyLegacy
      .mockResolvedValueOnce({ items: [], unavailableNetworks: [] })
      .mockImplementation(async (items: unknown[]) => ({
        items,
        unavailableNetworks: [],
      }));

    const response = await GET(request('scope=legacy&limit=24'));
    const body = await response.json();

    expect(body.data.items).toHaveLength(24);
    expect(body.data.items[0].item.tokenId).toBe('25');
    expect(body.data.cursors.legacyOffset).toBe(48);
    expect(legacyList).toHaveBeenNthCalledWith(2, expect.objectContaining({ offset: 24 }));
  });

  it('conserva BSC verificable cuando TRON no responde y declara la degradación', async () => {
    const bsc = legacyItem('1', 2_000_000_000, 'BSC');
    const tron = legacyItem('2', 1_999_999_999, 'TRON');
    legacyList.mockResolvedValue({
      source: 'mongo',
      items: [bsc, tron],
      total: 2,
      offset: 0,
      limit: 24,
      facets,
    });
    verifyLegacy.mockResolvedValue({
      items: [bsc],
      unavailableNetworks: ['TRON'],
    });

    const response = await GET(request('scope=legacy&limit=24'));
    const body = await response.json();

    expect(body.data.items.map((entry: { item: { tokenId: string } }) => entry.item.tokenId)).toEqual(['1']);
    expect(body.data.sources.legacy).toBe('ready');
    expect(body.data.legacyNetworks).toEqual({ BSC: 'ready', TRON: 'unavailable' });
    expect(reconcileLegacy).toHaveBeenCalledWith(
      [expect.objectContaining({ tokenId: '1', network: 'BSC' })],
      [bsc],
    );
  });

  it('ordena con el precio vivo y persiste la reconciliación de los candidatos', async () => {
    const expensive = { ...legacyItem('1', 2_000_000_000), price: 1, priceOriginal: '1' };
    const cheap = { ...legacyItem('2', 1_999_999_999), price: 2, priceOriginal: '2' };
    legacyList.mockResolvedValue({
      source: 'mongo',
      items: [expensive, cheap],
      total: 2,
      offset: 0,
      limit: 24,
      facets,
    });
    verifyLegacy.mockResolvedValue({
      items: [
        { ...expensive, price: 10, priceOriginal: '10' },
        { ...cheap, price: 5, priceOriginal: '5' },
      ],
      unavailableNetworks: [],
    });

    const response = await GET(request('scope=legacy&network=BSC&limit=24&sort=price-asc'));
    const body = await response.json();

    expect(body.data.items.map((entry: { item: { tokenId: string } }) => entry.item.tokenId)).toEqual(['2', '1']);
    expect(reconcileLegacy).toHaveBeenCalledWith(
      [
        expect.objectContaining({ tokenId: '1', priceOriginal: '1' }),
        expect.objectContaining({ tokenId: '2', priceOriginal: '2' }),
      ],
      expect.arrayContaining([
        expect.objectContaining({ tokenId: '1', priceOriginal: '10' }),
        expect.objectContaining({ tokenId: '2', priceOriginal: '5' }),
      ]),
    );
  });
});
