import 'server-only';

import { type ClientSession, Db, MongoClient, ReadPreference } from 'mongodb';

import { SchemaNotReadyError } from '@/lib/uki-economy/errors';

import { getIndexerDbName } from './name';

export const ECONOMY_SCHEMA_METADATA_COLLECTION = 'economy_schema_metadata';
export const ECONOMY_SCHEMA_METADATA_ID = 'uki-economy';
export const ECONOMY_SCHEMA_VERSION = 3;

export type EconomySchemaMetadata = {
  _id: typeof ECONOMY_SCHEMA_METADATA_ID;
  schemaVersion: typeof ECONOMY_SCHEMA_VERSION;
  dbName: string;
  initializedAt: Date;
  updatedAt: Date;
  transactionVerifiedAt: Date;
};

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
  return connection;
}

export async function getIndexerDb() {
  const connection = await ensureConnection();
  return connection.db;
}

export async function assertEconomySchema(
  db: Db,
  expectedDbName = getIndexerDbName(),
  session?: ClientSession,
) {
  if (db.databaseName !== expectedDbName) {
    throw new SchemaNotReadyError(
      `La conexion apunta a ${db.databaseName}, no a la base de economia esperada ${expectedDbName}.`,
    );
  }

  const metadata = await db
    .collection<EconomySchemaMetadata>(ECONOMY_SCHEMA_METADATA_COLLECTION)
    .findOne({ _id: ECONOMY_SCHEMA_METADATA_ID }, { session });

  if (!metadata) {
    throw new SchemaNotReadyError(
      `La base ${expectedDbName} no tiene inicializado el schema de economia UKI.`,
    );
  }

  if (
    metadata.schemaVersion !== ECONOMY_SCHEMA_VERSION
    || metadata.dbName !== expectedDbName
    || !(metadata.initializedAt instanceof Date)
    || !(metadata.updatedAt instanceof Date)
    || !(metadata.transactionVerifiedAt instanceof Date)
  ) {
    throw new SchemaNotReadyError(
      `El sentinel de economia de ${expectedDbName} es incompatible con schemaVersion ${ECONOMY_SCHEMA_VERSION} o no acredita transacciones.`,
    );
  }

  return metadata;
}

export async function getEconomyDb() {
  const connection = await ensureConnection();
  await assertEconomySchema(connection.db);
  return connection.db;
}

export type EconomyTransactionWork<T> = (
  db: Db,
  session: ClientSession,
) => Promise<T>;

export async function withEconomyTransaction<T>(work: EconomyTransactionWork<T>) {
  const connection = await ensureConnection();
  const session = connection.client.startSession();

  try {
    return await session.withTransaction(
      async () => {
        await assertEconomySchema(connection.db, getIndexerDbName(), session);
        return work(connection.db, session);
      },
      {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
        readPreference: ReadPreference.primary,
      },
    );
  } finally {
    await session.endSession();
  }
}

export { getIndexerDbName } from './name';
