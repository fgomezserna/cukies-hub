import type { Filter } from 'mongodb';

import { legacyMarketplaceContracts } from './config';
import type {
  LegacyMarketplaceCukiItem,
  LegacyMarketplaceCukiReference,
} from './types';
import type { LegacyCukiNetwork } from './types';

export type LegacyMarketplaceIdentityInput = {
  network?: unknown;
  chainId?: unknown;
  collection?: unknown;
};

export type LegacyMarketplaceIdentityFilterOptions = {
  allowMissingNetwork?: boolean;
};

export type LegacyMarketplaceDocument = {
  network?: unknown;
  chain?: unknown;
  chainId?: unknown;
  collection?: unknown;
  collectionAddress?: unknown;
  collectionAddressNormalized?: unknown;
};

export type LegacyMarketplaceDocumentIdentity = {
  network: LegacyCukiNetwork;
  chainId: 56 | null;
  collectionAddress: string;
};

const legacyCollectionFields = [
  'collection',
  'collectionAddress',
  'collectionAddressNormalized',
] as const;

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

export function normalizeLegacyMarketplaceNetwork(value: unknown): LegacyCukiNetwork | null {
  const network = nonEmptyString(value)?.toUpperCase();
  return network === 'BSC' || network === 'TRON' ? network : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function expectedIdentity(network: LegacyCukiNetwork): LegacyMarketplaceDocumentIdentity {
  if (network === 'BSC') {
    return {
      network,
      chainId: 56,
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
    };
  }

  return {
    network,
    chainId: null,
    collectionAddress: legacyMarketplaceContracts.tron.contracts.token,
  };
}

function numericChainId(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim());
  if (value && typeof value === 'object' && 'toString' in value && typeof value.toString === 'function') {
    const stringValue = value.toString();
    if (/^\d+$/.test(stringValue)) return Number(stringValue);
  }
  return null;
}

function isMissingIdentityValue(value: unknown) {
  return value === undefined || value === null || value === '';
}

function compatibleChain(network: LegacyCukiNetwork, value: unknown) {
  if (isMissingIdentityValue(value)) return true;
  if (network === 'TRON') return false;
  return numericChainId(value) === 56;
}

function compatibleNetworkLabel(network: LegacyCukiNetwork, value: unknown) {
  if (isMissingIdentityValue(value)) return true;
  return normalizeLegacyMarketplaceNetwork(value) === network;
}

function compatibleCollection(network: LegacyCukiNetwork, value: unknown) {
  if (isMissingIdentityValue(value)) return true;
  const collection = nonEmptyString(value);
  if (!collection) return false;
  const expected = expectedIdentity(network).collectionAddress;
  return network === 'BSC'
    ? collection.toLowerCase() === expected.toLowerCase()
    : collection === expected;
}

/**
 * Resolve the legacy identity carried by a document. Historical documents
 * may omit chainId and collection fields; when present they must still match
 * the canonical Legacy BSC 56 or TRON collection. This is the boundary that
 * prevents BSC testnet (97) rows in the unified `cukies` collection from
 * being reinterpreted as Legacy BSC.
 */
export function getLegacyMarketplaceDocumentIdentity(
  document: LegacyMarketplaceDocument,
): LegacyMarketplaceDocumentIdentity | null {
  const network = normalizeLegacyMarketplaceNetwork(document.network);
  if (!network) return null;
  if (!compatibleNetworkLabel(network, document.chain)) return null;
  if (!compatibleChain(network, document.chainId)) return null;
  if (legacyCollectionFields.some((field) => !compatibleCollection(network, document[field]))) {
    return null;
  }
  return expectedIdentity(network);
}

/**
 * Relations/history can contain old scalar references with no identity. They
 * remain readable, but a materialized object with explicit foreign identity
 * must never leak into the Legacy view.
 */
export function isLegacyMarketplaceDocument(
  document: LegacyMarketplaceDocument,
  expectedNetwork?: unknown,
) {
  const requestedNetwork = expectedNetwork === undefined
    ? null
    : normalizeLegacyMarketplaceNetwork(expectedNetwork);
  if (expectedNetwork !== undefined && !requestedNetwork) return false;

  const network = normalizeLegacyMarketplaceNetwork(document.network);
  if (!network) {
    const hasExplicitIdentity = document.chainId !== undefined
      || legacyCollectionFields.some((field) => document[field] !== undefined);
    return !hasExplicitIdentity;
  }
  if (requestedNetwork && network !== requestedNetwork) return false;
  return getLegacyMarketplaceDocumentIdentity(document) !== null;
}

function identityFieldClause(
  field: string,
  values: Array<unknown>,
) {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: '' },
      ...values.map((value) => ({ [field]: value })),
    ],
  };
}

function legacyIdentityClause(network: LegacyCukiNetwork) {
  const identity = expectedIdentity(network);
  const collection = network === 'BSC'
    ? new RegExp(`^${escapeRegExp(identity.collectionAddress)}$`, 'i')
    : identity.collectionAddress;

  return {
    network: new RegExp(`^${network}$`, 'i'),
    $and: [
      identityFieldClause('chain', [new RegExp(`^${network}$`, 'i')]),
      identityFieldClause(
        'chainId',
        network === 'BSC' ? [56, '56'] : [],
      ),
      ...legacyCollectionFields.map((field) => identityFieldClause(field, [collection])),
    ],
  };
}

