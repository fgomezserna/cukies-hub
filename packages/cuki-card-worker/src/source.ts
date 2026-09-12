import type { Filter } from 'mongodb';

import type {
  AssetIdentityContext,
  CardWorkerConfig,
  CardWorkerSourceFormat,
  CukiDocument,
} from './types.js';
import { canonicalAssetIdentity, validateAssetIdentityContext } from './identity.js';

export const LEGACY_STAGING_DB_NAME = 'cukieshub-new-staging';

export const LEGACY_SOURCE_CONTEXTS = {
  BSC: {
    network: 'BSC',
    chainId: 56,
    collectionAddressNormalized: '0x0dbdebcc62f11005bf434abfad74564e896ac861',
  },
  TRON: {
    network: 'TRON',
    collectionAddressNormalized: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe',
  },
} as const;

export class CukiSourceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CukiSourceValidationError';
  }
}

function decimalTokenId(value: unknown) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return String(value);
  }

  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value)) return null;
  return value;
}

export function legacyTokenIdFromDocumentId(value: unknown) {
  return decimalTokenId(value);
}

function normalizedNetwork(value: unknown) {
  if (typeof value !== 'string') return null;
  const network = value.trim().toUpperCase();
  return network === 'BSC' || network === 'TRON' ? network : null;
}

function contextForNetwork(network: string) {
  return network === 'BSC' ? LEGACY_SOURCE_CONTEXTS.BSC : LEGACY_SOURCE_CONTEXTS.TRON;
}

export function legacySourceIdentityForNetwork(network: string): AssetIdentityContext {
  const context = contextForNetwork(network);
  validateAssetIdentityContext(context);
  return context;
}

function sameLegacyCollection(network: string, value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  return network === 'BSC'
    ? normalized.toLowerCase() === LEGACY_SOURCE_CONTEXTS.BSC.collectionAddressNormalized
    : normalized === LEGACY_SOURCE_CONTEXTS.TRON.collectionAddressNormalized;
}

function identityFieldClause(field: string, values: Array<unknown>) {
  return {
    $or: [
      { [field]: { $exists: false } },
      { [field]: null },
      { [field]: '' },
      ...values.map((value) => ({ [field]: value })),
    ],
  };
}

