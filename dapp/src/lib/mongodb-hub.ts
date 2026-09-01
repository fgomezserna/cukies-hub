import { Db, MongoClient, ObjectId } from 'mongodb';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var mongoHubClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var mongoHubDb: Db | undefined;
}

let mongoHubClient: MongoClient | undefined;
let mongoHubDb: Db | undefined;

function databaseNameFromMongoUrl(databaseUrl: string) {
  const match = databaseUrl.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/i);
  if (!match || !match[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    throw new Error('DATABASE_URL contains an invalid database name.');
  }
}

function validDatabaseName(value: string) {
  return value.length > 0 && value.length <= 64 && !/[\s/\\."$*<>:|?\u0000]/.test(value);
}

export function requireHubDatabaseConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to access the Cukies Hub database.');
  }

  const databaseName = databaseNameFromMongoUrl(databaseUrl);
  if (!databaseName || !validDatabaseName(databaseName)) {
    throw new Error('Hub database name is required in DATABASE_URL.');
  }

  return { databaseUrl, databaseName };
}

function getOrCreateHubConnection() {
  const config = requireHubDatabaseConfig();

  if (mongoHubClient && mongoHubDb) {
    if (mongoHubDb.databaseName !== config.databaseName) {
      throw new Error('Cached hub database does not match DATABASE_URL.');
    }
    return { client: mongoHubClient, db: mongoHubDb };
  }

  if (process.env.NODE_ENV !== 'production' && global.mongoHubClient) {
    mongoHubClient = global.mongoHubClient;
    if (global.mongoHubDb && global.mongoHubDb.databaseName !== config.databaseName) {
      throw new Error('Cached hub database does not match DATABASE_URL.');
    }
    mongoHubDb = global.mongoHubDb ?? mongoHubClient.db(config.databaseName);
    global.mongoHubDb = mongoHubDb;
    return { client: mongoHubClient, db: mongoHubDb };
  }

  mongoHubClient = new MongoClient(config.databaseUrl);
  mongoHubDb = mongoHubClient.db(config.databaseName);

  if (process.env.NODE_ENV !== 'production') {
    global.mongoHubClient = mongoHubClient;
    global.mongoHubDb = mongoHubDb;
  }

  return { client: mongoHubClient, db: mongoHubDb };
}

async function ensureConnection() {
  const { client, db } = getOrCreateHubConnection();
  await client.connect();
  await db.admin().ping();
  return db;
}

export async function getHubDb(): Promise<Db> {
  return await ensureConnection();
}

export async function getHubCollection(collectionName: string) {
  const db = await getHubDb();
  return db.collection(collectionName);
}

// Helper function to create a user directly in MongoDB (bypasses Prisma transactions)
export async function createUserDirectly(data: {
  walletAddress: string;
  username: string;
  email?: string;
  isUsernameSet?: boolean;
  bio?: string;
}) {
  const db = await getHubDb();
  const usersCollection = db.collection('User');
  
  const now = new Date();
  const userDoc = {
    _id: new ObjectId(),
    walletAddress: data.walletAddress,
    username: data.username,
    isUsernameSet: data.isUsernameSet ?? false,
    email: data.email || null,
    profilePictureUrl: null,
    bio: data.bio || null,
    xp: 0,
    twitterHandle: null,
    twitterName: null,
    twitterId: null,
    discordUsername: null,
    telegramUsername: null,
    createdAt: now,
    updatedAt: now,
  };

  await usersCollection.insertOne(userDoc);
  
  return userDoc._id.toString();
}

// Close connection (useful for scripts)
export async function closeHubConnection() {
  if (mongoHubClient) {
    await mongoHubClient.close();
  }
  if (global.mongoHubClient === mongoHubClient) {
    global.mongoHubClient = undefined;
    global.mongoHubDb = undefined;
  }
  mongoHubClient = undefined;
  mongoHubDb = undefined;
}
