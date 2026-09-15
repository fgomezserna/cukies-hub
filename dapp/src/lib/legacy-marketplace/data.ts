import 'server-only';

import { Collection, Filter, Sort } from 'mongodb';

import { cukiesDb } from '@/lib/mongodb-cukies';
import { buildCanonicalCukieReadFilter } from '@/lib/cukies-data/canonical-projection';

import {
  fetchLegacyMarketplaceGraphQL,
  legacyMarketplaceCukiSelection,
} from './graphql';
import {
  getLegacyMarketplaceNftImageUrl,
  normalizeLegacyMarketplaceNftImageUrl,
} from './config';
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
import {
  buildLegacyMarketplaceIdentityFilter,
  getLegacyMarketplaceDocumentIdentity,
  isLegacyMarketplaceDocument,
  normalizeLegacyMarketplaceIdentityInput,
  normalizeLegacyMarketplaceNetwork,
  type LegacyMarketplaceIdentityInput,
} from './identity';
import {
  readLegacyMarketplaceLiveState,
} from './live-marketplace';
import {
  buildLegacyMarketplaceReconciliationCasFilter,
  buildLegacyMarketplaceReconciliation,
  type LegacyMarketplaceReconciliation,
  type LegacyMarketplaceReconciliationSnapshot,
} from './reconciliation';

type LegacyCukiDocument = {
  _id: string;
  tokenId?: unknown;
  metadataSource?: unknown;
  legacyProjectionKind?: unknown;
  user?: unknown;
  network?: unknown;
  chain?: unknown;
  chainId?: unknown;
  collection?: unknown;
  collectionAddress?: unknown;
  collectionAddressNormalized?: unknown;
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
  marketplaceListingStatus?: unknown;
  marketplaceReconciliationFingerprint?: unknown;
  marketplaceReconciledAt?: unknown;
  updatedAt?: unknown;
};

type LegacyHistoryDocument = {
  _id: string;
  txid?: unknown;
  transactionId?: unknown;
  network?: unknown;
  chain?: unknown;
  chainId?: unknown;
  collection?: unknown;
  collectionAddress?: unknown;
  collectionAddressNormalized?: unknown;
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
  addressNormalized?: unknown;
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
  tokenId: 1,
  metadataSource: 1,
  legacyProjectionKind: 1,
  user: 1,
  network: 1,
  chain: 1,
  chainId: 1,
  collection: 1,
  collectionAddress: 1,
  collectionAddressNormalized: 1,
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
  marketplaceListingStatus: 1,
  marketplaceReconciliationFingerprint: 1,
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
  return normalizeLegacyMarketplaceNftImageUrl(tokenId, toStringOrNull(imageUrl));
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
  if (!isLegacyMarketplaceDocument(document)) return null;
  const id = toStringOrNull(document.tokenId) ?? toStringOrNull(document._id);
  if (!id) return null;

  const identity = getLegacyMarketplaceDocumentIdentity(document);

  const skills =
    document.skills && typeof document.skills === 'object'
      ? (document.skills as LegacyMarketplaceCukiItem['skills'])
      : {};

  return {
    id,
    tokenId: id,
    chainId: identity?.chainId ?? null,
    collectionAddress: identity?.collectionAddress ?? null,
    cukiNumber: toNumberOrNull(document.cukiNumber),
    network: identity?.network ?? null,
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
  expectedNetwork?: LegacyCukiNetwork,
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
      network: expectedNetwork ?? null,
    };
  }

  if (typeof value !== 'object') return null;

  const document = value as LegacyHistoryDocument;
  if (!isLegacyMarketplaceDocument(document, expectedNetwork)) return null;
  const identity = getLegacyMarketplaceDocumentIdentity(document);
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
    network: identity?.network
      ?? expectedNetwork
      ?? normalizeLegacyMarketplaceNetwork(document.network),
  };
}

function normalizeHistory(value: unknown, expectedNetwork?: LegacyCukiNetwork) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeHistoryEntry(item, expectedNetwork))
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

