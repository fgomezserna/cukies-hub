import 'server-only';

import type { Collection, Filter, Sort } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import {
  getLegacyMarketplaceNftImageUrl,
  normalizeLegacyMarketplaceNftImageUrl,
} from '@/lib/legacy-marketplace/config';
import {
  getLegacyBreedingIdentity,
  isLegacyBreedingCandidate,
  isLegacyBreedingEligibilityKnown,
  isLegacyBreedingIdentity,
  isLegacyBreedingOwner,
} from '@/lib/legacy-marketplace/breeding-identity';
import {
  legacyCukiNetworks,
  legacyCukiStates,
  type LegacyBreedingCandidatesParams,
  type LegacyBreedingCandidatesResponse,
  type LegacyBreedingReadStatus,
  type LegacyCompletedBreedsParams,
  type LegacyCompletedBreedsResponse,
  type LegacyCukiePointsParams,
  type LegacyCukiePointsResponse,
  type LegacyCukiePointsTransaction,
  type LegacyCukiNetwork,
  type LegacyCukiState,
  type LegacyMarketplaceCukiHistoryEntry,
  type LegacyMarketplaceCukiItem,
  type LegacyMarketplaceCukiReference,
  type LegacyMarketplaceFacet,
  type LegacyMarketplaceListParams,
  type LegacyMarketplaceListResponse,
} from '@/lib/legacy-marketplace/types';
import {
  getLegacyPointExplorerUrl,
  legacyMarketplaceRuntime,
} from '@/lib/legacy-marketplace/runtime';
import {
  readLegacyMarketplaceBreedingCount,
  readLegacyMarketplaceMaxBreeds,
  readLegacyMarketplaceOwner,
} from '@/lib/legacy-marketplace/live-marketplace';

type CukiDocument = {
  _id: string;
  tokenId?: unknown;
  chainId?: unknown;
  collectionAddress?: unknown;
  collectionAddressNormalized?: unknown;
  user?: unknown;
  owner?: unknown;
  ownerNormalized?: unknown;
  network?: unknown;
  origin?: unknown;
  birthNetwork?: unknown;
  img?: unknown;
  type?: unknown;
  cukiNumber?: unknown;
  skills?: unknown;
  children?: unknown;
  parents?: unknown;
  numChildren?: unknown;
  numChildrenTron?: unknown;
  numChildrenBsc?: unknown;
  price?: unknown;
  state?: unknown;
  timeStamp?: unknown;
  priceOriginal?: unknown;
  priceRaw?: unknown;
  needsMetadata?: unknown;
  marketplaceListingStatus?: unknown;
  marketplaceListingChain?: unknown;
  marketplaceListingOwnerNormalized?: unknown;
  marketplaceListingEventId?: unknown;
};

type HistoryDocument = {
  _id: string;
  transactionId?: unknown;
  txHash?: unknown;
  network?: unknown;
  chain?: unknown;
  from?: unknown;
  to?: unknown;
  date?: unknown;
  type?: unknown;
  price?: unknown;
  eventName?: unknown;
  timestampMs?: unknown;
  tokenId?: unknown;
  blockNumber?: unknown;
  logIndex?: unknown;
};

type ChainEventDocument = {
  _id: string;
  chain?: unknown;
  eventName?: unknown;
  args?: unknown;
  txHash?: unknown;
  blockNumber?: unknown;
  logIndex?: unknown;
  timestampMs?: unknown;
};

type PointDocument = {
  _id: unknown;
  address?: unknown;
  addressNormalized?: unknown;
  points?: unknown;
  type?: unknown;
  date?: unknown;
  timestampMs?: unknown;
  txHash?: unknown;
  transactionId?: unknown;
  chain?: unknown;
  network?: unknown;
  chainId?: unknown;
};

const MAX_LIMIT = 60;
const DEFAULT_LIMIT = 24;
const MAX_CURRENT_OWNER_READS = 60;

