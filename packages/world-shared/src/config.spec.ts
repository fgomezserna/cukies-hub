import { readWorldConfig } from './config';

describe('World runtime configuration', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
  });

  afterAll(() => {
    process.env = original;
  });

  function productionEnv(overrides: NodeJS.ProcessEnv = {}) {
    process.env = {
      ...process.env,
      NODE_ENV: 'production',
      WORLD_RUNTIME_ENABLED: 'true',
      APP_ENV: 'staging',
      WORLD_NAMESPACE: 'cukies-world-staging',
      WORLD_DATA_MONGO_URL: 'mongodb+srv://cluster.example/cukies-world-data-staging?retryWrites=true',
      WORLD_GAME_MONGO_URL: 'mongodb://user:pass@mongo-a:27017,mongo-b:27018/cukies-world-game-staging?replicaSet=world',
      WORLD_REDIS_URL: 'rediss://redis.example:6380/0',
      WORLD_SESSION_SECRET: 'a'.repeat(48),
      WORLD_SESSION_ISSUER: 'cukies-world',
      WORLD_SESSION_AUDIENCE: 'cukies-world-api',
      WORLD_SESSION_EXPIRES_IN: '15m',
      WORLD_SESSION_MAX_TTL_SECONDS: '3600',
      WORLD_CORS_ORIGINS: 'https://play.example,https://admin.example',
      ...overrides,
    };
  }

  it('accepts replica seedlist URLs and derives canonical staging names', () => {
    productionEnv();
    const config = readWorldConfig('api', { test: false });
    expect(config.namespace).toBe('cukies-world-staging');
    expect(config.dataMongoUrl).toContain('/cukies-world-data-staging');
    expect(config.gameMongoUrl).toContain('/cukies-world-game-staging');
    expect(config.redisTls).toBe(true);
    expect(config.corsOrigins).toEqual(['https://play.example', 'https://admin.example']);
  });

  it.each([
    ['WORLD_RUNTIME_ENABLED', '1'],
    ['WORLD_NAMESPACE', 'wrong'],
    ['WORLD_DATA_MONGO_URL', 'mongodb://mongo/not-the-canonical-db'],
  ])('fails closed for invalid production %s without exposing values', (name, value) => {
    productionEnv({ [name]: value });
    expect(() => readWorldConfig('api', { test: false })).toThrow();
    try { readWorldConfig('api', { test: false }); } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });

  it('rejects boolean typos', () => {
    productionEnv({ WORLD_GAME_WRITES_ENABLED: 'enabled' });
    expect(() => readWorldConfig('api', { test: false })).toThrow(/Invalid boolean/);
  });

  it('rejects CORS origins carrying credentials', () => {
    productionEnv({ WORLD_CORS_ORIGINS: 'https://user:pass@example.com' });
    expect(() => readWorldConfig('api', { test: false })).toThrow(/invalid origin/);
  });
});
