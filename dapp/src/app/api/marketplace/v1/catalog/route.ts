import { NextRequest, NextResponse } from 'next/server';

import { listLegacyMarketplaceCukies } from '@/lib/legacy-marketplace/data';
import {
  verifyLegacyMarketplaceListingsByNetwork,
  type LegacyMarketplacePausedNetwork,
  type LegacyMarketplaceUnavailableNetwork,
} from '@/lib/legacy-marketplace/live-marketplace';
import type {
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceListResponse,
} from '@/lib/legacy-marketplace/types';
import { listPublicUkiMarketplacePage } from '@/lib/uki-marketplace';
import type {
  UkiMarketplaceOrderView,
  UkiMarketplaceSort,
} from '@/lib/uki-marketplace/types';
import { UkiMarketplaceValidationError } from '@/lib/uki-marketplace/errors';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 24;

type CatalogItem =
  | { source: 'legacy'; item: LegacyMarketplaceCukiItem }
  | { source: 'uki'; item: UkiMarketplaceOrderView };

type CatalogFacets = LegacyMarketplaceListResponse['facets'];

type VerifiedLegacyPage = LegacyMarketplaceListResponse & {
  scannedOffset: number;
  unavailableNetworks: LegacyMarketplaceUnavailableNetwork[];
  pausedNetworks: LegacyMarketplacePausedNetwork[];
};

async function listVerifiedLegacyPage(input: {
  limit: number;
  offset: number;
  search?: string;
  network?: string;
  type?: string;
  generation?: string;
  sort: string;
}): Promise<VerifiedLegacyPage> {
  const verified: LegacyMarketplaceCukiItem[] = [];
  let cursor = input.offset;
  let last: LegacyMarketplaceListResponse | null = null;
  const unavailableNetworks = new Set<LegacyMarketplaceUnavailableNetwork>();
  const pausedNetworks = new Set<LegacyMarketplacePausedNetwork>();
  let facets: LegacyMarketplaceListResponse['facets'] = {
    states: [],
    networks: [],
    types: [],
    generations: [],
  };
  for (let scan = 0; scan < 8 && verified.length < input.limit; scan += 1) {
    const page = await listLegacyMarketplaceCukies({
      ...input,
      offset: cursor,
      marketplaceOnly: true,
      includeFacets: scan === 0,
      hydrateRelations: false,
    });
    last = page;
    if (scan === 0) facets = page.facets;
    if (page.source === 'empty') throw new Error('LEGACY_MARKETPLACE_UNAVAILABLE');
    const candidates = page.items.map((item, index) => ({
      ...item,
      catalogOffset: cursor + index,
    }));
    const verification = await verifyLegacyMarketplaceListingsByNetwork(
      candidates.filter((item) => (
        (item.network !== 'BSC' && item.network !== 'TRON')
        || (!unavailableNetworks.has(item.network) && !pausedNetworks.has(item.network))
      )),
    );
    verification.unavailableNetworks.forEach((network) => unavailableNetworks.add(network));
    verification.pausedNetworks.forEach((network) => pausedNetworks.add(network));
    // Preserve the Mongo candidate order and offset. Reconciliation belongs to
    // confirmed actions; mutating this filtered set while scanning would shift
    // skip/offset pagination and omit or repeat valid listings.
    verified.push(...verification.items);
    cursor += page.items.length;
    if (page.items.length < input.limit || cursor >= page.total) break;
  }
  if (!last) throw new Error('LEGACY_MARKETPLACE_UNAVAILABLE');
  if (
    (input.network === 'BSC' && unavailableNetworks.has('BSC'))
    || (input.network === 'TRON' && unavailableNetworks.has('TRON'))
    || unavailableNetworks.size === 2
  ) {
    throw new Error('LEGACY_MARKETPLACE_RPC_UNAVAILABLE');
  }
  return {
    ...last,
    items: verified.slice(0, input.limit),
    offset: input.offset,
    facets,
    scannedOffset: cursor,
    unavailableNetworks: [...unavailableNetworks],
    pausedNetworks: [...pausedNetworks],
  };
}

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
  return result;
}