function toStringOrNull(value: unknown) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLimit(value?: number) {
  if (!value || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
}

function normalizeOffset(value?: number) {
  if (!value || !Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function normalizeTimestampMs(value: unknown) {
  if (value instanceof Date) return value.getTime();

  const parsed = toNumberOrNull(value);
  if (parsed !== null) return parsed < 10_000_000_000 ? parsed * 1000 : parsed;

  const stringValue = toStringOrNull(value);
  if (!stringValue) return null;

  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function normalizeTimestampSeconds(value: unknown) {
  const timestamp = normalizeTimestampMs(value);
  return timestamp === null ? null : Math.trunc(timestamp / 1000);
}

function isKnownNetwork(value?: string): value is LegacyCukiNetwork {
  return legacyCukiNetworks.includes(value as LegacyCukiNetwork);
}

function isKnownState(value?: string): value is LegacyCukiState {
  return legacyCukiStates.includes(value as LegacyCukiState);
}

function normalizeAddressForLookup(value: string) {
  if (value.startsWith('0x')) return value.toLowerCase();
  return value.toUpperCase();
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeImageUrl(tokenId: string, imageUrl: unknown) {
  return normalizeLegacyMarketplaceNftImageUrl(tokenId, toStringOrNull(imageUrl));
}

function normalizeFacet(rows: Array<{ _id: unknown; count: number }>) {
  return rows
    .filter((row) => row._id !== null && row._id !== undefined)
    .map((row) => ({
      value: String(row._id),
      count: row.count,
    })) satisfies LegacyMarketplaceFacet[];
}

async function getCukiesCollection() {
  const db = await getIndexerDb();
  return db.collection<CukiDocument>('cukies');
}

async function getHistoryCollection() {
  const db = await getIndexerDb();
  return db.collection<HistoryDocument>('tx_nfts');
}

async function getChainEventsCollection() {
  const db = await getIndexerDb();
  return db.collection<ChainEventDocument>('chain_events');
}

async function getPointsCollection() {
  const db = await getIndexerDb();
  return db.collection<PointDocument>('point_transactions');
}

async function readCurrentLegacyOwners(items: LegacyMarketplaceCukiItem[]) {
  const owners: Array<string | null> = Array.from({ length: items.length }, () => null);
  const readableItems = items.slice(0, MAX_CURRENT_OWNER_READS);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < readableItems.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        owners[index] = await readLegacyMarketplaceOwner(readableItems[index]);
      } catch {
        owners[index] = null;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(8, readableItems.length) }, () => worker()),
  );
  return owners;
}

async function readCurrentLegacyBreedingCounts(items: LegacyMarketplaceCukiItem[]) {
  const counts: Array<number | null> = Array.from({ length: items.length }, () => null);
  const readableItems = items.slice(0, MAX_CURRENT_OWNER_READS);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < readableItems.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        counts[index] = await readLegacyMarketplaceBreedingCount(readableItems[index]);
      } catch {
        counts[index] = null;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(8, readableItems.length) }, () => worker()),
  );
  return counts;
}

function getRecordValue(value: unknown, key: string) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function normalizeHistoryEventType(eventName: string | null, fallback?: unknown) {
  const type = toStringOrNull(fallback);
  if (type) return type;

  switch (eventName) {
    case 'TokenOnSale':
      return 'PutOnSale';
    case 'MarketTokenSaleCancelled':
      return 'CancelSale';
    case 'TokenBought':
      return 'Buy';
    case 'BreedFinish':
      return 'Breed';
    default:
      return eventName ?? 'Transaction';
  }
}

function scaleBscWeiPrice(value: unknown) {
  const stringValue = toStringOrNull(value);
  if (!stringValue) return null;

  try {
    return Number(
      (BigInt(stringValue) * BigInt(10_000)) /
        BigInt('1000000000000000000'),
    );
  } catch {
    return null;
  }
}

function normalizeRelation(value: unknown): LegacyMarketplaceCukiReference | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const id = String(value);

    return {
      id,
      tokenId: id,
      cukiNumber: null,
      network: null,
      birthNetwork: null,
      state: null,
      imageUrl: getLegacyMarketplaceNftImageUrl(id),
      generation: null,
    };
  }

  if (typeof value !== 'object') return null;

  const document = value as CukiDocument;
  const id = toStringOrNull(document.tokenId) ?? toStringOrNull(document._id);
  if (!id) return null;

  const skills =
    document.skills && typeof document.skills === 'object'
      ? (document.skills as LegacyMarketplaceCukiItem['skills'])
      : {};

  return {
    id,
    tokenId: id,
    chainId: toNumberOrNull(document.chainId),
    collectionAddress:
      toStringOrNull(document.collectionAddressNormalized)
      ?? toStringOrNull(document.collectionAddress),
    cukiNumber: toNumberOrNull(document.cukiNumber),
    network: toStringOrNull(document.network),
    birthNetwork: toStringOrNull(document.birthNetwork),
    state: toStringOrNull(document.state),
    imageUrl: normalizeImageUrl(id, document.img),
    generation: toNumberOrNull(skills.generation),
  };
}

