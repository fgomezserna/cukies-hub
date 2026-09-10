import { ServiceUnavailableException } from '@nestjs/common';
import { WorldHealthController } from './health';

const connection = (result: Promise<unknown>) => ({ db: { command: jest.fn(() => result) } }) as any;

describe('World readiness', () => {
  it('pings both Mongo databases and Redis', async () => {
    const redis = { ping: jest.fn(async () => undefined) };
    const controller = new WorldHealthController(
      connection(Promise.resolve({ ok: 1 })),
      connection(Promise.resolve({ ok: 1 })),
      redis,
    );
    await expect(controller.ready()).resolves.toEqual({ status: 'ready', mongo: true, redis: true });
    expect(redis.ping).toHaveBeenCalledTimes(1);
  });

  it('returns 503 when a required dependency cannot be pinged', async () => {
    const controller = new WorldHealthController(
      connection(Promise.reject(new Error('mongo down'))),
      connection(Promise.resolve({ ok: 1 })),
      { ping: jest.fn(async () => undefined) },
    );
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
