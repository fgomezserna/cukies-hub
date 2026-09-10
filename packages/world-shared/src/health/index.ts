import { InjectConnection } from '@nestjs/mongoose';
import { Controller, Get, Inject, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Connection } from 'mongoose';

export const WORLD_REDIS_READINESS = 'WORLD_REDIS_READINESS';
const DEPENDENCY_TIMEOUT_MS = 1500;

type RedisReadiness = { ping(): Promise<void> };

async function withTimeout<T>(operation: Promise<T>, timeoutMs = DEPENDENCY_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('dependency timeout')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pingMongo(connection: Connection): Promise<void> {
  if (!connection.db) throw new Error('MongoDB database is unavailable');
  await withTimeout(connection.db.command({ ping: 1 }));
}

async function pingRedis(redis: RedisReadiness): Promise<void> {
  await withTimeout(Promise.resolve().then(() => redis.ping()));
}

@Controller('health')
export class WorldHealthController {
  constructor(
    @InjectConnection('cukiesDB') private readonly data: Connection,
    @InjectConnection('gameDB') private readonly game: Connection,
    @Optional() @Inject(WORLD_REDIS_READINESS) private readonly redis?: RedisReadiness,
  ) {}
  @Get()
  health() { return { status: 'ok' }; }

  @Get('ready')
  async ready() {
    const [dataMongo, gameMongo, redis] = await Promise.all([
      pingMongo(this.data).then(() => true, () => false),
      pingMongo(this.game).then(() => true, () => false),
      this.redis ? pingRedis(this.redis).then(() => true, () => false) : Promise.resolve(true),
    ]);
    if (!dataMongo || !gameMongo || !redis) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        mongo: dataMongo && gameMongo,
        redis,
      });
    }
    return { status: 'ready', mongo: true, redis: true };
  }
}

export const worldShutdown = async (connections: Connection[]): Promise<void> => {
  await Promise.all(connections.map((connection) => connection.close(false).catch(() => undefined)));
};
