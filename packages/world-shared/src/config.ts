import { z } from 'zod';
import { mongo } from 'mongoose';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value || value.trim().length < 1) {
    throw new Error(`Missing required World environment variable: ${name}`);
  }
  return value;
};

const readValue = (name: string, test: boolean, testDefault: string): string =>
  test ? (process.env[name] ?? testDefault) : required(name);

const optionalBoolean = (name: string, fallback = false): boolean => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (!['0', '1', 'true', 'false'].includes(value.toLowerCase())) throw new Error(`Invalid boolean ${name}`);
  return value === '1' || value.toLowerCase() === 'true';
};

const optionalNumber = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`Invalid ${name}`);
  return parsed;
};

const parseMongoUrl = (name: string, value: string): { url: string; database: string } => {
  let client: mongo.MongoClient;
  try {
    client = new mongo.MongoClient(value);
  } catch {
    throw new Error(`${name} must be a valid MongoDB URL`);
  }
  const options = client.options;
  if (!options.dbName || (!options.hosts?.length && !options.srvHost)) {
    throw new Error(`${name} must be a valid MongoDB URL`);
  }
  const database = options.dbName;
  if (!database || database.includes('/')) {
    throw new Error(`${name} must include a database name`);
  }
  return { url: value, database };
};

const parseOriginList = (value: string): string[] => {
  const origins = value.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (!origins.length) throw new Error('WORLD_CORS_ORIGINS must contain at least one origin');
  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error('WORLD_CORS_ORIGINS contains an invalid origin');
    }
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.pathname !== '/' || parsed.search || parsed.hash || parsed.username || parsed.password || origin.includes('*')) {
      throw new Error('WORLD_CORS_ORIGINS contains an invalid origin');
    }
  }
  return origins;
};

const assertDuration = (name: string, value: string): string => {
  if (!/^\d+(?:s|m|h|d)$/.test(value) || Number.parseInt(value, 10) <= 0) {
    throw new Error(`Invalid ${name}`);
  }
  return value;
};

export interface WorldConfig {
  dataMongoUrl: string;
  gameMongoUrl: string;
  sessionSecret: string;
  sessionIssuer: string;
  sessionAudience: string;
  sessionExpiresIn: string;
  corsOrigins: string[];
  gameWritesEnabled: boolean;
  registrationToken?: string;
  economyToken?: string;
  islandJoinSecret?: string;
  islandPermissionSecret?: string;
  redisUrl: string;
  redisTls: boolean;
  appEnv: 'staging' | 'production' | 'test';
  namespace: string;
  runtimeEnabled: boolean;
  sessionMaxTtlSeconds: number;
  port: number;
  address: string;
}

export function readWorldConfig(service: 'api' | 'matchmaking', options?: { test?: boolean }): WorldConfig {
  const test = options?.test ?? process.env.NODE_ENV === 'test';
  const dataMongoUrl = readValue('WORLD_DATA_MONGO_URL', test, 'mongodb://127.0.0.1:27017/cukies-world-data-test');
  const gameMongoUrl = readValue('WORLD_GAME_MONGO_URL', test, 'mongodb://127.0.0.1:27017/cukies-world-game-test');
  const dataMongo = parseMongoUrl('WORLD_DATA_MONGO_URL', dataMongoUrl);
  const gameMongo = parseMongoUrl('WORLD_GAME_MONGO_URL', gameMongoUrl);
  if (dataMongo.database === gameMongo.database) throw new Error('World Mongo databases must be separate');
  const redisUrl = readValue('WORLD_REDIS_URL', test, 'redis://127.0.0.1:6379');
  let redis: URL;
  try { redis = new URL(redisUrl); } catch { throw new Error('WORLD_REDIS_URL must be a valid Redis URL'); }
  if (!['redis:', 'rediss:'].includes(redis.protocol) || !redis.hostname) throw new Error('WORLD_REDIS_URL must be a valid Redis URL');
  if (redis.username || redis.password) throw new Error('WORLD_REDIS_URL must not include credentials');
  const appEnv = readValue('APP_ENV', test, 'test') as WorldConfig['appEnv'];
  if (!['staging', 'production', 'test'].includes(appEnv) || (!test && appEnv === 'test')) throw new Error('APP_ENV must be staging or production');
  const expectedNamespace = `cukies-world-${appEnv}`;
  const namespace = readValue('WORLD_NAMESPACE', test, expectedNamespace);
  if (!test && namespace !== expectedNamespace) throw new Error('WORLD_NAMESPACE does not match APP_ENV');
  if (!test && process.env.WORLD_RUNTIME_ENABLED !== 'true') {
    throw new Error('WORLD_RUNTIME_ENABLED must be true outside tests');
  }
  if (!test && (dataMongo.database !== `cukies-world-data-${appEnv}` || gameMongo.database !== `cukies-world-game-${appEnv}`)) {
    throw new Error('World Mongo databases do not match APP_ENV');
  }
  const sessionSecret = readValue('WORLD_SESSION_SECRET', test, 'test-world-session-secret-change-me');
  if (sessionSecret.length < 32) throw new Error('WORLD_SESSION_SECRET must contain at least 32 characters');
  const sessionIssuer = readValue('WORLD_SESSION_ISSUER', test, 'cukies-world-test');
  const sessionAudience = readValue('WORLD_SESSION_AUDIENCE', test, 'cukies-world-api-test');
  if (!sessionIssuer.trim() || !sessionAudience.trim()) throw new Error('World JWT issuer and audience are required');
  const sessionExpiresIn = assertDuration('WORLD_SESSION_EXPIRES_IN', readValue('WORLD_SESSION_EXPIRES_IN', test, '15m'));
  const cors = parseOriginList(readValue('WORLD_CORS_ORIGINS', test, 'http://localhost:3000'));
  return {
    dataMongoUrl,
    gameMongoUrl,
    sessionSecret,
    sessionIssuer,
    sessionAudience,
    sessionExpiresIn,
    corsOrigins: cors,
    gameWritesEnabled: optionalBoolean('WORLD_GAME_WRITES_ENABLED', test),
    registrationToken: process.env.WORLD_MATCHMAKING_REGISTRATION_TOKEN,
    economyToken: process.env.WORLD_ISLAND_ECONOMY_TOKEN,
    islandJoinSecret: process.env.WORLD_ISLAND_JOIN_SECRET,
    islandPermissionSecret: process.env.WORLD_ISLAND_PERMISSION_SECRET,
    redisUrl,
    redisTls: optionalBoolean('WORLD_REDIS_TLS', redis.protocol === 'rediss:'),
    appEnv,
    namespace,
    runtimeEnabled: optionalBoolean('WORLD_RUNTIME_ENABLED', test),
    sessionMaxTtlSeconds: optionalNumber('WORLD_SESSION_MAX_TTL_SECONDS', 3600),
    port: optionalNumber('WORLD_PORT', service === 'api' ? 3010 : 3011),
    address: process.env.WORLD_ADDRESS ?? '0.0.0.0',
  };
}