function normalizeRelations(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeRelation(item))
    .filter((item): item is LegacyMarketplaceCukiReference => item !== null);
}

function normalizeHistoryEntry(document: HistoryDocument): LegacyMarketplaceCukiHistoryEntry {
  const network = toStringOrNull(document.network) ?? toStringOrNull(document.chain);
  const transactionId = toStringOrNull(document.transactionId) ?? toStringOrNull(document.txHash);
  const id = toStringOrNull(document._id) ?? transactionId ?? '';
  const eventName = toStringOrNull(document.eventName);

  return {
    id,
    transactionId,
    type: normalizeHistoryEventType(eventName, document.type),
    from: toStringOrNull(document.from),
    to: toStringOrNull(document.to),
    date: normalizeTimestampMs(document.timestampMs ?? document.date),
    price: toNumberOrNull(document.price),
    network,
    blockNumber: toNumberOrNull(document.blockNumber),
    logIndex: toNumberOrNull(document.logIndex),
  };
}

function normalizeChainHistoryEntry(
  document: ChainEventDocument,
): LegacyMarketplaceCukiHistoryEntry | null {
  const eventName = toStringOrNull(document.eventName);
  if (eventName !== 'TokenOnSale') return null;

  const args = document.args;
  const id = toStringOrNull(document._id);
  const transactionId = toStringOrNull(document.txHash);
  if (!id && !transactionId) return null;

  return {
    id: id ?? transactionId ?? '',
    transactionId,
    type: normalizeHistoryEventType(eventName),
    from: toStringOrNull(getRecordValue(args, 'owner')),
    to: null,
    date: normalizeTimestampMs(
      document.timestampMs ?? getRecordValue(args, 'createdAt'),
    ),
    price: scaleBscWeiPrice(getRecordValue(args, 'price')),
    network: toStringOrNull(document.chain),
    blockNumber: toNumberOrNull(document.blockNumber),
    logIndex: toNumberOrNull(document.logIndex),
  };
}

function normalizeCuki(document: CukiDocument): LegacyMarketplaceCukiItem {
  const id = toStringOrNull(document.tokenId) ?? toStringOrNull(document._id) ?? '';
  const skills =
    document.skills && typeof document.skills === 'object'
      ? (document.skills as LegacyMarketplaceCukiItem['skills'])
      : {};
  const children = normalizeRelations(document.children);
  const owner = toStringOrNull(document.owner) ?? toStringOrNull(document.user);

  return {
    id,
    tokenId: id,
    chainId: toNumberOrNull(document.chainId),
    collectionAddress: toStringOrNull(document.collectionAddressNormalized),
    cukiNumber: toNumberOrNull(document.cukiNumber),
    owner,
    ownerNormalized: toStringOrNull(document.ownerNormalized),
    network: toStringOrNull(document.network) ?? 'TRON',
    origin: toStringOrNull(document.origin),
    birthNetwork: toStringOrNull(document.birthNetwork),
    imageUrl: normalizeImageUrl(id, document.img),
    type: toNumberOrNull(document.type) ?? toStringOrNull(document.type),
    state: toStringOrNull(document.state) ?? 'available',
    price: toNumberOrNull(document.price),
    priceOriginal: toStringOrNull(document.priceOriginal) ?? toStringOrNull(document.priceRaw),
    skills,
    childrenCount: toNumberOrNull(document.numChildren),
    childrenCountTron: toNumberOrNull(document.numChildrenTron),
    childrenCountBsc: toNumberOrNull(document.numChildrenBsc),
    parents: normalizeRelations(document.parents),
    children,
    history: [],
    timestamp: normalizeTimestampSeconds(document.timeStamp),
  };
}

