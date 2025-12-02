import { MongoClient, Db } from 'mongodb';

// Connection URL for cukies database
const CUKIES_DATABASE_URL = process.env.CUKIES_DATABASE_URL || 
  'mongodb://admin:changeme123@192.168.1.221:27017/cukies?authSource=admin';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var mongoCukiesClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var mongoCukiesDb: Db | undefined;
}

let mongoCukiesClient: MongoClient;
let mongoCukiesDb: Db;

if (process.env.NODE_ENV === 'production') {
  mongoCukiesClient = new MongoClient(CUKIES_DATABASE_URL);
  mongoCukiesDb = mongoCukiesClient.db('cukies');
} else {
  // In development, use a global variable to prevent multiple connections
  if (!global.mongoCukiesClient) {
    global.mongoCukiesClient = new MongoClient(CUKIES_DATABASE_URL);
    global.mongoCukiesDb = global.mongoCukiesClient.db('cukies');
  }
  mongoCukiesClient = global.mongoCukiesClient;
  mongoCukiesDb = global.mongoCukiesDb!; // Safe to use ! here as we check above
}

// Ensure connection is established
async function ensureConnection() {
  try {
    // Try to ping the database to check connection
    await mongoCukiesDb.admin().ping();
  } catch {
    // If ping fails, connect
    await mongoCukiesClient.connect();
  }
  return mongoCukiesDb;
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
}