export const worldEnvSchema = z.object({
  WORLD_DATA_MONGO_URL: z.string().min(1),
  WORLD_GAME_MONGO_URL: z.string().min(1),
  WORLD_SESSION_SECRET: z.string().min(32),
  WORLD_SESSION_ISSUER: z.string().min(1),
  WORLD_SESSION_AUDIENCE: z.string().min(1),
  APP_ENV: z.enum(['staging', 'production', 'test']),
});

type LegacyWorldEnv = WorldConfig & {
  DATA_DB: string; GAME_DB: string; SECRET_WORD: string; CONTAINER_PORT: number;
  CONTAINER_ADDRESS: string; PERMITTED_ROLE: string; ISLAND_SERVER_ECONOMY_TOKEN?: string;
  ISLAND_JOIN_SECRET?: string; ISLAND_PERMISSION_SECRET?: string;
  MATCHMAKING_SERVER_REGISTRATION_TOKEN?: string; AGONES_API_SERVER?: string;
  REDIS_HOST: string; REDIS_PORT: number; REDIS_PASS?: string; REDIS_TLS: boolean;
  REGISTERED_ISLAND_SERVER_TTL_SECONDS?: string;
};

const toLegacy = (config: WorldConfig): LegacyWorldEnv => {
  const redis = new URL(config.redisUrl);
  return {
    ...config,
    DATA_DB: config.dataMongoUrl,
    GAME_DB: config.gameMongoUrl,
    SECRET_WORD: config.sessionSecret,
    CONTAINER_PORT: config.port,
    CONTAINER_ADDRESS: config.address,
    PERMITTED_ROLE: 'world-admin',
    ISLAND_SERVER_ECONOMY_TOKEN: config.economyToken,
    ISLAND_JOIN_SECRET: config.islandJoinSecret,
    ISLAND_PERMISSION_SECRET: config.islandPermissionSecret,
    MATCHMAKING_SERVER_REGISTRATION_TOKEN: config.registrationToken,
    AGONES_API_SERVER: process.env.WORLD_AGONES_API_SERVER ?? (process.env.NODE_ENV === 'test' ? 'http://agones.test' : undefined),
    REDIS_HOST: redis.hostname,
    REDIS_PORT: Number(redis.port || 6379),
    REDIS_PASS: redis.password || undefined,
    REDIS_TLS: config.redisTls || redis.protocol === 'rediss:',
    REGISTERED_ISLAND_SERVER_TTL_SECONDS: process.env.WORLD_REGISTERED_ISLAND_SERVER_TTL_SECONDS,
  };
};

export const gameEnv = toLegacy(readWorldConfig('api'));
export const matchmakingEnv = toLegacy(readWorldConfig('matchmaking'));