async function hydrateCukiRelations(
  document: CukiDocument,
  collection: Collection<CukiDocument>,
) {
  const relationIds = [
    ...(Array.isArray(document.parents) ? document.parents : []),
    ...(Array.isArray(document.children) ? document.children : []),
  ]
    .map((value) => toStringOrNull(value))
    .filter((value): value is string => value !== null);

  if (relationIds.length === 0) return document;

  const relationDocuments = await collection
    .find({ _id: { $in: [...new Set(relationIds)] } })
    .toArray();
  const relationById = new Map(relationDocuments.map((item) => [item._id, item]));

  return {
    ...document,
    parents: Array.isArray(document.parents)
      ? document.parents.map((value) => {
          const id = toStringOrNull(value);
          return id ? relationById.get(id) ?? value : value;
        })
      : document.parents,
    children: Array.isArray(document.children)
      ? document.children.map((value) => {
          const id = toStringOrNull(value);
          return id ? relationById.get(id) ?? value : value;
        })
      : document.children,
  };
}

async function hydrateCukiHistory(item: LegacyMarketplaceCukiItem) {
  const [historyCollection, chainEventsCollection] = await Promise.all([
    getHistoryCollection(),
    getChainEventsCollection(),
  ]);
  const [history, saleEvents] = await Promise.all([
    historyCollection
      .find({ tokenId: item.tokenId })
      .sort({ timestampMs: -1, _id: -1 })
      .limit(80)
      .toArray(),
    chainEventsCollection
      .find({
        eventName: 'TokenOnSale',
        'args.tokenId': item.tokenId,
      })
      .sort({ timestampMs: -1, _id: -1 })
      .limit(80)
      .toArray(),
  ]);
  const entries = [
    ...history.map(normalizeHistoryEntry),
    ...saleEvents
      .map((event) => normalizeChainHistoryEntry(event))
      .filter((event): event is LegacyMarketplaceCukiHistoryEntry => event !== null),
  ];

  return {
    ...item,
    history: Array.from(new Map(entries.map((entry) => [entry.id, entry])).values())
      .sort((left, right) => (right.date ?? 0) - (left.date ?? 0)),
  };
}

async function getFacets(collection: Collection<CukiDocument>) {
  const [states, networks, types, generations] = await Promise.all([
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: '$state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: '$network', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $group: { _id: '$skills.generation', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
  ]);

  return {
    states: normalizeFacet(states),
    networks: normalizeFacet(networks),
    types: normalizeFacet(types),
    generations: normalizeFacet(generations),
  };
}

export function buildCukiFilter(params: LegacyMarketplaceListParams) {
  const filter: Filter<CukiDocument> = {};
  const search = params.search?.trim();

  if (isKnownNetwork(params.network)) filter.network = params.network;
  if (isKnownState(params.state)) filter.state = params.state;

  if (params.marketplaceOnly || params.state === 'onSale') {
    filter.state = 'onSale';
    filter.marketplaceListingStatus = 'active';
    filter.ownerNormalized = { $type: 'string', $ne: '' };
    filter.marketplaceListingOwnerNormalized = { $type: 'string', $ne: '' };
    filter.marketplaceListingEventId = { $type: 'string', $ne: '' };
    filter.$expr = {
      $and: [
        { $eq: ['$ownerNormalized', '$marketplaceListingOwnerNormalized'] },
        { $eq: ['$network', '$marketplaceListingChain'] },
      ],
    };
  }

  if (params.type && params.type !== 'all') {
    const parsedType = Number(params.type);
    filter.type = Number.isFinite(parsedType) ? parsedType : params.type;
  }

  if (params.generation && params.generation !== 'all') {
    const parsedGeneration = Number(params.generation);
    if (Number.isFinite(parsedGeneration)) {
      filter['skills.generation'] = parsedGeneration;
    }
  }

  if (params.owner?.trim()) {
    const owner = params.owner.trim();
    filter.$or = [
      { ownerNormalized: normalizeAddressForLookup(owner) },
      { owner: new RegExp(`^${escapeRegex(owner)}$`, 'i') },
      { user: new RegExp(`^${escapeRegex(owner)}$`, 'i') },
    ];
  }

  if (search) {
    const numericSearch = Number(search);
    const searchConditions: Filter<CukiDocument>[] = [
      { _id: search },
      { tokenId: search },
      { owner: new RegExp(escapeRegex(search), 'i') },
      { user: new RegExp(escapeRegex(search), 'i') },
    ];

    if (Number.isFinite(numericSearch)) {
      searchConditions.push({ cukiNumber: numericSearch }, { type: numericSearch });
    }

    filter.$and = [...(filter.$and ?? []), { $or: searchConditions }];
  }

  return filter;
}