function integerParam(request: NextRequest, key: string, fallback: number) {
  const raw = request.nextUrl.searchParams.get(key);
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw))
    throw new UkiMarketplaceValidationError(`invalid ${key}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value))
    throw new UkiMarketplaceValidationError(`invalid ${key}`);
  return value;
}

function catalogScope(value: string) {
  if (value !== 'all' && value !== 'legacy' && value !== 'uki') {
    throw new UkiMarketplaceValidationError('invalid scope');
  }
  return value as 'all' | 'legacy' | 'uki';
}

function catalogNetwork(value: string | undefined) {
  if (value && value !== 'all' && value !== 'BSC' && value !== 'TRON') {
    throw new UkiMarketplaceValidationError('invalid network');
  }
  return value === 'all' ? undefined : value;
}

const rarityAliases: Record<string, string> = {
  '1': 'common',
  common: 'common',
  '2': 'uncommon',
  uncommon: 'uncommon',
  'no común': 'uncommon',
  'no-comun': 'uncommon',
  '3': 'rare',
  rare: 'rare',
  raro: 'rare',
  '4': 'epic',
  epic: 'epic',
  épico: 'epic',
  '5': 'legendary',
  legendary: 'legendary',
  legendario: 'legendary',
  '6': 'goat',
  goat: 'goat',
};

function normalizeRarityFacet(value: unknown) {
  if (value === null || value === undefined) return null;
  return rarityAliases[String(value).trim().toLowerCase()] ?? null;
}

function normalizeGenerationFacet(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'original', 'first', 'first_generation', 'genesis'].includes(normalized)) {
    return 'original';
  }
  if (['2', 'second', 'second_generation', 'bred', 'breeding'].includes(normalized)) {
    return 'second_generation';
  }
  return null;
}

function mergeFacetRows(
  rows: Array<{ value: string; count: number }>,
  normalize: (value: unknown) => string | null,
) {
  const counts = new Map<string, number>();
  rows.forEach((row) => {
    const normalized = normalize(row.value);
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + row.count);
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((left, right) => left.value.localeCompare(right.value));
}

function buildCatalogFacets(
  legacyFacets: CatalogFacets,
  ukiItems: UkiMarketplaceOrderView[],
): CatalogFacets {
  const ukiTypes = ukiItems.flatMap((item) => item.rarity ? [{ value: item.rarity, count: 1 }] : []);
  const ukiGenerations = ukiItems.flatMap((item) => item.generation ? [{ value: item.generation, count: 1 }] : []);
  return {
    states: legacyFacets.states,
    networks: legacyFacets.networks,
    types: mergeFacetRows([...legacyFacets.types, ...ukiTypes], normalizeRarityFacet),
    generations: mergeFacetRows(
      [...legacyFacets.generations, ...ukiGenerations],
      normalizeGenerationFacet,
    ),
  };
}

function priceSortCurrency(
  scope: 'all' | 'legacy' | 'uki',
  network: string | undefined,
) {
  if (scope === 'uki' && (!network || network === 'BSC')) return 'UKI';
  if (network === 'TRON' && scope !== 'uki') return 'TRX';
  if (scope === 'legacy' && network === 'BSC') return 'BNB';
  return null;
}

function compareNewest(left: CatalogItem, right: CatalogItem) {
  const normalizeTimestamp = (value: number) =>
    value > 0 && value < 1_000_000_000_000 ? value * 1_000 : value;
  const leftDate = normalizeTimestamp(
    left.source === 'legacy'
      ? left.item.timestamp ?? 0
      : Date.parse(left.item.listedAt) || 0,
  );
  const rightDate = normalizeTimestamp(
    right.source === 'legacy'
      ? right.item.timestamp ?? 0
      : Date.parse(right.item.listedAt) || 0,
  );
  if (rightDate !== leftDate) return rightDate - leftDate;
  // Preserve each source's server order on timestamp ties. Its offset/cursor
  // advances through that exact order, so reordering here would skip records.
  if (left.source === right.source) return 0;
  const leftKey = `${left.source}:${
    left.source === 'legacy'
      ? `${left.item.network}:${left.item.tokenId}`
      : `${left.item.collectionAddress}:${left.item.tokenId}:${left.item.orderId}`
  }`;
  const rightKey = `${right.source}:${
    right.source === 'legacy'
      ? `${right.item.network}:${right.item.tokenId}`
      : `${right.item.collectionAddress}:${right.item.tokenId}:${right.item.orderId}`
  }`;
  return leftKey.localeCompare(rightKey);
}

function compareNumber(left: CatalogItem, right: CatalogItem) {
  const leftId = BigInt(
    left.source === 'legacy' ? left.item.tokenId : left.item.tokenId,
  );
  const rightId = BigInt(
    right.source === 'legacy' ? right.item.tokenId : right.item.tokenId,
  );
  return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const limit = Math.min(
      integerParam(request, 'limit', PAGE_SIZE),
      PAGE_SIZE,
    );
    if (limit < 1)
      throw new UkiMarketplaceValidationError('limit must be positive');
    const legacyOffset = integerParam(request, 'legacyOffset', 0);
    const ukiCursor = params.get('ukiCursor') || undefined;
    const scope = catalogScope(params.get('scope') ?? 'all');
    const network = catalogNetwork(params.get('network') || undefined);
    const type = params.get('type') || undefined;
    const generation = params.get('generation') || undefined;
    const search = params.get('search') || undefined;
    const sort = params.get('sort') || 'newest';
    if (
      ![
        'newest',
        'number-asc',
        'number-desc',
        'price-asc',
        'price-desc',
      ].includes(sort)
    ) {
      throw new UkiMarketplaceValidationError('invalid sort');
    }
    const selectedPriceCurrency = sort.startsWith('price-')
      ? priceSortCurrency(scope, network)
      : null;
    if (sort.startsWith('price-') && !selectedPriceCurrency) {
      throw new UkiMarketplaceValidationError(
        'price sorting requires one selected currency',
      );
    }
    if (
      (sort === 'number-asc' || sort === 'number-desc') &&
      scope !== 'legacy'
    ) {
      throw new UkiMarketplaceValidationError(
        'number sorting requires the Legacy catalog',
      );
    }

    const wantLegacy = scope !== 'uki';
    const wantUki = scope !== 'legacy' && network !== 'TRON';
    const [legacyResult, ukiResult] = await Promise.allSettled([
      wantLegacy
        ? listVerifiedLegacyPage({
            limit,
            offset: legacyOffset,
            search,
            network,
            type,
            generation,
            sort:
              sort === 'price-asc' ||
              sort === 'price-desc' ||
              sort === 'number-asc' ||
              sort === 'number-desc'
                ? sort
                : 'newest',
          })
        : Promise.resolve(null),
      wantUki
        ? listPublicUkiMarketplacePage({
            limit,
            cursor: ukiCursor,
            search,
            ...(type ? { type } : {}),
            ...(generation ? { generation } : {}),
            ...(sort.startsWith('price-')
              ? { sort: sort as UkiMarketplaceSort }
              : {}),
          })
        : Promise.resolve(null),
    ]);

    for (const result of [legacyResult, ukiResult]) {
      if (
        result.status === 'rejected' &&
        result.reason instanceof UkiMarketplaceValidationError
      ) {
        throw result.reason;
      }
    }

    const legacy =
      legacyResult.status === 'fulfilled' ? legacyResult.value : null;
    const uki = ukiResult.status === 'fulfilled' ? ukiResult.value : null;
    const legacyItems: CatalogItem[] =
      legacy?.items.map((item) => ({ source: 'legacy', item })) ?? [];
    const ukiItems: CatalogItem[] =
      uki?.orders.map((item) => ({ source: 'uki', item })) ?? [];
    const merged = [...legacyItems, ...ukiItems];
    if (sort === 'price-asc' || sort === 'price-desc') {
      // Cada fuente ya viene ordenada por la moneda seleccionada. Nunca se
      // mezclan UKI, BNB y TRX en una comparación numérica común.
    } else if (sort === 'number-asc' || sort === 'number-desc') {
      merged.sort(
        (left, right) =>
          (sort === 'number-asc' ? 1 : -1) * compareNumber(left, right),
      );
    } else {
      merged.sort(compareNewest);
    }

    // Consume only prefixes from each source, preserving its cursor for the next page.
    const selected = merged.slice(0, limit);
    const selectedLegacy = selected.filter(
      (entry): entry is Extract<CatalogItem, { source: 'legacy' }> =>
        entry.source === 'legacy',
    );
    const consumedLegacy = selectedLegacy.length;
    const consumedUki = selected.filter(
      (entry) => entry.source === 'uki',
    ).length;
    const selectedUki = selected.filter(
      (entry): entry is Extract<CatalogItem, { source: 'uki' }> =>
        entry.source === 'uki',
    );
    const lastSelectedUki = selectedUki.at(-1)?.item.catalogCursor;
    const lastSelectedLegacyOffset = selectedLegacy.at(-1)?.item.catalogOffset;
    const nextLegacyOffset = lastSelectedLegacyOffset !== undefined
      ? lastSelectedLegacyOffset + 1
      : legacyItems.length === 0
        ? legacy?.scannedOffset ?? legacyOffset
        : legacyOffset;
    const nextUkiCursor =
      consumedUki > 0
        ? lastSelectedUki ?? uki?.nextCursor ?? ukiCursor ?? null
        : ukiItems.length === 0
        ? uki?.nextCursor ?? ukiCursor ?? null
        : ukiCursor ?? null;
    const hasMore = Boolean(
      (legacy && nextLegacyOffset < legacy.total) ||
        (uki && (uki.hasMore || ukiItems.length > consumedUki)),
    );

    return response({
      status: 'ok',
      data: {
        items: selected,
        cursors: { legacyOffset: nextLegacyOffset, ukiCursor: nextUkiCursor },
        hasMore,
        legacyFacets:
          legacy?.facets ??
          ({
            states: [],
            networks: [],
            types: [],
            generations: [],
          } satisfies LegacyMarketplaceListResponse['facets']),
        facets: buildCatalogFacets(
          legacy?.facets ?? {
            states: [],
            networks: [],
            types: [],
            generations: [],
          },
          uki?.orders ?? [],
        ),
        sources: {
          legacy:
            wantLegacy && legacyResult.status === 'fulfilled' && legacy?.source !== 'empty'
              ? 'ready'
              : 'unavailable',
          uki:
            wantUki && ukiResult.status === 'fulfilled' && uki !== null
              ? 'ready'
              : 'unavailable',
        },
        legacyNetworks: {
          BSC: legacy?.unavailableNetworks.includes('BSC')
            ? 'unavailable'
            : legacy?.pausedNetworks.includes('BSC')
              ? 'paused'
            : 'ready',
          TRON: legacy?.unavailableNetworks.includes('TRON')
            ? 'unavailable'
            : legacy?.pausedNetworks.includes('TRON')
              ? 'paused'
            : 'ready',
        },
      },
    });
  } catch (error) {
    if (error instanceof UkiMarketplaceValidationError) {
      return response(
        { status: 'error', code: 'INVALID_MARKETPLACE_REQUEST' },
        400,
      );
    }
    return response(
      { status: 'error', code: 'MARKETPLACE_CATALOG_UNAVAILABLE' },
      503,
    );
  }
}
