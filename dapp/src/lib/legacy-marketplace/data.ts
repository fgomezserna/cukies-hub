import 'server-only';

import { Collection, Filter, Sort } from 'mongodb';

import { cukiesDb } from '@/lib/mongodb-cukies';

import {
  fetchLegacyMarketplaceGraphQL,
  legacyMarketplaceCukiSelection,
} from './graphql';
import { getLegacyMarketplaceNftImageUrl } from './config';
import {
  legacyCukiNetworks,
  legacyCukiStates,
  type LegacyCukiePointsParams,
  type LegacyCukiePointsResponse,
  type LegacyCukiePointsTransaction,
  type LegacyCukiNetwork,
  type LegacyCukiState,
  type LegacyBreedingCandidatesParams,
  type LegacyBreedingCandidatesResponse,
  type LegacyCompletedBreedsParams,
  type LegacyCompletedBreedsResponse,
  type LegacyMarketplaceCukiHistoryEntry,
  type LegacyMarketplaceCukiItem,
  type LegacyMarketplaceCukiReference,
  type LegacyMarketplaceFacet,
  type LegacyMarketplaceListParams,
  type LegacyMarketplaceListResponse,
} from './types';

type LegacyCukiDocument = {
  _id: string;
  user?: unknown;
  network?: unknown;
  origin?: unknown;
  birthNetwork?: unknown;
  img?: unknown;
  type?: unknown;
  cukiNumber?: unknown;
  skills?: unknown;
  children?: unknown;
  parents?: unknown;
  history?: unknown;
  numChildren?: unknown;
  numChildrenTron?: unknown;
  numChildrenBsc?: unknown;
  price?: unknown;
  state?: unknown;
  timeStamp?: unknown;
  priceOriginal?: unknown;
};

type LegacyHistoryDocument = {
  _id: string;
  txid?: unknown;
  transactionId?: unknown;
  network?: unknown;
  from?: unknown;
  to?: unknown;
  date?: unknown;
  type?: unknown;
  price?: unknown;
  eventName?: unknown;
  timeStamp?: unknown;
  data?: {
    from?: unknown;
    to?: unknown;
    tokenId?: unknown;
  };
};

type LegacyPointDocument = {
  _id: unknown;
  address?: unknown;
  points?: unknown;
  type?: unknown;
  date?: unknown;
  description?: unknown;
  txID?: unknown;
  txId?: unknown;
  network?: unknown;
};

const MAX_LIMIT = 60;
const DEFAULT_LIMIT = 24;

const cukiProjection = {
  _id: 1,
  user: 1,
  network: 1,
  origin: 1,
  birthNetwork: 1,
  img: 1,
  type: 1,
  cukiNumber: 1,
  skills: 1,
  children: 1,
  parents: 1,
  history: 1,
  numChildren: 1,
  numChildrenTron: 1,
  numChildrenBsc: 1,
  price: 1,
  state: 1,
  timeStamp: 1,
  priceOriginal: 1,
};

async function getCukiesCollection() {
  return (await cukiesDb.cukies()) as unknown as Collection<LegacyCukiDocument>;
}

async function getPointsCollection() {
  return (await cukiesDb.points()) as unknown as Collection<LegacyPointDocument>;
}

function toStringOrNull(value: unknown) {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);
  return null;
}

function toNumberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeImageUrl(tokenId: string, imageUrl: unknown) {
  const value = toStringOrNull(imageUrl);

  if (!value) {
    return tokenId ? getLegacyMarketplaceNftImageUrl(tokenId) : null;
  }

  if (value.includes('/png/tokens/v2/')) {
    return value;
  }

  if (value.includes('/png/tokens/')) {
    return value.replace('/png/tokens/', '/png/tokens/v2/');
  }

  return tokenId ? getLegacyMarketplaceNftImageUrl(tokenId) : value;
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

  const document = value as LegacyCukiDocument;
  const id = toStringOrNull(document._id);
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

function normalizeHistoryType(document: LegacyHistoryDocument) {
  const eventName = toStringOrNull(document.eventName);
  const type = toStringOrNull(document.type);
  const from = toStringOrNull(document.data?.from ?? document.from);

  if (type) return type;
  if (
    eventName === 'Transfer' &&
    from?.toLowerCase() === '0x0000000000000000000000000000000000000000'
  ) {
    return 'Mint';
  }

  return eventName ?? 'Transaction';
}

function normalizeHistoryDate(value: unknown) {
  const parsed = toNumberOrNull(value);
  if (parsed === null) return null;

  return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
}

function normalizePointDate(value: unknown) {
  if (value instanceof Date) return value.getTime();

  const parsed = toNumberOrNull(value);
  if (parsed !== null) {
    return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
  }

  const stringValue = toStringOrNull(value);
  if (!stringValue) return null;

  const date = new Date(stringValue);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function normalizePointDescription(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return String(value);

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const cuki = toStringOrNull(record.cuki);
    if (cuki) return `Cukie ${cuki}`;

    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  return null;
}

function getPointExplorerUrl(network: string | null, txId: string | null) {
  if (!txId) return null;

  if (network === 'BSC') return `https://bscscan.com/tx/${txId}`;
  if (network === 'TRON') return `https://tronscan.org/#/transaction/${txId}`;

  return null;
}

function normalizePointTransaction(
  document: LegacyPointDocument,
): LegacyCukiePointsTransaction {
  const network = toStringOrNull(document.network);
  const txId = toStringOrNull(document.txID) ?? toStringOrNull(document.txId);
  const id =
    toStringOrNull(document._id) ??
    (document._id !== null && document._id !== undefined
      ? String(document._id)
      : txId ?? '');

  return {
    id,
    address: toStringOrNull(document.address),
    points: toNumberOrNull(document.points),
    type: toStringOrNull(document.type) ?? 'Points',
    date: normalizePointDate(document.date),
    txId,
    network,
    description: normalizePointDescription(document.description),
    explorerUrl: getPointExplorerUrl(network, txId),
  };
}

function normalizeHistoryEntry(
  value: unknown,
): LegacyMarketplaceCukiHistoryEntry | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const id = String(value);

    return {
      id,
      transactionId: id,
      type: 'Transaction',
      from: null,
      to: null,
      date: null,
      price: null,
      network: null,
    };
  }

  if (typeof value !== 'object') return null;

  const document = value as LegacyHistoryDocument;
  const id =
    toStringOrNull(document._id) ??
    toStringOrNull(document.transactionId) ??
    toStringOrNull(document.txid);

  if (!id) return null;

  return {
    id,
    transactionId:
      toStringOrNull(document.transactionId) ?? toStringOrNull(document.txid),
    type: normalizeHistoryType(document),
    from: toStringOrNull(document.data?.from ?? document.from),
    to: toStringOrNull(document.data?.to ?? document.to),
    date: normalizeHistoryDate(document.timeStamp ?? document.date),
    price: toNumberOrNull(document.price),
    network: toStringOrNull(document.network),
  };
}

function normalizeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeHistoryEntry(item))
    .filter((item): item is LegacyMarketplaceCukiHistoryEntry => item !== null);
}

function normalizeLimit(value?: number) {
  if (!value || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_LIMIT);
}