function buildPointWalletClauses(wallets: string[], network?: string) {
  return wallets.flatMap<Filter<LegacyPointDocument>>((wallet) => {
    const isBscWallet = /^0x/i.test(wallet);
    const walletNetwork = isBscWallet ? 'BSC' : 'TRON';
    if (isLegacyNetwork(network) && network !== walletNetwork) return [];

    if (walletNetwork === 'TRON') {
      // TRON Base58 addresses are case-sensitive. Do not apply EVM-style
      // case folding to a wallet filter on the historical source.
      return [{ network: 'TRON', address: wallet }];
    }

    return [{
      network: 'BSC',
      $or: [
        { address: buildOwnerRegex(wallet) },
        { addressNormalized: wallet.toLowerCase() },
      ],
    }];
  });
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
  const id = toStringOrNull(document.tokenId) ?? toStringOrNull(document._id) ?? '';
  const identity = getLegacyMarketplaceDocumentIdentity(document);
  if (!identity) {
    throw new Error(`Legacy Cukie ${id || '(sin id)'} tiene una identidad de red/colección incompatible.`);
  }
  const skills =
    document.skills && typeof document.skills === 'object'
      ? (document.skills as LegacyMarketplaceCukiItem['skills'])
      : {};
  const children = normalizeRelations(document.children);

  return {
    id,
    tokenId: id,
    chainId: identity.chainId,
    collectionAddress: identity.collectionAddress,
    cukiNumber: toNumberOrNull(document.cukiNumber),
    owner: toStringOrNull(document.user),
    network: identity.network,
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
    history: normalizeHistory(document.history, identity.network),
    timestamp: toNumberOrNull(document.timeStamp),
  };
}

async function persistLegacyMarketplaceReconciliation(
  collection: Collection<LegacyCukiDocument>,
  reconciliation: LegacyMarketplaceReconciliation,
  snapshot: LegacyMarketplaceReconciliationSnapshot,
) {
  const result = await collection.updateOne(
    {
      $and: [
        buildLegacyMarketplaceReconciliationCasFilter(snapshot),
        {
          marketplaceReconciliationFingerprint: {
            $ne: reconciliation.fingerprint,
          },
        },
      ],
    } as Filter<LegacyCukiDocument>,
    {
      $set: {
        user: reconciliation.item.owner,
        state: reconciliation.item.state,
        price: reconciliation.item.price,
        priceOriginal: reconciliation.item.priceOriginal,
        marketplaceListingStatus: reconciliation.marketplaceListingStatus,
        marketplaceReconciliationFingerprint: reconciliation.fingerprint,
        marketplaceReconciledAt: new Date(),
        updatedAt: new Date(),
      },
    },
  );
  return result.modifiedCount === 1;
}

export async function reconcileLegacyMarketplaceCuki(
  tokenId: string,
  expectedNetwork: LegacyCukiNetwork,
) {
  const collection = await getCukiesCollection();
  const document = await collection.findOne(
    {
      $and: [
        buildCanonicalCukieReadFilter<LegacyCukiDocument>(),
        { tokenId },
        buildLegacyMarketplaceIdentityFilter(expectedNetwork) as unknown as Filter<LegacyCukiDocument>,
      ],
    },
    { projection: cukiProjection },
  );
  if (!document) return null;
  const indexed = normalizeCuki(document);
  if (indexed.network !== expectedNetwork) return null;
  const live = await readLegacyMarketplaceLiveState(indexed);
  const reconciliation = buildLegacyMarketplaceReconciliation(indexed, live);
  const changed = await persistLegacyMarketplaceReconciliation(
    collection,
    reconciliation,
    {
      documentId: document._id,
      tokenId,
      network: document.network,
      owner: document.user,
      state: document.state,
      priceOriginal: document.priceOriginal,
      fingerprint: document.marketplaceReconciliationFingerprint,
    },
  );
  return { ...reconciliation, changed, paused: live.paused };
}

