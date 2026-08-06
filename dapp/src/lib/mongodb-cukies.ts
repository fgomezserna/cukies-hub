import { Db, MongoClient } from 'mongodb';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var mongoCukiesClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var mongoCukiesDb: Db | undefined;
}

let mongoCukiesClient: MongoClient | undefined;
let mongoCukiesDb: Db | undefined;

function databaseNameFromMongoUrl(databaseUrl: string) {
  const match = databaseUrl.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
  if (!match || !match[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error('CUKIES_DATABASE_URL contains an invalid database name.');
  }
}

function validDatabaseName(value: string) {
  return value.length > 0 && value.length <= 64 && !/[\s/\\."$*<>:|?\u0000]/.test(value);
}

export function requireCukiesDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const databaseUrl = env.CUKIES_DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('CUKIES_DATABASE_URL is required to access the legacy Cukies database.');
  }

  const databaseName = databaseNameFromMongoUrl(databaseUrl);
  if (!databaseName || !validDatabaseName(databaseName)) {
    throw new Error('Legacy Cukies database name is required in CUKIES_DATABASE_URL.');
  }

  return { databaseUrl, databaseName };
}

function getOrCreateCukiesConnection() {
  const config = requireCukiesDatabaseConfig();

  if (mongoCukiesClient && mongoCukiesDb) {
    if (mongoCukiesDb.databaseName !== config.databaseName) {
      throw new Error('Cached legacy database does not match CUKIES_DATABASE_URL.');
    }
    return { client: mongoCukiesClient, db: mongoCukiesDb };
  }

  if (process.env.NODE_ENV !== 'production' && global.mongoCukiesClient) {
    mongoCukiesClient = global.mongoCukiesClient;
    if (global.mongoCukiesDb && global.mongoCukiesDb.databaseName !== config.databaseName) {
      throw new Error('Cached legacy database does not match CUKIES_DATABASE_URL.');
    }
    mongoCukiesDb = global.mongoCukiesDb ?? mongoCukiesClient.db(config.databaseName);
    global.mongoCukiesDb = mongoCukiesDb;
    return { client: mongoCukiesClient, db: mongoCukiesDb };
  }

  mongoCukiesClient = new MongoClient(config.databaseUrl);
  mongoCukiesDb = mongoCukiesClient.db(config.databaseName);

  if (process.env.NODE_ENV !== 'production') {
    global.mongoCukiesClient = mongoCukiesClient;
    global.mongoCukiesDb = mongoCukiesDb;
  }

  return { client: mongoCukiesClient, db: mongoCukiesDb };
}

async function ensureConnection() {
  const { client, db } = getOrCreateCukiesConnection();
  await client.connect();
  await db.admin().ping();
  return db;
}

export async function getCukiesDb(): Promise<Db> {
  return await ensureConnection();
}

export async function getCukiesCollection(collectionName: string) {
  const db = await getCukiesDb();
  return db.collection(collectionName);
}

// Helper functions for common operations
export const cukiesDb = {
  // Users collection
  users: () => getCukiesCollection('users'),
  
  // Cukies collection (characters)
  cukies: () => getCukiesCollection('cukies'),
  
  // Wallets collection
  wallets: () => getCukiesCollection('wallets'),
  
  // Points collections
  points: () => getCukiesCollection('points'),
  txPoints: () => getCukiesCollection('tx_points'),
  
  // Referrals collection
  referrals: () => getCukiesCollection('referrals'),
  
  // Transactions collections
  txNfts: () => getCukiesCollection('tx_nfts'),
  txMarketplace: () => getCukiesCollection('txMarketplace'),
  txLottery: () => getCukiesCollection('txLottery'),
  
  // Other collections
  originals: () => getCukiesCollection('originals'),
  processedEvents: () => getCukiesCollection('processedEvents'),
  completedEvents: () => getCukiesCollection('completedEvents'),
  settings: () => getCukiesCollection('settings'),
  config: () => getCukiesCollection('config'),
};

// Close connection (useful for scripts)
export async function closeCukiesConnection() {
  if (mongoCukiesClient) {
    await mongoCukiesClient.close();
  }
  if (global.mongoCukiesClient === mongoCukiesClient) {
    global.mongoCukiesClient = undefined;
    global.mongoCukiesDb = undefined;
  }
  mongoCukiesClient = undefined;
  mongoCukiesDb = undefined;
}
