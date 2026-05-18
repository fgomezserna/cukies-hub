import 'server-only';

import type { Collection, Filter, Sort } from 'mongodb';

import { getIndexerDb } from '@/lib/indexer-db/mongodb';
import {
  getLegacyMarketplaceNftImageUrl,
  normalizeLegacyMarketplaceNftImageUrl,
} from '@/lib/legacy-marketplace/config';
import {
  legacyCukiNetworks,
  legacyCukiStates,
  type LegacyBreedingCandidatesParams,
  type LegacyBreedingCandidatesResponse,
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

type CukiDocument = {
  _id: string;
  tokenId?: unknown;
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
};

const MAX_LIMIT = 60;
const DEFAULT_LIMIT = 24;

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
    cukiNumber: toNumberOrNull(document.cukiNumber),
    owner,
    network: toStringOrNull(document.network) ?? 'TRON',
    origin: toStringOrNull(document.origin),
    birthNetwork: toStringOrNull(document.birthNetwork),
    imageUrl: normalizeImageUrl(id, document.img),
    type: toNumberOrNull(document.type) ?? toStringOrNull(document.type),
    state: toStringOrNull(document.state) ?? 'available',
    price: toNumberOrNull(document.price),
    priceOriginal: toStringOrNull(document.priceOriginal) ?? toStringOrNull(document.priceRaw),
    skills,
    childrenCount:
      toNumberOrNull(document.numChildren) ??
      (children.length > 0 ? children.length : null),
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

function buildCukiFilter(params: LegacyMarketplaceListParams) {
  const filter: Filter<CukiDocument> = {};
  const search = params.search?.trim();

  if (isKnownNetwork(params.network)) filter.network = params.network;
  if (isKnownState(params.state)) filter.state = params.state;

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
  const collection = await getCukiesCollection();
  const filter: Filter<CukiDocument> = {
    state: 'available',
  };

  if (params.owner?.trim()) {
    const owner = params.owner.trim();
    filter.$or = [
      { ownerNormalized: normalizeAddressForLookup(owner) },
      { owner: new RegExp(`^${escapeRegex(owner)}$`, 'i') },
      { user: new RegExp(`^${escapeRegex(owner)}$`, 'i') },
    ];
  }

  if (isKnownNetwork(params.network)) filter.network = params.network;

  const documents = await collection
    .find(filter)
    .sort({ cukiNumber: 1, _id: 1 })
    .limit(Math.min(limit * 3, 180))
    .toArray();

  const networkBump = params.network === 'BSC' ? 1 : 0;
  const items = documents
    .map(normalizeCuki)
    .filter((item) => {
      if (maxBreeds === null) return true;
      return (item.childrenCount ?? 0) < maxBreeds + networkBump;
    })
    .slice(0, limit);

  return {
    source: 'mongo',
    items,
    total: items.length,
    maxBreeds,
  };
}

export async function listCompletedBreeds(
  params: LegacyCompletedBreedsParams,
): Promise<LegacyCompletedBreedsResponse> {
  const limit = normalizeLimit(params.limit ?? 24);
  const offset = normalizeOffset(params.offset);
  const collection = await getCukiesCollection();
  const filter: Filter<CukiDocument> = {
    origin: 'breed',
  };
  const wallets = params.wallets
    ?.map((wallet) => wallet.trim())
    .filter((wallet) => wallet.length > 0);

  if (wallets?.length) {
    filter.$or = wallets.flatMap((wallet) => [
      { ownerNormalized: normalizeAddressForLookup(wallet) },
      { owner: new RegExp(`^${escapeRegex(wallet)}$`, 'i') },
      { user: new RegExp(`^${escapeRegex(wallet)}$`, 'i') },
    ]);
  }

  if (isKnownNetwork(params.network)) filter.network = params.network;

  const [documents, total] = await Promise.all([
    collection
      .find(filter)
      .sort({ timeStamp: -1, cukiNumber: -1, _id: -1 })
      .skip(offset)
      .limit(limit)
      .toArray(),
    collection.countDocuments(filter),
  ]);
  const hydrated = await Promise.all(
    documents.map((document) => hydrateCukiRelations(document, collection)),
  );

  return {
    source: 'mongo',
    items: hydrated.map(normalizeCuki),
    total,
    offset,
    limit,
  };
}

function getPointExplorerUrl(network: string | null, txId: string | null) {
  if (!txId) return null;
  if (network === 'BSC') return `https://bscscan.com/tx/${txId}`;
  if (network === 'TRON') return `https://tronscan.org/#/transaction/${txId}`;
  return null;
}

function normalizePointTransaction(document: PointDocument): LegacyCukiePointsTransaction {
  const network = toStringOrNull(document.network) ?? toStringOrNull(document.chain);
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
    explorerUrl: getPointExplorerUrl(network, txId),
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
