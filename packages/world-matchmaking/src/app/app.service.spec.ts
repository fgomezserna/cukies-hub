/* eslint-disable @typescript-eslint/no-explicit-any */
import { matchmakingEnv } from '@cukies/world-shared';
import { AppService } from './app.service';
import { GameServerDto } from './dto/gameserver.dto';
import { HttpException, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as redis from 'redis';

const mockRedisClient = {
  on: jest.fn(),
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  eval: jest.fn(),
  ping: jest.fn(),
  end: jest.fn(),
};

const joinTokenSecret = matchmakingEnv.ISLAND_JOIN_SECRET || 'test-island-join-secret';
const permissionTokenSecret = matchmakingEnv.ISLAND_PERMISSION_SECRET || 'test-island-permission-secret';
const registeredJoinToken =
  '0123456789abcdef0123456789abcdef0123456789abcdef';
const ownerPermissionClaims = {
  islandRole: 'owner',
  islandPermissions: ['harvest', 'build', 'manage-access'],
  canHarvest: true,
  canBuild: true,
  canManageAccess: true,
};
const guestPermissionClaims = {
  islandRole: 'guest',
  islandPermissions: [],
  canHarvest: false,
  canBuild: false,
  canManageAccess: false,
};
const registrationToken = 'test-registration-token';

const decodeIslandPermissionToken = (token: string) => {
  const [payload, signature] = token.split('.');
  expect(payload).toBeTruthy();
  expect(signature).toBeTruthy();
  const expectedSignature = crypto
    .createHmac('sha256', permissionTokenSecret)
    .update(payload)
    .digest('base64url');
  expect(signature).toBe(expectedSignature);

  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

describe('AppService', () => {
  let service: AppService;

  const mockFetch = jest.fn();

  const gameServer = (
    fleet: string,
    overrides: Partial<GameServerDto> = {}
  ): GameServerDto => ({
    name: `${fleet}-server`,
    namespace: 'default',
    labels: {
      'agones.dev/fleet': fleet,
      'agones.dev/gameserverset': `${fleet}-set`,
    },
    addr: '127.0.0.1',
    port: 7777,
    state: 'Ready',
    node_name: 'node-a',
    players: {
      capacity: 16,
      count: 0,
    },
    ...overrides,
  });

  const mockAgonesResponse = (gameservers: GameServerDto[]) => {
    mockFetch.mockResolvedValue({
      json: jest.fn().mockResolvedValue({ gameservers }),
    });
  };

  const registeredIslandServerPayload = (overrides: Record<string, unknown> = {}) => ({
    serverId: 'registered-server-a',
    connectionUrl: '127.0.0.1:7802',
    islandId: 'island-a',
    sessionId: 'island-island-a',
    joinToken: registeredJoinToken,
    capacity: 2,
    count: 0,
    ttlSeconds: 120,
    ...overrides,
  });

  const createServiceWithIslandAccess = (options?: {
    user?: unknown;
    islandMap?: unknown;
  }) => {
    const hasIslandMap = Object.prototype.hasOwnProperty.call(
      options ?? {},
      'islandMap'
    );
    return new AppService(
      {
        findOne: jest
          .fn()
          .mockResolvedValue(
            hasIslandMap
              ? options?.islandMap
              : { _id: 'map-a', user: 'user-a' }
          ),
      } as any,
      {
        findById: jest.fn().mockResolvedValue(
          options?.user ?? {
            _id: 'user-a',
            maps: ['map-a'],
          }
        ),
      } as any
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (
      matchmakingEnv as unknown as {
        MATCHMAKING_SERVER_REGISTRATION_TOKEN: string;
        REGISTERED_ISLAND_SERVER_TTL_SECONDS: string;
      }
    ).MATCHMAKING_SERVER_REGISTRATION_TOKEN = registrationToken;
    (
      matchmakingEnv as unknown as {
        MATCHMAKING_SERVER_REGISTRATION_TOKEN: string;
        REGISTERED_ISLAND_SERVER_TTL_SECONDS: string;
      }
    ).REGISTERED_ISLAND_SERVER_TTL_SECONDS = '120';
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

    service = new AppService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  it('keeps legacy game-ip lookup compatible with plain host:port responses', async () => {
    mockAgonesResponse([gameServer('fleet-singleplayer')]);

    await expect(service.getGameIP('singleplayer')).resolves.toBe(
      '127.0.0.1:7777'
    );
  });

  it('probes Redis with a round-trip for readiness', async () => {
    mockRedisClient.ping.mockImplementation((callback: (error: null, value: string) => void) =>
      callback(null, 'PONG')
    );

    await expect(service.probeRedis()).resolves.toBe(true);
    expect(mockRedisClient.ping).toHaveBeenCalledTimes(1);
  });

  it('keeps the Redis client reconnectable after a transient outage', () => {
    const options = (redis.createClient as jest.Mock).mock.calls.at(-1)?.[0] as {
      retry_strategy?: (retry: { attempt: number }) => number | undefined;
    };

    expect(options.retry_strategy).toEqual(expect.any(Function));
    expect(options.retry_strategy?.({ attempt: 1 })).toBeGreaterThan(0);
    expect(options.retry_strategy?.({ attempt: 50 })).toBe(1000);
  });

  it('allocates and caches island sessions by islandId', async () => {
    service = createServiceWithIslandAccess();
    mockAgonesResponse([
      gameServer('fleet-singleplayer', { addr: '10.0.0.1', port: 7777 }),
      gameServer('fleet-island', { addr: '10.0.0.2', port: 7788 }),
    ]);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toEqual({
      connectionUrl: '10.0.0.2:7788',
      ip: '10.0.0.2',
      port: 7788,
      islandId: 'island-a',
      sessionId: 'island-island-a',
      joinToken: expect.any(String),
      islandPermissionToken: expect.any(String),
      ...ownerPermissionClaims,
      status: 'allocated',
      fleet: 'fleet-island',
      gameServerName: 'fleet-island-server',
    });

    mockFetch.mockClear();

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toEqual({
      connectionUrl: '10.0.0.2:7788',
      ip: '10.0.0.2',
      port: 7788,
      islandId: 'island-a',
      sessionId: 'island-island-a',
      joinToken: expect.any(String),
      islandPermissionToken: expect.any(String),
      ...ownerPermissionClaims,
      status: 'cached',
      fleet: 'fleet-island',
      gameServerName: 'fleet-island-server',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('mints island join tokens scoped to the authenticated user and session', async () => {
    service = createServiceWithIslandAccess();
    mockAgonesResponse([
      gameServer('fleet-island', { addr: '10.0.0.2', port: 7788 }),
    ]);

    const response = await service.getIslandGameIP('island-a', 'user-a');
    const decoded = jwt.verify(
      response.joinToken as string,
      joinTokenSecret
    ) as jwt.JwtPayload;

    expect(decoded).toMatchObject({
      type: 'island-join',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      userId: 'user-a',
    });

    const permissionClaims = decodeIslandPermissionToken(
      response.islandPermissionToken as string
    );
    expect(permissionClaims).toMatchObject({
      type: 'island-permissions',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      userId: 'user-a',
      ...ownerPermissionClaims,
    });
    expect(permissionClaims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('falls back to multiplayer or singleplayer fleets for island sessions', async () => {
    service = createServiceWithIslandAccess();
    mockAgonesResponse([
      gameServer('fleet-singleplayer', { addr: '10.0.0.3', port: 7799 }),
    ]);

    await expect(
      service.getIslandGameIP('island-b', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '10.0.0.3:7799',
      islandId: 'island-b',
      sessionId: 'island-island-b',
      status: 'allocated',
      fleet: 'fleet-singleplayer',
    });
  });

  it('returns an explicit unavailable island response when Agones has no capacity', async () => {
    service = createServiceWithIslandAccess();
    mockAgonesResponse([
      gameServer('fleet-island', {
        state: 'Allocated',
        players: {
          capacity: 2,
          count: 2,
        },
      }),
    ]);

    await expect(
      service.getIslandGameIP('island-c', 'user-a')
    ).resolves.toEqual({
      connectionUrl: '',
      ip: '',
      port: 0,
      islandId: 'island-c',
      sessionId: 'island-island-c',
      ...ownerPermissionClaims,
      status: 'unavailable',
      fleet: '',
      gameServerName: '',
      message: 'No available game servers',
    });
  });

  it('registers island servers without exposing their join token', async () => {
    service = createServiceWithIslandAccess();

    const response = await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload()
    );

    expect(response).toMatchObject({
      serverId: 'registered-server-a',
      connectionUrl: '127.0.0.1:7802',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      capacity: 2,
      count: 0,
      pendingJoinCount: 0,
      availableSlots: 2,
      status: 'registered',
      fleet: 'registered-island',
      registeredAt: expect.any(Number),
      expiresAt: expect.any(Number),
    });
    expect(response).not.toHaveProperty('joinToken');

    await expect(
      service.getRegisteredIslandServers(registrationToken)
    ).resolves.toEqual([response]);
  });

  it('prioritizes registered island servers before Agones and returns their join token', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload()
    );

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toEqual({
      connectionUrl: '127.0.0.1:7802',
      ip: '127.0.0.1',
      port: 7802,
      islandId: 'island-a',
      sessionId: 'island-island-a',
      joinToken: registeredJoinToken,
      islandPermissionToken: expect.any(String),
      ...ownerPermissionClaims,
      status: 'allocated',
      fleet: 'registered-island',
      gameServerName: 'registered-server-a',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('prefers the registered island server with the most available capacity', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({
        serverId: 'registered-server-fuller',
        connectionUrl: '127.0.0.1:7802',
        capacity: 4,
        count: 3,
      })
    );
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({
        serverId: 'registered-server-roomier',
        connectionUrl: '127.0.0.1:7803',
        joinToken: 'abcdef0123456789abcdef0123456789abcdef0123456789',
        capacity: 4,
        count: 1,
      })
    );

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7803',
      fleet: 'registered-island',
      gameServerName: 'registered-server-roomier',
      status: 'allocated',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('tries the next registered server after losing a reservation race', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({
        serverId: 'registered-server-a',
        connectionUrl: '127.0.0.1:7802',
        capacity: 1,
      })
    );
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({
        serverId: 'registered-server-b',
        connectionUrl: '127.0.0.1:7803',
        joinToken: 'abcdef0123456789abcdef0123456789abcdef0123456789',
        capacity: 1,
      })
    );
    const originalReserve = (service as any).reserveRegisteredIslandServerJoin.bind(
      service
    );
    const reserveSpy = jest
      .spyOn(service as any, 'reserveRegisteredIslandServerJoin')
      .mockRejectedValueOnce(
        new HttpException(
          'Registered island server capacity changed during allocation',
          HttpStatus.CONFLICT
        )
      )
      .mockImplementation(originalReserve);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7803',
      fleet: 'registered-island',
      gameServerName: 'registered-server-b',
      status: 'allocated',
    });
    expect(reserveSpy).toHaveBeenCalledTimes(2);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('keeps a pending registered join sticky for the same user', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({
        serverId: 'registered-server-a',
        connectionUrl: '127.0.0.1:7802',
        capacity: 4,
        count: 3,
      })
    );
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({
        serverId: 'registered-server-b',
        connectionUrl: '127.0.0.1:7803',
        joinToken: 'abcdef0123456789abcdef0123456789abcdef0123456789',
        capacity: 4,
        count: 0,
      })
    );

    const memorySessions = (service as any).memorySessions as Map<
      string,
      { value: string; expiresAt: number }
    >;
    const registeredSession = memorySessions.get(
      'island-server:registered-server-a'
    );
    expect(registeredSession).toBeDefined();
    if (!registeredSession) {
      return;
    }
    const registeredRecord = JSON.parse(registeredSession.value);
    registeredRecord.pendingJoins = {
      'user-a': Date.now() + 30 * 1000,
    };
    registeredSession.value = JSON.stringify(registeredRecord);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      gameServerName: 'registered-server-a',
      status: 'allocated',
    });
  });

  it('excludes a failed registered connection when retrying island matchmaking', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload()
    );

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      gameServerName: 'registered-server-a',
      status: 'allocated',
    });

    mockAgonesResponse([
      gameServer('fleet-island', { addr: '10.0.0.2', port: 7788 }),
    ]);

    await expect(
      service.getIslandGameIP('island-a', 'user-a', '127.0.0.1:7802')
    ).resolves.toMatchObject({
      connectionUrl: '10.0.0.2:7788',
      fleet: 'fleet-island',
      gameServerName: 'fleet-island-server',
      status: 'allocated',
    });
  });

  it('ignores registered island servers that are already at capacity', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({ capacity: 2, count: 2 })
    );
    mockAgonesResponse([]);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'unavailable',
      fleet: '',
      ...ownerPermissionClaims,
    });
  });

  it('counts pending registered joins against capacity before heartbeat', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({ capacity: 2, count: 0 })
    );

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      status: 'allocated',
    });
    await expect(
      service.getIslandGameIP('island-a', 'user-b')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      status: 'allocated',
    });
    await expect(
      service.getRegisteredIslandServers(registrationToken)
    ).resolves.toMatchObject([
      {
        serverId: 'registered-server-a',
        capacity: 2,
        count: 0,
        pendingJoinCount: 2,
        availableSlots: 0,
      },
    ]);

    await service.heartbeatIslandServer(registrationToken, 'registered-server-a', {
      capacity: 2,
      count: 0,
      status: 'registered',
    });

    mockAgonesResponse([]);
    await expect(
      service.getIslandGameIP('island-a', 'user-c')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'unavailable',
      fleet: '',
    });
    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      status: 'allocated',
    });

    const memorySessions = (service as any).memorySessions as Map<
      string,
      { value: string; expiresAt: number }
    >;
    const registeredSession = memorySessions.get(
      'island-server:registered-server-a'
    );
    expect(registeredSession).toBeDefined();
    if (!registeredSession) {
      return;
    }
    const registeredRecord = JSON.parse(registeredSession.value);
    registeredRecord.pendingJoins = {
      'user-a': Date.now() - 1,
      'user-b': Date.now() - 1,
    };
    registeredSession.value = JSON.stringify(registeredRecord);

    await expect(
      service.getIslandGameIP('island-a', 'user-c')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      status: 'allocated',
    });
  });

  it('does not over-allocate a registered server under concurrent joins', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({ capacity: 1, count: 0 })
    );
    mockAgonesResponse([]);

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, index) =>
        service.getIslandGameIP('island-a', `user-${index}`)
      )
    );
    const registeredAllocations = results.filter(
      (result) =>
        result.status === 'fulfilled' &&
        result.value.fleet === 'registered-island'
    );

    expect(registeredAllocations).toHaveLength(1);
    await expect(
      service.getRegisteredIslandServers(registrationToken)
    ).resolves.toMatchObject([
      {
        serverId: 'registered-server-a',
        capacity: 1,
        count: 0,
        pendingJoinCount: 1,
        availableSlots: 0,
      },
    ]);
  });

  it('uses Redis compare-and-set scripts for atomic session mutations', async () => {
    mockRedisClient.eval.mockImplementation(
      (...args: Array<unknown>) => {
        const callback = args[args.length - 1] as (
          error: Error | null,
          result?: number
        ) => void;
        callback(null, 1);
      }
    );
    (service as any).redisAvailable = true;

    await expect(
      (service as any).compareAndSetSession(
        'island-server:registered-server-a',
        'old-record',
        'new-record',
        120
      )
    ).resolves.toBe(true);
    await expect(
      (service as any).compareAndDeleteSession(
        'island-server:registered-server-a',
        'new-record'
      )
    ).resolves.toBe(true);

    expect(mockRedisClient.eval).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("redis.call('SETEX'"),
      1,
      'island-server:registered-server-a',
      'old-record',
      'new-record',
      '120',
      expect.any(Function)
    );
    expect(mockRedisClient.eval).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("redis.call('DEL'"),
      1,
      'island-server:registered-server-a',
      'new-record',
      expect.any(Function)
    );
  });

  it('fails closed when Redis EVAL fails after the store was ready', async () => {
    mockRedisClient.eval.mockImplementation(
      (...args: Array<unknown>) => {
        const callback = args[args.length - 1] as (error: Error) => void;
        callback(new Error('eval unavailable'));
      }
    );
    (service as any).redisReadyOnce = true;
    (service as any).redisAvailable = true;

    await expect(
      (service as any).compareAndSetSession(
        'island-server:registered-server-a',
        'old-record',
        'new-record',
        120
      )
    ).rejects.toMatchObject({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      message: 'Matchmaking session store unavailable',
    });
    expect((service as any).memorySessions.size).toBe(0);
  });

  it('heartbeats registered island servers without exposing their join token', async () => {
    service = createServiceWithIslandAccess();
    const registration = await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({ ttlSeconds: 30 })
    );

    const heartbeat = await service.heartbeatIslandServer(
      registrationToken,
      'registered-server-a',
      {
        capacity: 2,
        count: 1,
        status: 'registered',
        ttlSeconds: 120,
      }
    );

    expect(heartbeat).toMatchObject({
      serverId: 'registered-server-a',
      connectionUrl: '127.0.0.1:7802',
      islandId: 'island-a',
      sessionId: 'island-island-a',
      capacity: 2,
      count: 1,
      pendingJoinCount: 0,
      availableSlots: 1,
      status: 'registered',
      fleet: 'registered-island',
      registeredAt: registration.registeredAt,
      expiresAt: expect.any(Number),
    });
    expect(heartbeat.expiresAt).toBeGreaterThan(registration.expiresAt);
    expect(heartbeat).not.toHaveProperty('joinToken');

    await expect(
      service.getRegisteredIslandServers(registrationToken)
    ).resolves.toEqual([heartbeat]);

    const matchmakingResponse = await service.getIslandGameIP(
      'island-a',
      'user-a'
    );
    expect(matchmakingResponse).toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      joinToken: registeredJoinToken,
      status: 'allocated',
      fleet: 'registered-island',
    });
    expect(matchmakingResponse).not.toHaveProperty('count');
  });

  it('removes draining registered island servers from new matchmaking allocation', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload()
    );
    await service.heartbeatIslandServer(
      registrationToken,
      'registered-server-a',
      {
        count: 0,
        status: 'draining',
        ttlSeconds: 120,
      }
    );
    mockAgonesResponse([]);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'unavailable',
      fleet: '',
      ...ownerPermissionClaims,
    });
  });

  it('expires registered island servers by ttl and invalidates registered matchmaking cache', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({ ttlSeconds: 1 })
    );

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      connectionUrl: '127.0.0.1:7802',
      fleet: 'registered-island',
      status: 'allocated',
    });

    const memorySessions = (service as any).memorySessions as Map<
      string,
      { value: string; expiresAt: number }
    >;
    const registeredSession = memorySessions.get(
      'island-server:registered-server-a'
    );
    expect(registeredSession).toBeDefined();
    if (registeredSession) {
      registeredSession.expiresAt = Date.now() - 1;
    }
    mockAgonesResponse([]);

    await expect(
      service.getRegisteredIslandServers(registrationToken)
    ).resolves.toEqual([]);
    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'unavailable',
      fleet: '',
      ...ownerPermissionClaims,
    });
  });

  it('does not delete a server renewed while an expired snapshot is being cleaned', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload({ ttlSeconds: 120 })
    );

    const memorySessions = (service as any).memorySessions as Map<
      string,
      { value: string; expiresAt: number }
    >;
    const registeredSession = memorySessions.get(
      'island-server:registered-server-a'
    );
    expect(registeredSession).toBeDefined();
    if (!registeredSession) {
      return;
    }
    const expiredRecord = JSON.parse(registeredSession.value);
    expiredRecord.expiresAt = Date.now() - 1;
    registeredSession.value = JSON.stringify(expiredRecord);

    const originalCompareAndDelete = (service as any).compareAndDeleteSession.bind(
      service
    );
    const compareAndDeleteSpy = jest
      .spyOn(service as any, 'compareAndDeleteSession')
      .mockImplementationOnce(async () => {
        registeredSession.value = JSON.stringify({
          ...expiredRecord,
          expiresAt: Date.now() + 120 * 1000,
        });
        return false;
      })
      .mockImplementation(originalCompareAndDelete);

    await expect(
      service.getRegisteredIslandServers(registrationToken)
    ).resolves.toMatchObject([
      {
        serverId: 'registered-server-a',
        status: 'registered',
      },
    ]);
    expect(compareAndDeleteSpy).toHaveBeenCalledTimes(1);
    expect(
      memorySessions.has('island-server:registered-server-a')
    ).toBe(true);
  });

  it('rejects invalid registered island server heartbeats', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload()
    );

    await expect(
      service.heartbeatIslandServer(
        'wrong-token',
        'registered-server-a',
        { count: 1 }
      )
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Island server registration denied',
    });

    await expect(
      service.heartbeatIslandServer(
        registrationToken,
        'registered-server-a',
        { capacity: 2, count: 3 }
      )
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Registered server count cannot exceed capacity',
    });

    await expect(
      service.heartbeatIslandServer(
        registrationToken,
        'missing-server',
        { count: 1 }
      )
    ).rejects.toMatchObject({
      status: HttpStatus.NOT_FOUND,
      message: 'Registered island server not found',
    });
  });

  it('unregisters island servers and invalidates cached registered sessions', async () => {
    service = createServiceWithIslandAccess();
    await service.registerIslandServer(
      registrationToken,
      registeredIslandServerPayload()
    );

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      fleet: 'registered-island',
      connectionUrl: '127.0.0.1:7802',
    });

    await expect(
      service.unregisterIslandServer(registrationToken, 'registered-server-a')
    ).resolves.toEqual({
      serverId: 'registered-server-a',
      deleted: true,
    });
    mockAgonesResponse([]);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'unavailable',
      fleet: '',
    });
  });

  it('rejects island server registration without the shared registration token', async () => {
    service = createServiceWithIslandAccess();

    await expect(
      service.registerIslandServer(
        'wrong-token',
        registeredIslandServerPayload()
      )
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Island server registration denied',
    });
  });

  it('rejects registered island servers with weak join tokens', async () => {
    service = createServiceWithIslandAccess();

    await expect(
      service.registerIslandServer(
        registrationToken,
        registeredIslandServerPayload({ joinToken: 'short-token' })
      )
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'Registered joinToken is invalid',
    });
  });

  it('denies island matchmaking when the authenticated user id is missing', async () => {
    await expect(service.getIslandGameIP('island-a')).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Island access denied',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects global island aliases for matchmaking sessions', async () => {
    await expect(
      service.getIslandGameIP('current', 'user-a')
    ).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
      message: 'A stable islandId is required for matchmaking',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('verifies authenticated island access before allocating a server', async () => {
    service = createServiceWithIslandAccess();
    mockAgonesResponse([gameServer('fleet-island')]);

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'allocated',
    });
  });

  it('returns read-only guest claims for users with shared island access', async () => {
    service = createServiceWithIslandAccess({
      user: {
        _id: 'target-user',
        maps: ['map-a'],
      },
      islandMap: {
        _id: 'map-a',
        user: 'owner-user',
      },
    });
    mockAgonesResponse([gameServer('fleet-island')]);

    await expect(
      service.getIslandGameIP('island-a', 'target-user')
    ).resolves.toMatchObject({
      islandId: 'island-a',
      status: 'allocated',
      joinToken: expect.any(String),
      islandPermissionToken: expect.any(String),
      ...guestPermissionClaims,
    });
  });

  it('denies matchmaking when the authenticated user cannot access the island', async () => {
    service = createServiceWithIslandAccess({ islandMap: null });

    await expect(
      service.getIslandGameIP('island-a', 'user-a')
    ).rejects.toMatchObject({
      status: HttpStatus.FORBIDDEN,
      message: 'Island access denied',
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