function impossibleIdentityFilter() {
  return { _id: { $exists: false } };
}

/**
 * Mongo predicate for the canonical Legacy collections. Missing identity
 * fields are deliberately allowed for historical rows; explicit mismatches
 * (chainId 97, another collection, or another network) are excluded.
 */
export function buildLegacyMarketplaceIdentityFilter(
  input?: LegacyMarketplaceIdentityInput | unknown,
  options: LegacyMarketplaceIdentityFilterOptions = {},
): Filter<LegacyMarketplaceDocument> {
  const request = normalizeLegacyMarketplaceIdentityInput(input);
  if (request === null) return impossibleIdentityFilter();
  const networks = request.network ? [request.network] : (['BSC', 'TRON'] as const);
  const clauses = networks.map((network) => {
    const clause = legacyIdentityClause(network);
    if (!options.allowMissingNetwork) return clause;
    const { network: networkMatcher, ...withoutNetwork } = clause;
    return {
      ...withoutNetwork,
      $or: [
        { network: { $exists: false } },
        { network: null },
        { network: '' },
        { network: networkMatcher },
      ],
    };
  });
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

/**
 * Validate a caller-provided identity selector before it is applied to a
 * Legacy read. `chainId=97` and non-Legacy collections are invalid rather
 * than silently broadening the query.
 */
export function normalizeLegacyMarketplaceIdentityInput(
  input?: LegacyMarketplaceIdentityInput | unknown,
): { network?: LegacyCukiNetwork; chainId?: 56; collection?: string } | null {
  if (input === undefined || input === null || typeof input === 'string') {
    const rawNetwork = input === undefined || input === null
      ? undefined
      : nonEmptyString(input);
    const network = rawNetwork && rawNetwork.toLowerCase() !== 'all'
      ? normalizeLegacyMarketplaceNetwork(rawNetwork)
      : undefined;
    return input === undefined || input === null
      ? {}
      : !rawNetwork || rawNetwork.toLowerCase() === 'all'
        ? {}
        : network
        ? { network }
        : null;
  }
  if (typeof input !== 'object') return null;

  const values = input as LegacyMarketplaceIdentityInput;
  const rawNetwork = nonEmptyString(values.network);
  const network = rawNetwork && rawNetwork.toLowerCase() !== 'all'
    ? normalizeLegacyMarketplaceNetwork(rawNetwork)
    : undefined;
  if (rawNetwork && rawNetwork.toLowerCase() !== 'all' && !network) return null;

  const rawChainId = values.chainId;
  const hasChainId = !isMissingIdentityValue(rawChainId);
  const chainId = hasChainId ? numericChainId(rawChainId) : null;
  if (hasChainId && chainId !== 56) return null;
  if (network === 'TRON' && hasChainId) return null;

  const rawCollection = nonEmptyString(values.collection);
  let collectionNetwork: LegacyCukiNetwork | undefined;
  if (rawCollection) {
    collectionNetwork = compatibleCollection('BSC', rawCollection)
      ? 'BSC'
      : compatibleCollection('TRON', rawCollection)
        ? 'TRON'
        : undefined;
    if (!collectionNetwork) return null;
    if (network && collectionNetwork !== network) return null;
  }

  const resolvedNetwork = network ?? collectionNetwork ?? (hasChainId ? 'BSC' : undefined);
  return {
    ...(resolvedNetwork ? { network: resolvedNetwork } : {}),
    ...(hasChainId ? { chainId: 56 as const } : {}),
    ...(rawCollection ? { collection: rawCollection } : {}),
  };
}

type MarketplaceLegacyIdentity = Pick<
  LegacyMarketplaceCukiItem | LegacyMarketplaceCukiReference,
  'tokenId' | 'network'
>;

export function getLegacyMarketplaceCollection(network: string | null) {
  if (network === 'BSC') return legacyMarketplaceContracts.bsc.contracts.token;
  if (network === 'TRON') return legacyMarketplaceContracts.tron.contracts.token;
  return null;
}

export function getLegacyMarketplaceDetailHref(
  item: MarketplaceLegacyIdentity,
) {
  const params = new URLSearchParams({ source: 'legacy' });
  if (item.network) params.set('network', item.network);
  const collection = getLegacyMarketplaceCollection(item.network);
  if (collection) params.set('collection', collection);
  return `/marketplace/${encodeURIComponent(item.tokenId)}?${params.toString()}`;
}

export function matchesLegacyMarketplaceIdentity(
  item: LegacyMarketplaceCukiItem,
  input: { network?: string; collection?: string },
) {
  if (input.network && input.network !== item.network) return false;
  if (input.collection) {
    if (!item.collectionAddress) return false;
    const matchesCollection = item.network === 'BSC'
      ? input.collection.toLowerCase() === item.collectionAddress.toLowerCase()
      : input.collection === item.collectionAddress;
    if (!matchesCollection) return false;
  }
  return true;
}