async function hydrateCukiRelations(
  documents: LegacyCukiDocument[],
  collection: Collection<LegacyCukiDocument>,
) {
  const relationId = (value: unknown) => toStringOrNull(
    value && typeof value === 'object'
      ? (value as LegacyCukiDocument).tokenId ?? (value as LegacyCukiDocument)._id
      : value,
  );
  const relationIds = documents.flatMap((document) => [
    ...(Array.isArray(document.parents) ? document.parents : []),
    ...(Array.isArray(document.children) ? document.children : []),
  ])
    .map(relationId)
    .filter((value): value is string => value !== null);

  if (relationIds.length === 0) return documents;

  const relationDocuments = await collection
    .find({
      $and: [
        buildCanonicalCukieReadFilter<LegacyCukiDocument>(),
        {
          $or: [
            { tokenId: { $in: [...new Set(relationIds)] } },
            { _id: { $in: [...new Set(relationIds)] } },
          ],
        },
        buildLegacyMarketplaceIdentityFilter() as unknown as Filter<LegacyCukiDocument>,
      ],
    }, { projection: cukiProjection })
    .toArray();
  const relationById = new Map<string, LegacyCukiDocument[]>();
  for (const item of relationDocuments) {
    const id = toStringOrNull(item.tokenId) ?? toStringOrNull(item._id);
    if (!id) continue;
    relationById.set(id, [...(relationById.get(id) ?? []), item]);
  }
  const resolveRelation = (parent: LegacyCukiDocument, value: unknown) => {
    const id = relationId(value);
    if (!id) return value;
    const candidates = relationById.get(id) ?? [];
    const parentNetwork = normalizeLegacyMarketplaceNetwork(parent.network);
    const sameNetwork = parentNetwork
      ? candidates.filter((candidate) => (
          normalizeLegacyMarketplaceNetwork(candidate.network) === parentNetwork
        ))
      : [];
    if (sameNetwork.length === 1) return sameNetwork[0];
    return candidates.length === 1 ? candidates[0] : value;
  };

  return documents.map((document) => ({
    ...document,
    parents: Array.isArray(document.parents)
      ? document.parents.map((value) => resolveRelation(document, value))
      : document.parents,
    children: Array.isArray(document.children)
      ? document.children.map((value) => resolveRelation(document, value))
      : document.children,
  }));
}