function legacyIdentityClause(network: 'BSC' | 'TRON') {
  const context = LEGACY_SOURCE_CONTEXTS[network];
  const collection = network === 'BSC'
    ? new RegExp(`^${context.collectionAddressNormalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    : context.collectionAddressNormalized;
  return {
    network: new RegExp(`^${network}$`, 'i'),
    $and: [
      identityFieldClause('chain', [new RegExp(`^${network}$`, 'i')]),
      identityFieldClause('chainId', network === 'BSC' ? [56, '56'] : []),
      ...(['collection', 'collectionAddress', 'collectionAddressNormalized'] as const)
        .map((field) => identityFieldClause(field, [collection])),
    ],
  };
}

/**
 * Query boundary for the opt-in legacy worker. The unified staging database
 * also contains indexed BSC/97 documents, so numeric _id alone is not a safe
 * source selector. Historical legacy rows may omit chainId/collection; any
 * explicit foreign identity is rejected here and again during normalization.
 */
export function legacySourceIdentityFilter(): Filter<CukiDocument> {
  return {
    $or: [legacyIdentityClause('BSC'), legacyIdentityClause('TRON')],
  };
}

export function normalizeCukiSourceDocument(
  document: CukiDocument,
  sourceFormat: CardWorkerSourceFormat,
): CukiDocument {
  if (sourceFormat === 'indexed') return document;

  const tokenId = decimalTokenId(document._id);
  if (!tokenId) {
    throw new CukiSourceValidationError(
      `Legacy _id no es un entero decimal valido: ${String(document._id)}.`,
    );
  }

  const network = normalizedNetwork(document.network);
  if (!network) {
    throw new CukiSourceValidationError(`Legacy network no es BSC/TRON para ${tokenId}.`);
  }

  if (document.chain !== undefined && document.chain !== null && document.chain !== '') {
    const declaredChain = normalizedNetwork(document.chain);
    if (declaredChain !== network) {
      throw new CukiSourceValidationError(`Legacy identidad canónica inválida: chain no coincide con network para ${tokenId}.`);
    }
  }

  const declaredTokenId = document.tokenId === undefined || document.tokenId === null
    ? null
    : decimalTokenId(document.tokenId);
  if (document.tokenId !== undefined && document.tokenId !== null && declaredTokenId !== tokenId) {
    throw new CukiSourceValidationError(`Legacy tokenId entra en conflicto con _id para ${tokenId}.`);
  }

  const context = contextForNetwork(network);
  for (const collection of [document.collection, document.collectionAddress, document.collectionAddressNormalized]) {
    if (!sameLegacyCollection(network, collection)) {
      throw new CukiSourceValidationError(`Legacy collection no coincide con TOKEN ${network} para ${tokenId}.`);
    }
  }
  if (network === 'BSC' && document.chainId !== undefined && document.chainId !== null && document.chainId !== 56 && document.chainId !== '56') {
    throw new CukiSourceValidationError(`Legacy chainId no coincide con BSC 56 para ${tokenId}.`);
  }
  if (network === 'TRON' && document.chainId !== undefined && document.chainId !== null && document.chainId !== '') {
    throw new CukiSourceValidationError(`Legacy TRON no admite chainId EVM para ${tokenId}.`);
  }

  const identityDocument = {
    ...document,
    tokenId,
    network,
    ...('chainId' in context ? { chainId: context.chainId } : { chainId: undefined }),
    collectionAddressNormalized: context.collectionAddressNormalized,
    collectionAddress: context.collectionAddressNormalized,
  };
  if (!canonicalAssetIdentity(identityDocument, context)) {
    throw new CukiSourceValidationError(`Legacy identidad canónica inválida para ${tokenId}.`);
  }

  return {
    ...identityDocument,
    chain: network,
    sourceValidationError: undefined,
  };
}

export function normalizeCukiSourceForRead(document: CukiDocument, sourceFormat: CardWorkerSourceFormat) {
  try {
    return normalizeCukiSourceDocument(document, sourceFormat);
  } catch (error) {
    return {
      ...document,
      sourceValidationError: error instanceof Error ? error.message : String(error),
    };
  }
}

function sourceIdCandidates(value: unknown) {
  const tokenId = decimalTokenId(value);
  if (!tokenId) {
    throw new CukiSourceValidationError(`Legacy tokenId/_id no es un entero decimal valido: ${String(value)}.`);
  }

  const numeric = Number(tokenId);
  return Number.isSafeInteger(numeric) && String(numeric) === tokenId
    ? [tokenId, numeric] as Array<string | number>
    : [tokenId];
}

export function sourceDocumentFilter(
  documentId: string | number,
  sourceFormat: CardWorkerSourceFormat,
): Filter<CukiDocument> {
  void sourceFormat;
  return { _id: documentId };
}

export function sourceTokenIdFilter(
  tokenId: string,
  sourceFormat: CardWorkerSourceFormat,
): Filter<CukiDocument> {
  if (sourceFormat === 'indexed') return { $or: [{ tokenId }, { _id: tokenId }] };
  const candidates = sourceIdCandidates(tokenId);
  return candidates.length === 1
    ? { _id: candidates[0] }
    : { $or: candidates.map((_id) => ({ _id })) };
}

export function sourceCandidateFilter(sourceFormat: CardWorkerSourceFormat): Filter<CukiDocument> {
  if (sourceFormat === 'indexed') return {};
  return {
    $and: [
      {
        $or: [
          { _id: { $type: 'number' } },
          { _id: { $type: 'string', $regex: /^(0|[1-9][0-9]*)$/ } },
        ],
      },
      legacySourceIdentityFilter(),
    ],
  } as Filter<CukiDocument>;
}

export function assertCardWorkerSourceConfig(config: Pick<CardWorkerConfig, 'sourceFormat' | 'legacyStagingEnabled' | 'dbName'>) {
  if (config.sourceFormat === 'indexed') return;
  if (!config.legacyStagingEnabled) {
    throw new Error('La fuente legacy exige CARD_WORKER_LEGACY_STAGING_ENABLED=true.');
  }
  if (config.dbName !== LEGACY_STAGING_DB_NAME) {
    throw new Error(`La fuente legacy sólo permite la DB staging ${LEGACY_STAGING_DB_NAME}.`);
  }
}