function buildCukiSort(sort?: string): Sort {
  switch (sort) {
    case 'price-asc':
      return { price: 1, timeStamp: -1, _id: 1 };
    case 'price-desc':
      return { price: -1, timeStamp: -1, _id: 1 };
    case 'number-asc':
      return { cukiNumber: 1, _id: 1 };
    case 'number-desc':
      return { cukiNumber: -1, _id: -1 };
    case 'newest':
    default:
      return { timeStamp: -1, _id: -1 };
  }
}

export async function listCukies(
  params: LegacyMarketplaceListParams,
): Promise<LegacyMarketplaceListResponse> {
  const limit = normalizeLimit(params.limit);
  const offset = normalizeOffset(params.offset);
  const collection = await getCukiesCollection();
  const filter = buildCukiFilter(params);
  const [items, total, facets] = await Promise.all([
    collection
      .find(filter)
      .sort(buildCukiSort(params.sort))
      .skip(offset)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
    getFacets(collection),
  ]);

  return {
    source: 'mongo',
    items: items.map(normalizeCuki),
    total,
    offset,
    limit,
    facets,
  };
}

export async function getCuki(tokenId: string) {
  const collection = await getCukiesCollection();
  const document = await collection.findOne({ _id: tokenId });

  if (!document) return null;

  const hydrated = await hydrateCukiRelations(document, collection);
  return hydrateCukiHistory(normalizeCuki(hydrated));
}

export async function listBreedingCandidates(
  params: LegacyBreedingCandidatesParams,
): Promise<LegacyBreedingCandidatesResponse> {
  const limit = normalizeLimit(params.limit ?? 60);
  const maxBreeds =
    params.maxBreeds !== undefined && Number.isFinite(params.maxBreeds)
      ? Math.max(Math.trunc(params.maxBreeds), 0)
      : null;
  const identity = getLegacyBreedingIdentity(params.network);
  const owner = params.owner?.trim() ?? '';

  if (!identity || !owner || maxBreeds === null) {
    return {
      source: 'empty',
      items: [],
      total: 0,
      maxBreeds,
      status: 'unknown',
      error: 'No se pudo verificar la identidad Legacy de los candidatos.',
    };
  }

  const collection = await getCukiesCollection();
  const filter: Filter<CukiDocument> = {
    state: 'available',
    network: identity.network,
  };

  filter.$or = [
    { ownerNormalized: normalizeAddressForLookup(owner) },
    { owner: new RegExp(`^${escapeRegex(owner)}$`, 'i') },
    { user: new RegExp(`^${escapeRegex(owner)}$`, 'i') },
  ];

  const documents = await collection
    .find(filter)
    .sort({ cukiNumber: 1, _id: 1 })
    .limit(Math.min(limit * 3, 180))
    .toArray();

  if (documents.length > 0) {
    let currentMaxBreeds: number;
    try {
      currentMaxBreeds = await readLegacyMarketplaceMaxBreeds(identity.network);
    } catch {
      return {
        source: 'mongo',
        items: [],
        total: 0,
        maxBreeds,
        status: 'unknown',
        error: 'No se pudo verificar la elegibilidad Legacy ahora.',
      };
    }
    if (currentMaxBreeds !== maxBreeds) {
      return {
        source: 'mongo',
        items: [],
        total: 0,
        maxBreeds,
        status: 'partial',
        error: 'La elegibilidad Legacy ha cambiado. Actualiza para reintentar.',
      };
    }
  }

  let hasUnknownEvidence = false;
  const pending = [] as LegacyMarketplaceCukiItem[];
  for (const document of documents) {
    const item = normalizeCuki(document);
    const identityKnown = isLegacyBreedingIdentity(document, identity.network);
    const ownerKnown = isLegacyBreedingOwner(document, identity.network, owner);

    if (!identityKnown || !ownerKnown) {
      hasUnknownEvidence = true;
      continue;
    }
    pending.push(item);
  }

  const [currentOwners, currentBreedingCounts] = await Promise.all([
    readCurrentLegacyOwners(pending),
    readCurrentLegacyBreedingCounts(pending),
  ]);
  const items = [] as LegacyMarketplaceCukiItem[];
  pending.forEach((item, index) => {
    const currentOwner = currentOwners[index];
    const currentBreedingCount = currentBreedingCounts[index];
    if (!currentOwner || currentBreedingCount === null) {
      hasUnknownEvidence = true;
      return;
    }

    if (
      item.childrenCount !== null
      && item.childrenCount !== currentBreedingCount
    ) {
      hasUnknownEvidence = true;
      return;
    }

    const verifiedItem = {
      ...item,
      childrenCount: currentBreedingCount,
      identityVerified: true,
      ownershipVerified: true,
      ownershipSource: 'legacy-ownerOf' as const,
      eligibilityVerified: true,
      eligibilitySource: 'legacy-getNumBreedsByCukie' as const,
      owner: currentOwner,
      ownerNormalized: currentOwner,
    };
    if (
      isLegacyBreedingEligibilityKnown(verifiedItem, maxBreeds)
      && isLegacyBreedingCandidate(verifiedItem, identity.network, owner, maxBreeds)
    ) {
      items.push(verifiedItem);
    }
  });

  const status: LegacyBreedingReadStatus =
    documents.length === 0 ? 'unknown' : hasUnknownEvidence ? 'partial' : 'verified';
  const visibleItems = items.slice(0, limit);

  return {
    source: 'mongo',
    items: visibleItems,
    total: visibleItems.length,
    maxBreeds,
    status,
    ...(status === 'unknown'
      ? { error: 'No se pudo verificar la identidad Legacy de los candidatos.' }
      : status === 'partial'
        ? { error: 'Algunos candidatos no tienen una identidad o elegibilidad Legacy verificable.' }
        : {}),
  };
}

