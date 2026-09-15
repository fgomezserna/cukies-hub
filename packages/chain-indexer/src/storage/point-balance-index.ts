import type { Db, Document, IndexDescriptionInfo } from 'mongodb';

export const LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME = 'addressNormalized_1';
export const POINT_BALANCE_ADDRESS_INDEX_NAME = 'point_balances_address_normalized_unique';
export const POINT_BALANCE_ADDRESS_INDEX_KEY = { addressNormalized: 1 } as const;
export const POINT_BALANCE_ADDRESS_INDEX_OPTIONS = {
  unique: true,
  name: POINT_BALANCE_ADDRESS_INDEX_NAME,
  partialFilterExpression: {
    addressNormalized: { $type: 'string' },
  },
} as const;

type PointBalanceIndexState = 'absent' | 'legacy' | 'transitioning' | 'current' | 'incompatible';

type RelevantIndex = Pick<
  IndexDescriptionInfo,
  'name' | 'key' | 'unique' | 'partialFilterExpression'
>;

function hasAddressKey(index: Pick<IndexDescriptionInfo, 'key'>) {
  return index.key.addressNormalized === 1 && Object.keys(index.key).length === 1;
}

function hasCurrentPartialFilter(index: Pick<IndexDescriptionInfo, 'partialFilterExpression'>) {
  const filter = index.partialFilterExpression as Document | undefined;
  if (!filter || Object.keys(filter).length !== 1) return false;
  const addressFilter = filter.addressNormalized;
  return Boolean(
    addressFilter
    && typeof addressFilter === 'object'
    && !Array.isArray(addressFilter)
    && Object.keys(addressFilter).length === 1
    && (addressFilter as Document).$type === 'string',
  );
}

function isLegacyIndex(index: RelevantIndex) {
  return index.name === LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME
    && hasAddressKey(index)
    && index.unique === true
    && index.partialFilterExpression === undefined;
}

function isCurrentIndex(index: RelevantIndex) {
  return index.name === POINT_BALANCE_ADDRESS_INDEX_NAME
    && hasAddressKey(index)
    && index.unique === true
    && hasCurrentPartialFilter(index);
}

export function pointBalanceAddressIndexState(indexes: RelevantIndex[]): PointBalanceIndexState {
  const candidates = indexes.filter((index) => (
    index.name === LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME
    || index.name === POINT_BALANCE_ADDRESS_INDEX_NAME
    || hasAddressKey(index)
  ));
  if (candidates.length === 0) return 'absent';

  const legacy = candidates.filter(isLegacyIndex);
  const current = candidates.filter(isCurrentIndex);
  if (legacy.length === 1 && current.length === 0 && candidates.length === 1) return 'legacy';
  if (legacy.length === 1 && current.length === 1 && candidates.length === 2) return 'transitioning';
  if (legacy.length === 0 && current.length === 1 && candidates.length === 1) return 'current';
  return 'incompatible';
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { code?: unknown }).code;
}

function errorCodeName(error: unknown) {
  if (!error || typeof error !== 'object') return undefined;
  return (error as { codeName?: unknown }).codeName;
}

function isNamespaceNotFound(error: unknown) {
  return errorCode(error) === 26 || errorCodeName(error) === 'NamespaceNotFound';
}

function isIndexNotFound(error: unknown) {
  return errorCode(error) === 27 || errorCodeName(error) === 'IndexNotFound';
}

async function listIndexes(db: Db) {
  try {
    return await db.collection('point_balances').listIndexes().toArray();
  } catch (error) {
    if (isNamespaceNotFound(error)) return [];
    throw error;
  }
}

/**
 * Replaces the historical global uniqueness constraint with a partial one.
 * The partial index is built under a new name before the historical index is
 * removed, so string addresses remain protected throughout the migration.
 * Both indexer runtimes can execute this transition concurrently.
 */
export async function ensurePointBalanceAddressIndex(db: Db) {
  const balances = db.collection('point_balances');
  let state = pointBalanceAddressIndexState(await listIndexes(db));
  const initialState = state;

  if (state === 'incompatible') {
    throw new Error('Indices de addressNormalized en point_balances con forma inesperada; migracion automatica rechazada.');
  }

  if (state === 'legacy') {
    const duplicate = await balances.aggregate([
      { $match: { addressNormalized: { $type: 'string' } } },
      { $group: { _id: '$addressNormalized', count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $limit: 1 },
    ]).next();
    if (duplicate) {
      throw new Error(`Indice ${LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME} no puede migrarse: hay balances historicos duplicados.`);
    }
  }

  // createIndex is deliberately issued even when listIndexes already exposes
  // the desired specification. Mongo publishes in-progress builds there; an
  // identical createIndex call waits for that build and is therefore the
  // readiness barrier before the historical constraint can be removed.
  await balances.createIndex(POINT_BALANCE_ADDRESS_INDEX_KEY, POINT_BALANCE_ADDRESS_INDEX_OPTIONS);
  state = pointBalanceAddressIndexState(await listIndexes(db));
  if (state !== 'current' && state !== 'transitioning') {
    throw new Error(`Indice ${POINT_BALANCE_ADDRESS_INDEX_NAME} no quedo instalado tras createIndex.`);
  }

  let removedLegacy = false;
  if (state === 'transitioning') {
    try {
      await balances.dropIndex(LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME);
    } catch (error) {
      if (!isIndexNotFound(error)) throw error;
    }
    const finalState = pointBalanceAddressIndexState(await listIndexes(db));
    if (finalState !== 'current') {
      throw new Error(`Indice historico eliminado, pero ${POINT_BALANCE_ADDRESS_INDEX_NAME} no es el unico indice compatible.`);
    }
    removedLegacy = true;
  }

  const action = removedLegacy || initialState === 'legacy' || initialState === 'transitioning'
    ? 'migrated' as const
    : initialState === 'current'
      ? 'unchanged' as const
      : 'created' as const;
  if (action !== 'unchanged') {
    console.log('[chain-indexer] point balance address index ensured', {
      action,
      index: POINT_BALANCE_ADDRESS_INDEX_NAME,
      previousIndex: removedLegacy ? LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME : null,
      preservedDocuments: true,
      partialType: 'string',
    });
  }
  return { action };
}
