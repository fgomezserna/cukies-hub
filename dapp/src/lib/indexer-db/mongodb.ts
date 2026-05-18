import 'server-only';

import { Db, MongoClient } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var mongoIndexerClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var mongoIndexerDb: Db | undefined;
}

function getIndexerMongoUrl() {
  return process.env.CHAIN_INDEXER_MONGO_URL ?? process.env.DATABASE_URL;
}

function createIndexerClient() {
  const mongoUrl = getIndexerMongoUrl();

  if (!mongoUrl) {
    throw new Error('Falta CHAIN_INDEXER_MONGO_URL o DATABASE_URL para el viewer del indexer.');
  }

  const client = new MongoClient(mongoUrl);
  return {
    client,
    db: client.db(getIndexerDbName()),
  };
}

let mongoIndexerClient: MongoClient | undefined;
let mongoIndexerDb: Db | undefined;

function getConnection() {
  if (process.env.NODE_ENV === 'production') {
    if (!mongoIndexerClient || !mongoIndexerDb) {
      const connection = createIndexerClient();
      mongoIndexerClient = connection.client;
      mongoIndexerDb = connection.db;
    }

    return {
      client: mongoIndexerClient,
      db: mongoIndexerDb,
    };
  }

  if (!global.mongoIndexerClient || !global.mongoIndexerDb) {
    const connection = createIndexerClient();
    global.mongoIndexerClient = connection.client;
    global.mongoIndexerDb = connection.db;
  }

  return {
    client: global.mongoIndexerClient,
    db: global.mongoIndexerDb,
  };
}

async function ensureConnection() {
  const connection = getConnection();
  await connection.client.connect();
  return connection.db;
}

export async function getIndexerDb() {
  return ensureConnection();
}

export function getIndexerDbName() {
  return process.env.CHAIN_INDEXER_DB_NAME ?? 'cukieshub-new';
}