export async function listCompletedBreeds(
  params: LegacyCompletedBreedsParams,
): Promise<LegacyCompletedBreedsResponse> {
  const limit = normalizeLimit(params.limit ?? 24);
  const offset = normalizeOffset(params.offset);
  const identity = getLegacyBreedingIdentity(params.network);
  const filter: Filter<CukiDocument> = {
    origin: 'breed',
  };
  const wallets = params.wallets
    ?.map((wallet) => wallet.trim())
    .filter((wallet) => wallet.length > 0);

  if (!identity || !wallets?.length) {
    return {
      source: 'empty',
      items: [],
      total: 0,
      offset,
      limit,
      status: 'unknown',
      error: 'No se pudo verificar la identidad Legacy de los resultados.',
    };
  }

  const collection = await getCukiesCollection();
  filter.network = identity.network;
  if (wallets.length) {
    filter.$or = wallets.flatMap((wallet) => [
      { ownerNormalized: normalizeAddressForLookup(wallet) },
      { owner: new RegExp(`^${escapeRegex(wallet)}$`, 'i') },
      { user: new RegExp(`^${escapeRegex(wallet)}$`, 'i') },
    ]);
  }

  const documents = await collection
    .find(filter)
    .sort({ timeStamp: -1, cukiNumber: -1, _id: -1 })
    .skip(0)
    .limit(Math.min((offset + limit) * 3, 180))
    .toArray();

  let hasUnknownEvidence = false;
  const pending = documents.flatMap((document) => {
    const identityKnown = isLegacyBreedingIdentity(document, identity.network);
    const ownerKnown = wallets.some((wallet) =>
      isLegacyBreedingOwner(document, identity.network, wallet),
    );
    if (!identityKnown || !ownerKnown) {
      hasUnknownEvidence = true;
      return [];
    }
    return [{ document, item: normalizeCuki(document) }];
  });
  const currentOwners = await readCurrentLegacyOwners(pending.map(({ item }) => item));
  const verifiedDocuments = pending.flatMap(({ document, item }, index) => {
    const currentOwner = currentOwners[index];
    if (!currentOwner) {
      hasUnknownEvidence = true;
      return [];
    }
    const ownerMatches = wallets.some((wallet) =>
      isLegacyBreedingOwner(
        { ...item, owner: currentOwner, ownerNormalized: currentOwner },
        identity.network,
        wallet,
      ),
    );
    if (!ownerMatches) return [];
    return [{ document, item: {
      ...item,
      identityVerified: true,
      ownershipVerified: true,
      ownershipSource: 'legacy-ownerOf' as const,
      owner: currentOwner,
      ownerNormalized: currentOwner,
    } }];
  });
  const pagedDocuments = verifiedDocuments.slice(offset, offset + limit);
  const hydrated = await Promise.all(
    pagedDocuments.map(({ document }) => hydrateCukiRelations(document, collection)),
  );
  const items = hydrated.map((document, index) => {
    const verifiedItem = pagedDocuments[index].item;
    return {
      ...normalizeCuki(document),
      owner: verifiedItem.owner,
      ownerNormalized: verifiedItem.ownerNormalized,
      identityVerified: verifiedItem.identityVerified,
      ownershipVerified: verifiedItem.ownershipVerified,
      ownershipSource: verifiedItem.ownershipSource,
    };
  });
  const status: LegacyBreedingReadStatus =
    documents.length === 0 ? 'unknown' : hasUnknownEvidence ? 'partial' : 'verified';

  return {
    source: 'mongo',
    items,
    total: verifiedDocuments.length,
    offset,
    limit,
    status,
    ...(status === 'unknown'
      ? { error: 'No se pudo verificar la identidad Legacy de los resultados.' }
      : status === 'partial'
        ? { error: 'Algunos resultados no tienen una identidad Legacy verificable.' }
        : {}),
  };
}