function normalizeOffset(value?: number) {
  if (!value || !Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function isLegacyNetwork(value?: string): value is LegacyCukiNetwork {
  return legacyCukiNetworks.includes(value as LegacyCukiNetwork);
}

function isLegacyState(value?: string): value is LegacyCukiState {
  return legacyCukiStates.includes(value as LegacyCukiState);
}

function buildOwnerRegex(owner: string) {
  return new RegExp(`^${owner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
}

function normalizeFacet(rows: Array<{ _id: unknown; count: number }>) {
  return rows
    .filter((row) => row._id !== null && row._id !== undefined)
    .map((row) => ({
      value: String(row._id),
      count: row.count,
    })) satisfies LegacyMarketplaceFacet[];
}

function normalizeCuki(document: LegacyCukiDocument): LegacyMarketplaceCukiItem {
  const id = toStringOrNull(document._id) ?? '';
  const skills =
    document.skills && typeof document.skills === 'object'
      ? (document.skills as LegacyMarketplaceCukiItem['skills'])
      : {};
  const children = normalizeRelations(document.children);

  return {
    id,
    tokenId: id,
    cukiNumber: toNumberOrNull(document.cukiNumber),
    owner: toStringOrNull(document.user),
    network: toStringOrNull(document.network) ?? 'TRON',
    origin: toStringOrNull(document.origin),
    birthNetwork: toStringOrNull(document.birthNetwork),
    imageUrl: normalizeImageUrl(id, document.img),
    type: toNumberOrNull(document.type) ?? toStringOrNull(document.type),
    state: toStringOrNull(document.state) ?? 'available',
    price: toNumberOrNull(document.price),
    priceOriginal: toStringOrNull(document.priceOriginal),
    skills,
    childrenCount:
      toNumberOrNull(document.numChildren) ??
      (children.length > 0 ? children.length : null),
    childrenCountTron: toNumberOrNull(document.numChildrenTron),
    childrenCountBsc: toNumberOrNull(document.numChildrenBsc),
    parents: normalizeRelations(document.parents),
    children,
    history: normalizeHistory(document.history),
    timestamp: toNumberOrNull(document.timeStamp),
  };
}

async function hydrateCukiRelations(
  document: LegacyCukiDocument,
  collection: Collection<LegacyCukiDocument>,
) {
  const relationIds = [
    ...(Array.isArray(document.parents) ? document.parents : []),
    ...(Array.isArray(document.children) ? document.children : []),
  ]
    .map((value) => toStringOrNull(value))
    .filter((value): value is string => value !== null);

  if (relationIds.length === 0) return document;

  const relationDocuments = await collection
    .find({ _id: { $in: [...new Set(relationIds)] } }, { projection: cukiProjection })
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

async function hydrateCukiHistory(document: LegacyCukiDocument) {
  if (!Array.isArray(document.history)) return document;

  const historyIds = document.history
    .map((value) => toStringOrNull(value))
    .filter((value): value is string => value !== null);

  if (historyIds.length === 0) return document;

  const [txNftsCollection, processedEventsCollection] = await Promise.all([
    cukiesDb.txNfts() as unknown as Promise<Collection<LegacyHistoryDocument>>,
    cukiesDb.processedEvents() as unknown as Promise<
      Collection<LegacyHistoryDocument>
    >,
  ]);
  const [txNfts, processedEvents] = await Promise.all([
    txNftsCollection
      .find(
        {
          $or: [
            { _id: { $in: historyIds } },
            { txid: { $in: historyIds } },
            { transactionId: { $in: historyIds } },
          ],
        },
        {
          projection: {
            _id: 1,
            txid: 1,
            transactionId: 1,
            network: 1,
            from: 1,
            to: 1,
            date: 1,
            type: 1,
            price: 1,
          },
        },
      )
      .toArray(),
    processedEventsCollection
      .find(
        {
          $or: [
            { _id: { $in: historyIds } },
            { transactionId: { $in: historyIds } },
          ],
        },
        {
          projection: {
            _id: 1,
            transactionId: 1,
            network: 1,
            eventName: 1,
            timeStamp: 1,
            data: 1,
          },
        },
      )
      .toArray(),
  ]);
  const historyById = new Map<string, LegacyHistoryDocument>();

  for (const item of processedEvents) {
    const id = toStringOrNull(item.transactionId) ?? toStringOrNull(item._id);
    if (id) historyById.set(id, item);
  }

  for (const item of txNfts) {
    const ids = [item._id, item.txid, item.transactionId]
      .map((value) => toStringOrNull(value))
      .filter((value): value is string => value !== null);

    for (const id of ids) {
      historyById.set(id, item);
    }
  }

  return {
    ...document,
    history: document.history.map((value) => {
      const id = toStringOrNull(value);
      return id ? historyById.get(id) ?? value : value;
    }),
  };
}

async function hydrateCukiDocument(
  document: LegacyCukiDocument,
  collection: Collection<LegacyCukiDocument>,
) {
  const withRelations = await hydrateCukiRelations(document, collection);
  return hydrateCukiHistory(withRelations);
}

function buildMongoFilter(params: LegacyMarketplaceListParams) {
  const filter: Filter<LegacyCukiDocument> = {};
  const search = params.search?.trim();

  if (isLegacyNetwork(params.network)) {
    filter.network = params.network;
  }

  if (isLegacyState(params.state)) {
    filter.state = params.state;
  }

  if (params.type && params.type !== 'all') {
    const parsedType = Number(params.type);
    filter.type = Number.isFinite(parsedType) ? parsedType : params.type;
  }

  if (params.owner?.trim()) {
    filter.user = buildOwnerRegex(params.owner.trim());
  }

  if (search) {
    const numericSearch = Number(search);
    filter.$or = [
      { _id: search },
      ...(Number.isFinite(numericSearch)
        ? [{ cukiNumber: numericSearch }, { type: numericSearch }]
        : []),
      { user: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
    ];
  }

  return filter;
}

function buildMongoSort(sort?: string): Sort {
  switch (sort) {
    case 'price-asc':
      return { price: 1, cukiNumber: 1 } as const;
    case 'price-desc':
      return { price: -1, cukiNumber: 1 } as const;
    case 'number-asc':
      return { cukiNumber: 1 } as const;
    case 'number-desc':
      return { cukiNumber: -1 } as const;
    case 'newest':
    default:
      return { timeStamp: -1, cukiNumber: -1 } as const;
  }
}

async function getFacets() {
  const collection = await getCukiesCollection();
  const [states, networks, types] = await Promise.all([
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
  ]);

  return {
    states: normalizeFacet(states),
    networks: normalizeFacet(networks),
    types: normalizeFacet(types),
  };
}

async function listFromGraphQL(
  params: Required<Pick<LegacyMarketplaceListParams, 'limit' | 'offset'>>,
) {
  const query = `
    query LegacyMarketplaceCukies($limit: Int!, $offset: Int!) {
      cukies(limit: $limit, offset: $offset) {
        ${legacyMarketplaceCukiSelection}
      }
      countCukies
    }
  `;
  const data = await fetchLegacyMarketplaceGraphQL<
    {
      cukies: LegacyCukiDocument[];
      countCukies: number;
    },
    {
      limit: number;
      offset: number;
    }
  >({
    query,
    variables: params,
    timeoutMs: 8_000,
  });

  return {
    source: 'graphql' as const,
    items: data.cukies.map(normalizeCuki),
    total: data.countCukies,
    facets: {
      states: [],
      networks: [],
      types: [],
    },
  };
}

export async function listLegacyMarketplaceCukies(
  params: LegacyMarketplaceListParams,
): Promise<LegacyMarketplaceListResponse> {
  const limit = normalizeLimit(params.limit);
  const offset = normalizeOffset(params.offset);

  try {
    const collection = await getCukiesCollection();
    const filter = buildMongoFilter(params);
    const [items, total, facets] = await Promise.all([
      collection
        .find(filter, { projection: cukiProjection })
        .sort(buildMongoSort(params.sort))
        .skip(offset)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
      getFacets(),
    ]);

    return {
      source: 'mongo',
      items: items.map(normalizeCuki),
      total,
      offset,
      limit,
      facets,
    };
  } catch (mongoError) {
    try {
      const graphqlResult = await listFromGraphQL({ limit, offset });

      return {
        ...graphqlResult,
        offset,
        limit,
        error:
          mongoError instanceof Error
            ? `Mongo fallback: ${mongoError.message}`
            : 'Mongo fallback failed',
      };
    } catch (graphqlError) {
      return {
        source: 'empty',
        items: [],
        total: 0,
        offset,
        limit,
        facets: {
          states: [],
          networks: [],
          types: [],
        },
        error:
          graphqlError instanceof Error
            ? graphqlError.message
            : 'Legacy marketplace data unavailable',
      };
    }
  }
}

export async function getLegacyMarketplaceCuki(tokenId: string) {
  try {
    const collection = await getCukiesCollection();
    const document = await collection.findOne(
      { _id: tokenId },
      { projection: cukiProjection },
    );

    if (!document) return null;

    return normalizeCuki(await hydrateCukiDocument(document, collection));
  } catch {
    const query = `
      query LegacyMarketplaceSpecificCuki($idArray: [String!]!) {
        specificCukies(idArray: $idArray) {
          ${legacyMarketplaceCukiSelection}
        }
      }
    `;
    const data = await fetchLegacyMarketplaceGraphQL<
      {
        specificCukies: LegacyCukiDocument[];
      },
      {
        idArray: string[];
      }
    >({
      query,
      variables: { idArray: [tokenId] },
      timeoutMs: 8_000,
    });

    const [first] = data.specificCukies;
    return first ? normalizeCuki(first) : null;
  }
}

export async function listLegacyBreedingCandidates(
  params: LegacyBreedingCandidatesParams,
): Promise<LegacyBreedingCandidatesResponse> {
  const limit = normalizeLimit(params.limit ?? 60);
  const maxBreeds =
    params.maxBreeds !== undefined && Number.isFinite(params.maxBreeds)
      ? Math.max(Math.trunc(params.maxBreeds), 0)
      : null;

  try {
    const collection = await getCukiesCollection();
    const filter: Filter<LegacyCukiDocument> = {
      state: 'available',
      'skills.generation': 1,
    };

    if (params.owner?.trim()) {
      filter.user = buildOwnerRegex(params.owner.trim());
    }

    if (isLegacyNetwork(params.network)) {
      filter.network = params.network;
    }

    const documents = await collection
      .find(filter, { projection: cukiProjection })
      .sort({ cukiNumber: 1, _id: 1 })
      .limit(Math.min(limit * 3, 180))
      .toArray();

    const networkBump = params.network === 'BSC' ? 1 : 0;
    const items = documents
      .filter((document) => {
        if (maxBreeds === null) return true;

        return (toNumberOrNull(document.numChildren) ?? 0) < maxBreeds + networkBump;
      })
      .slice(0, limit)
      .map(normalizeCuki);

    return {
      source: 'mongo',
      items,
      total: items.length,
      maxBreeds,
    };
  } catch (error) {
    return {
      source: 'empty',
      items: [],
      total: 0,
      maxBreeds,
      error:
        error instanceof Error
          ? error.message
          : 'Legacy breeding candidates unavailable',
    };
  }
}

export async function listLegacyCompletedBreeds(
  params: LegacyCompletedBreedsParams,
): Promise<LegacyCompletedBreedsResponse> {
  const limit = normalizeLimit(params.limit ?? 24);
  const offset = normalizeOffset(params.offset);

  try {
    const collection = await getCukiesCollection();
    const filter: Filter<LegacyCukiDocument> = {
      origin: 'breed',
    };

    const wallets = params.wallets
      ?.map((wallet) => wallet.trim())
      .filter((wallet) => wallet.length > 0);

    if (wallets?.length) {
      filter.$or = wallets.map((wallet) => ({
        user: buildOwnerRegex(wallet),
      }));
    }

    if (isLegacyNetwork(params.network)) {
      filter.network = params.network;
    }

    const [documents, total] = await Promise.all([
      collection
        .find(filter, { projection: cukiProjection })
        .sort({ timeStamp: -1, cukiNumber: -1 })
        .skip(offset)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
    ]);
    const hydrated = await Promise.all(
      documents.map((document) => hydrateCukiDocument(document, collection)),
    );

    return {
      source: 'mongo',
      items: hydrated.map(normalizeCuki),
      total,
      offset,
      limit,
    };
  } catch (error) {
    return {
      source: 'empty',
      items: [],
      total: 0,
      offset,
      limit,
      error:
        error instanceof Error
          ? error.message
          : 'Legacy completed breeds unavailable',
    };
  }
}

export async function listLegacyCukiePoints(
  params: LegacyCukiePointsParams,
): Promise<LegacyCukiePointsResponse> {
  const limit = normalizeLimit(params.limit ?? 24);
  const offset = normalizeOffset(params.offset);
  const emptySummary = {
    totalPoints: 0,
    totalTransactions: 0,
    facets: {
      networks: [],
      types: [],
    },
  };

  try {
    const collection = await getPointsCollection();
    const filter: Filter<LegacyPointDocument> = {};
    const wallets = params.wallets
      ?.map((wallet) => wallet.trim())
      .filter((wallet) => wallet.length > 0);

    if (wallets?.length) {
      filter.$or = wallets.map((wallet) => ({
        address: buildOwnerRegex(wallet),
      }));
    }

    if (isLegacyNetwork(params.network)) {
      filter.network = params.network;
    }

    if (params.type?.trim()) {
      filter.type = params.type.trim();
    }

    const [
      documents,
      total,
      summaryRows,
      networkFacets,
      typeFacets,
    ] = await Promise.all([
      collection
        .find(filter)
        .sort({ date: -1, _id: -1 })
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
        .aggregate<Array<{ _id: unknown; count: number }>[number]>([
          { $match: filter },
          { $group: { _id: '$network', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ])
        .toArray(),
      collection
        .aggregate<Array<{ _id: unknown; count: number }>[number]>([
          { $match: filter },
          { $group: { _id: '$type', count: { $sum: 1 } } },
          { $sort: { count: -1 } },
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
  } catch (error) {
    return {
      source: 'empty',
      items: [],
      total: 0,
      offset,
      limit,
      summary: emptySummary,
      error:
        error instanceof Error
          ? error.message
          : 'Legacy CukiePoints unavailable',
    };
  }
}
