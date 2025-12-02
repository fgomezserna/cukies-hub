import { MongoClient, Db, ObjectId } from 'mongodb';

// Connection URL for cukies-hub database
const HUB_DATABASE_URL = process.env.DATABASE_URL || 
  'mongodb://admin:changeme123@192.168.1.221:27017/cukies-hub?authSource=admin';

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var mongoHubClient: MongoClient | undefined;
  // eslint-disable-next-line no-var
  var mongoHubDb: Db | undefined;
}

let mongoHubClient: MongoClient;
let mongoHubDb: Db;

if (process.env.NODE_ENV === 'production') {
  mongoHubClient = new MongoClient(HUB_DATABASE_URL);
  mongoHubDb = mongoHubClient.db('cukies-hub');
} else {
  // In development, use a global variable to prevent multiple connections
  if (!global.mongoHubClient) {
    global.mongoHubClient = new MongoClient(HUB_DATABASE_URL);
    global.mongoHubDb = global.mongoHubClient.db('cukies-hub');
  }
  mongoHubClient = global.mongoHubClient;
  mongoHubDb = global.mongoHubDb!; // Safe to use ! here as we check above
}

// Ensure connection is established
async function ensureConnection() {
  try {
    // Try to ping the database to check connection
    await mongoHubDb.admin().ping();
  } catch {
    // If ping fails, connect
    await mongoHubClient.connect();
  }
  return mongoHubDb;
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
    referralCode: null,
    referredById: null,
    referralRewards: 0,
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
}

