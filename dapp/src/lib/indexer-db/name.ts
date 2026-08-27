const DEFAULT_INDEXER_DB_NAME = 'cukieshub-new';
const LEGACY_CUKIES_DB_NAME = 'cukies';

export function resolveIndexerDbName(value = process.env.CHAIN_INDEXER_DB_NAME) {
  const dbName = (value ?? DEFAULT_INDEXER_DB_NAME).trim();

  if (!dbName) {
    throw new Error('CHAIN_INDEXER_DB_NAME no puede estar vacio.');
  }

  if (dbName.toLowerCase() === LEGACY_CUKIES_DB_NAME) {
    throw new Error('CHAIN_INDEXER_DB_NAME no puede apuntar a la base legacy `cukies`.');
  }

  return dbName;
}

export function getIndexerDbName() {
  return resolveIndexerDbName();
}