async function hydrateCukiHistory(document: LegacyCukiDocument) {
  if (!Array.isArray(document.history)) return document;

  const identity = getLegacyMarketplaceDocumentIdentity(document);
  if (!identity) return document;

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
          $and: [
            {
              $or: [
                { _id: { $in: historyIds } },
                { txid: { $in: historyIds } },
                { transactionId: { $in: historyIds } },
              ],
            },
            buildLegacyMarketplaceIdentityFilter(identity.network, { allowMissingNetwork: true }) as unknown as Filter<LegacyHistoryDocument>,
          ],
        },
        {
          projection: {
            _id: 1,
            txid: 1,
            transactionId: 1,
            network: 1,
            chain: 1,
            chainId: 1,
            collection: 1,
            collectionAddress: 1,
            collectionAddressNormalized: 1,
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
          $and: [
            {
              $or: [
                { _id: { $in: historyIds } },
                { transactionId: { $in: historyIds } },
              ],
            },
            buildLegacyMarketplaceIdentityFilter(identity.network, { allowMissingNetwork: true }) as unknown as Filter<LegacyHistoryDocument>,
          ],
        },
        {
          projection: {
            _id: 1,
            transactionId: 1,
            network: 1,
            chain: 1,
            chainId: 1,
            collection: 1,
            collectionAddress: 1,
            collectionAddressNormalized: 1,
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
    history: document.history
      .map((value) => {
        const id = toStringOrNull(value);
        return id ? historyById.get(id) ?? value : value;
      }),
  };
}

async function hydrateCukiDocument(
  document: LegacyCukiDocument,
  collection: Collection<LegacyCukiDocument>,
) {
  const [withRelations] = await hydrateCukiRelations([document], collection);
  return hydrateCukiHistory(withRelations);
}

export function buildLegacyMarketplaceMongoFilter(
  params: LegacyMarketplaceListParams,
) {
  const identityFilter = buildLegacyMarketplaceIdentityFilter({
    network: params.network,
    chainId: params.chainId,
    collection: params.collection,
  });
  const filter: Filter<LegacyCukiDocument> = {
    $and: [
      buildCanonicalCukieReadFilter<LegacyCukiDocument>(),
      identityFilter as Filter<LegacyCukiDocument>,
    ],
  };
  const addClause = (clause: Filter<LegacyCukiDocument>) => {
    filter.$and?.push(clause);
  };
  const search = params.search?.trim();

  if (params.marketplaceOnly) {
    addClause({
      state: 'onSale',
      priceOriginal: { $type: 'string', $regex: /^[1-9]\d*$/ },
    });
  } else if (isLegacyState(params.state)) {
    addClause({ state: params.state });
  }

  if (params.type && params.type !== 'all') {
    const normalizedType = params.type.trim().toLowerCase();
    const canonicalTypeValues: Record<string, Array<number | string>> = {
      common: [1, '1', 'common'],
      uncommon: [2, '2', 'uncommon', 'no común'],
      rare: [3, '3', 'rare', 'raro'],
      epic: [4, '4', 'epic', 'épico'],
      legendary: [5, '5', 'legendary', 'legendario'],
      goat: [6, '6', 'goat'],
    };
    const values = canonicalTypeValues[normalizedType];
    if (values) {
      addClause({ type: { $in: values } });
    } else {
      const parsedType = Number(params.type);
      addClause({ type: Number.isFinite(parsedType) ? parsedType : params.type });
    }
  }

  if (params.generation && params.generation !== 'all') {
    const normalizedGeneration = params.generation.trim().toLowerCase();
    const canonicalGenerationValues: Record<string, Array<number | string>> = {
      original: [1, '1', 'original', 'first_generation'],
      second_generation: [2, '2', 'second_generation', 'second'],
    };
    const values = canonicalGenerationValues[normalizedGeneration];
    if (values) {
      addClause({ 'skills.generation': { $in: values } });
    } else {
      const parsedGeneration = Number(params.generation);
      if (Number.isFinite(parsedGeneration)) {
        addClause({ 'skills.generation': parsedGeneration });
      }
    }
  }

  if (params.owner?.trim()) {
    addClause({ user: buildOwnerRegex(params.owner.trim()) });
  }

  if (search) {
    const numericSearch = Number(search);
    addClause({
      $or: [
        { _id: search },
        { tokenId: search },
        ...(Number.isFinite(numericSearch)
          ? [{ cukiNumber: numericSearch }, { type: numericSearch }]
          : []),
        { user: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      ],
    });
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
  const identityFilter = {
    $and: [
      buildCanonicalCukieReadFilter<LegacyCukiDocument>(),
      buildLegacyMarketplaceIdentityFilter(),
    ],
  } as Filter<LegacyCukiDocument>;
  const [states, networks, types, generations] = await Promise.all([
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $match: identityFilter },
        { $group: { _id: '$state', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $match: identityFilter },
        { $group: { _id: '$network', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $match: identityFilter },
        { $group: { _id: '$type', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ])
      .toArray(),
    collection
      .aggregate<{ _id: unknown; count: number }>([
        { $match: identityFilter },
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

  const items = data.cukies.flatMap((document) => {
    try {
      return [normalizeCuki(document)];
    } catch {
      return [];
    }
  });

  return {
    source: 'graphql' as const,
    items,
    // Preserve the GraphQL server's global count for pagination. If a mixed
    // page contained foreign documents, subtract only those rows while
    // retaining a lower bound for the valid items returned here.
    total: Math.max(
      items.length,
      data.countCukies - (data.cukies.length - items.length),
    ),
    facets: {
      states: [],
      networks: [],
      types: [],
      generations: [],
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
    const filter = buildLegacyMarketplaceMongoFilter(params);
    const [items, total, facets] = await Promise.all([
      collection
        .find(filter, { projection: cukiProjection })
        .sort(buildMongoSort(params.sort))
        .skip(offset)
        .limit(limit)
        .toArray(),
      collection.countDocuments(filter),
      params.includeFacets === false
        ? Promise.resolve({ states: [], networks: [], types: [], generations: [] })
        : getFacets(),
    ]);

    return {
      source: 'mongo',
      items: (params.hydrateRelations === false
        ? items
        : await hydrateCukiRelations(items, collection)).flatMap((document) => {
          try {
            return [normalizeCuki(document)];
          } catch {
            return [];
          }
        }),
      total,
      offset,
      limit,
      facets,
    };
  } catch (mongoError) {
    const requiresExactMongoQuery = Boolean(
      params.marketplaceOnly
      || params.owner?.trim()
      || params.search?.trim()
      || params.network
      || params.chainId !== undefined
      || params.collection?.trim()
      || params.state
      || params.type
      || params.generation,
    );
    if (requiresExactMongoQuery) {
      return {
        source: 'empty',
        items: [],
        total: 0,
        offset,
        limit,
        facets: { states: [], networks: [], types: [], generations: [] },
        error: 'Legacy Mongo query unavailable',
      };
    }
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
          generations: [],
        },
        error:
          graphqlError instanceof Error
            ? graphqlError.message
            : 'Legacy marketplace data unavailable',
      };
    }
  }
}

export async function getLegacyMarketplaceCuki(
  tokenId: string,
  identityInput?: LegacyMarketplaceIdentityInput,
) {
  const normalizedIdentity = normalizeLegacyMarketplaceIdentityInput(identityInput);
  if (normalizedIdentity === null) return null;

  try {
    const collection = await getCukiesCollection();
    const cursor = collection.find({
      $and: [
        buildCanonicalCukieReadFilter<LegacyCukiDocument>(),
        { tokenId },
        buildLegacyMarketplaceIdentityFilter(normalizedIdentity) as unknown as Filter<LegacyCukiDocument>,
      ],
    }, { projection: cukiProjection }).limit(2);
    const documents = await cursor.toArray();
    const document = documents.length === 1 ? documents[0] : null;

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
    if (!first || !isLegacyMarketplaceDocument(first, normalizedIdentity.network)) return null;
    return normalizeCuki(first);
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
      $and: [
        buildLegacyMarketplaceIdentityFilter({
          network: params.network,
          chainId: params.chainId,
          collection: params.collection,
        }) as Filter<LegacyCukiDocument>,
        { state: 'available' },
        { 'skills.generation': 1 },
      ],
    };

    if (params.owner?.trim()) {
      filter.$and?.push({ user: buildOwnerRegex(params.owner.trim()) });
    }

    const documents = await collection
      .find(filter, { projection: cukiProjection })
      .sort({ cukiNumber: 1, _id: 1 })
      .limit(Math.min(limit * 3, 180))
      .toArray();

    const networkBump = normalizeLegacyMarketplaceNetwork(params.network) === 'BSC' ? 1 : 0;
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
      $and: [
        buildLegacyMarketplaceIdentityFilter({
          network: params.network,
          chainId: params.chainId,
          collection: params.collection,
        }) as Filter<LegacyCukiDocument>,
        { origin: 'breed' },
      ],
    };

    const wallets = params.wallets
      ?.map((wallet) => wallet.trim())
      .filter((wallet) => wallet.length > 0);

    if (wallets?.length) {
      filter.$and?.push({ $or: wallets.map((wallet) => ({
        user: buildOwnerRegex(wallet),
      })) });
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
    const filter: Filter<LegacyPointDocument> = {
      $and: [
        buildLegacyMarketplaceIdentityFilter({
          network: params.network,
          chainId: params.chainId,
          collection: params.collection,
        }) as Filter<LegacyPointDocument>,
      ],
    };
    const wallets = params.wallets
      ?.map((wallet) => wallet.trim())
      .filter((wallet) => wallet.length > 0);

    if (wallets?.length) {
      const walletClauses = buildPointWalletClauses(
        wallets,
        normalizeLegacyMarketplaceNetwork(params.network) ?? undefined,
      );
      if (walletClauses.length === 0) {
        return {
          source: 'legacy',
          status: 'partial',
          coverage: 'legacy-historical',
          items: [],
          total: 0,
          offset,
          limit,
          summary: emptySummary,
        };
      }
      filter.$and?.push({ $or: walletClauses });
    }

    if (params.type?.trim() && params.type.trim() !== 'ALL') {
      filter.$and?.push({ type: params.type.trim() });
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
      source: 'legacy',
      status: 'partial',
      coverage: 'legacy-historical',
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
      status: 'unknown',
      coverage: 'unavailable',
      items: [],
      total: 0,
      offset,
      limit,
      summary: emptySummary,
      error: 'No se pudo cargar el historial de Cukie Points.',
    };
  }
}
