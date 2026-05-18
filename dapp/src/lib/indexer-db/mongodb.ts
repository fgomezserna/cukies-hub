import 'server-only';

import { Db, MongoClient } from 'mongodb';

const INDEXER_MONGO_URL = process.env.CHAIN_INDEXER_MONGO_URL ?? process.env.DATABASE_URL;
const INDEXER_DB_NAME = process.env.CHAIN_INDEXER_DB_NAME ?? 'cukieshub-new';

declare global {
  // eslint-disable-next-line no-var
  var mongoIndexerClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var mongoIndexerDb: Db | undefined;
}

function createIndexerClient() {
  if (!INDEXER_MONGO_URL) {
    throw new Error('Falta CHAIN_INDEXER_MONGO_URL o DATABASE_URL para el viewer del indexer.');
  }

  const client = new MongoClient(INDEXER_MONGO_URL);
  return {
    client,
    db: client.db(INDEXER_DB_NAME),
  };
}

let mongoIndexerClient: MongoClient;
let mongoIndexerDb: Db;

if (process.env.NODE_ENV === 'production') {
  const connection = createIndexerClient();
  mongoIndexerClient = connection.client;
  mongoIndexerDb = connection.db;
} else {
  if (!global.mongoIndexerClient || !global.mongoIndexerDb) {
    const connection = createIndexerClient();
    global.mongoIndexerClient = connection.client;
    global.mongoIndexerDb = connection.db;
  }

  mongoIndexerClient = global.mongoIndexerClient;
  mongoIndexerDb = global.mongoIndexerDb;
}

async function ensureConnection() {
  await mongoIndexerClient.connect();
  return mongoIndexerDb;
}

export async function getIndexerDb() {
  return ensureConnection();
}

export function getIndexerDbName() {
  return INDEXER_DB_NAME;
}
