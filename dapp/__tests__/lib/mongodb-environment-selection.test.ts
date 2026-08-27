const originalDatabaseUrl = process.env.DATABASE_URL;
const originalCukiesDatabaseUrl = process.env.CUKIES_DATABASE_URL;
const mockMongoClient = jest.fn();

jest.mock('mongodb', () => ({
  MongoClient: mockMongoClient,
  ObjectId: jest.fn(),
}));

function clearCachedMongoConnections() {
  const globals = globalThis as typeof globalThis & Record<string, unknown>;
  delete globals.mongoCukiesClient;
  delete globals.mongoCukiesDb;
  delete globals.mongoHubClient;
  delete globals.mongoHubDb;
}

describe('environment-specific MongoDB selection', () => {
  beforeEach(() => {
    jest.resetModules();
    mockMongoClient.mockReset();
    clearCachedMongoConnections();
    delete process.env.DATABASE_URL;
    delete process.env.CUKIES_DATABASE_URL;
  });

  afterAll(() => {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalCukiesDatabaseUrl === undefined) delete process.env.CUKIES_DATABASE_URL;
    else process.env.CUKIES_DATABASE_URL = originalCukiesDatabaseUrl;
    clearCachedMongoConnections();
  });

  it('fails closed without the required connection URL', async () => {
    const cukies = await import('@/lib/mongodb-cukies');
    const hub = await import('@/lib/mongodb-hub');

    expect(() => cukies.requireCukiesDatabaseConfig({})).toThrow(
      'CUKIES_DATABASE_URL is required',
    );
    expect(() => hub.requireHubDatabaseConfig({})).toThrow('DATABASE_URL is required');
    await expect(cukies.getCukiesDb()).rejects.toThrow('CUKIES_DATABASE_URL is required');
    await expect(hub.getHubDb()).rejects.toThrow('DATABASE_URL is required');
    expect(mockMongoClient).not.toHaveBeenCalled();
  });

  it('uses the database encoded in each environment URL', async () => {
    const cukies = await import('@/lib/mongodb-cukies');
    const hub = await import('@/lib/mongodb-hub');

    expect(cukies.requireCukiesDatabaseConfig({
      CUKIES_DATABASE_URL: 'mongodb://db.invalid:27017/cukies-legacy-staging?authSource=admin',
    }).databaseName).toBe('cukies-legacy-staging');
    expect(hub.requireHubDatabaseConfig({
      DATABASE_URL: 'mongodb://db.invalid:27017/cukies-hub-staging?authSource=admin',
    }).databaseName).toBe('cukies-hub-staging');

    // The same rule preserves the current production database names without a special case.
    expect(cukies.requireCukiesDatabaseConfig({
      CUKIES_DATABASE_URL: 'mongodb://db.invalid:27017/cukies?authSource=admin',
    }).databaseName).toBe('cukies');
    expect(hub.requireHubDatabaseConfig({
      DATABASE_URL: 'mongodb://db.invalid:27017/cukies-hub?authSource=admin',
    }).databaseName).toBe('cukies-hub');
  });

  it('rejects URLs without an explicit database name', async () => {
    const cukies = await import('@/lib/mongodb-cukies');
    const hub = await import('@/lib/mongodb-hub');

    expect(() => cukies.requireCukiesDatabaseConfig({
      CUKIES_DATABASE_URL: 'mongodb://db.invalid:27017',
    })).toThrow('database name is required');
    expect(() => hub.requireHubDatabaseConfig({
      DATABASE_URL: 'mongodb://db.invalid:27017',
    })).toThrow('database name is required');
  });

  it('passes the URL-selected name to MongoClient.db', async () => {
    const ping = jest.fn().mockResolvedValue({ ok: 1 });
    const db = { databaseName: 'cukies-legacy-staging', admin: () => ({ ping }) };
    const client = {
      connect: jest.fn().mockResolvedValue(undefined),
      db: jest.fn(() => db),
    };
    mockMongoClient.mockImplementation(() => client);
    process.env.CUKIES_DATABASE_URL =
      'mongodb://db.invalid:27017/cukies-legacy-staging?authSource=admin';

    const cukies = await import('@/lib/mongodb-cukies');
    await cukies.getCukiesDb();

    expect(client.db).toHaveBeenCalledWith('cukies-legacy-staging');
    expect(client.connect).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });
});