function normalizePointTransaction(document: PointDocument): LegacyCukiePointsTransaction {
  const network = toStringOrNull(document.network) ?? toStringOrNull(document.chain);
  const chainId = toNumberOrNull(document.chainId);
  const txId = toStringOrNull(document.transactionId) ?? toStringOrNull(document.txHash);
  const id =
    toStringOrNull(document._id) ??
    (document._id !== null && document._id !== undefined ? String(document._id) : txId ?? '');

  return {
    id,
    address: toStringOrNull(document.address),
    points: toNumberOrNull(document.points),
    type: toStringOrNull(document.type) ?? 'Points',
    date: normalizeTimestampMs(document.timestampMs ?? document.date),
    txId,
    network,
    description: null,
    explorerUrl: getLegacyPointExplorerUrl(
      legacyMarketplaceRuntime,
      network,
      chainId,
      txId,
    ),
  };
}

function buildPointsFilter(params: LegacyCukiePointsParams) {
  const filter: Filter<PointDocument> = {};
  const wallets = params.wallets
    ?.map((wallet) => wallet.trim())
    .filter((wallet) => wallet.length > 0);

  if (wallets?.length) {
    filter.$or = wallets.flatMap((wallet) => [
      { addressNormalized: normalizeAddressForLookup(wallet) },
      { address: new RegExp(`^${escapeRegex(wallet)}$`, 'i') },
    ]);
  }

  if (isKnownNetwork(params.network)) filter.chain = params.network;
  if (params.type?.trim() && params.type !== 'ALL') filter.type = params.type.trim();

  return filter;
}

export async function listCukiePoints(
  params: LegacyCukiePointsParams,
): Promise<LegacyCukiePointsResponse> {
  const limit = normalizeLimit(params.limit ?? 24);
  const offset = normalizeOffset(params.offset);
  const collection = await getPointsCollection();
  const filter = buildPointsFilter(params);

  const [documents, total, summaryRows, networkFacets, typeFacets] = await Promise.all([
    collection
      .find(filter)
      .sort({ timestampMs: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
    collection
      .aggregate<{ _id: null; totalPoints: number; totalTransactions: number }>([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalPoints: { $sum: '$points' },
            totalTransactions: { $sum: 1 },
          },
        },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $match: filter },
        { $group: { _id: '$chain', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $match: filter },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
  ]);
  const [summary] = summaryRows;

  return {
    source: 'mongo',
    items: documents.map(normalizePointTransaction),
    total,
    offset,
    limit,
    summary: {
      totalPoints: summary?.totalPoints ?? 0,
      totalTransactions: summary?.totalTransactions ?? 0,
      facets: {
        networks: normalizeFacet(networkFacets),
        types: normalizeFacet(typeFacets),
      },
    },
  };
}
