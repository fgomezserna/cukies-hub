import { matchmakingEnv } from '@cukies/world-shared';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import {
  User,
  UserDocument,
  UserMap,
  UserMapDocument,
} from '@cukies/world-shared';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import * as redis from 'redis';
import { promisify } from 'util';
import { CreateMultiplayerGameDto } from './dto/create-multiplayerGame.dto';
import { GameServerDto } from './dto/gameserver.dto';
import { IslandServerConnectionDto } from './dto/island-server-connection.dto';
import {
  HeartbeatIslandServerDto,
  RegisteredIslandServerDto,
  RegisterIslandServerDto,
  UnregisterIslandServerDto,
} from './dto/registered-island-server.dto';

type IslandActionPermissionClaims = Pick<
  IslandServerConnectionDto,
  | 'islandRole'
  | 'islandPermissions'
  | 'canHarvest'
  | 'canBuild'
  | 'canManageAccess'
>;

type IslandAccessContext = {
  claims: IslandActionPermissionClaims;
};

type IslandPermissionTokenParams = {
  islandId: string;
  sessionId: string;
  userId?: string;
  claims?: IslandActionPermissionClaims;
};

type RegisteredIslandServerRecord = RegisteredIslandServerDto & {
  joinToken: string;
  pendingJoins?: Record<string, number>;
};

@Injectable()
export class AppService implements OnModuleDestroy {
  private static readonly MULTIPLAYER_TTL_SECONDS = 60 * 60 * 24;
  private static readonly ISLAND_SESSION_PREFIX = 'island:';
  private static readonly REGISTERED_ISLAND_SERVER_PREFIX =
    'island-server:';
  private static readonly ISLAND_JOIN_TOKEN_EXPIRES_IN = '10m';
  private static readonly DEFAULT_REGISTERED_ISLAND_SERVER_TTL_SECONDS = 120;
  private static readonly REGISTERED_ISLAND_PENDING_JOIN_TTL_MS = 30 * 1000;
  private static readonly SESSION_COMPARE_AND_SET_ATTEMPTS = 5;
  private static readonly MIN_REGISTERED_JOIN_TOKEN_LENGTH = 32;
  private static readonly REGISTERED_ISLAND_SERVER_STATUSES = new Set([
    'registered',
    'draining',
  ]);
  private static readonly ISLAND_FLEET_TYPES = [
    'island',
    'multiplayer',
    'singleplayer',
  ];

  private readonly memorySessions = new Map<
    string,
    { value: string; expiresAt: number }
  >();
  private readonly redisClient: redis.RedisClient;
  private readonly getAsync: (key: string) => Promise<string | null>;
  private readonly setexAsync: (
    key: string,
    seconds: number,
    value: string
  ) => Promise<string>;
  private readonly delAsync: (key: string) => Promise<number>;
  private readonly keysAsync: (pattern: string) => Promise<string[]>;
  private readonly evalAsync: (
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ) => Promise<number>;
  private readonly pingAsync: () => Promise<string>;
  private readonly allowInMemorySessions =
    process.env.NODE_ENV === 'test';
  private redisAvailable = false;
  private redisReadyOnce = false;
  private memorySessionsActive = false;
  private redisErrorLogged = false;

  constructor(
    @Optional()
    @InjectModel(UserMap.name, 'gameDB')
    private readonly userMapModel?: Model<UserMapDocument>,
    @Optional()
    @InjectModel(User.name, 'cukiesDB')
    private readonly userModel?: Model<UserDocument>
  ) {
    // Pass the canonical URL through to node-redis so encoded credentials,
    // database selection, and rediss TLS are preserved as configured.
    this.redisClient = redis.createClient({
      url: matchmakingEnv.redisUrl,
      tls: matchmakingEnv.redisTls ? {} : undefined,
      // Keep retrying with a bounded backoff so readiness can recover after a
      // transient Redis outage. Returning undefined here permanently ends the
      // node-redis v3 client after the first disconnect.
      retry_strategy: (options) => Math.min(options.attempt * 100, 1000),
    });
    this.redisClient.on('ready', () => {
      this.redisReadyOnce = true;
      this.redisAvailable = !this.memorySessionsActive;
      this.redisErrorLogged = false;
      if (this.memorySessionsActive) {
        Logger.warn(
          'Redis matchmaking became ready after the explicit in-memory store was activated; keeping the process pinned to memory'
        );
      }
    });
    this.redisClient.on('end', () => {
      this.redisAvailable = false;
    });
    this.redisClient.on('error', (error) => {
      this.redisAvailable = false;
      if (!this.redisErrorLogged) {
        const failureMode =
          this.memorySessionsActive ||
          (this.allowInMemorySessions && !this.redisReadyOnce)
            ? 'explicit in-memory fallback is available'
            : 'session operations will fail closed';
        Logger.warn(
          `Redis matchmaking unavailable; ${failureMode}: ${error.message}`
        );
        this.redisErrorLogged = true;
      }
    });

    this.getAsync = promisify(this.redisClient.get).bind(this.redisClient) as (
      key: string
    ) => Promise<string | null>;
    this.setexAsync = promisify(this.redisClient.setex).bind(
      this.redisClient
    ) as (key: string, seconds: number, value: string) => Promise<string>;
    this.delAsync = promisify(this.redisClient.del).bind(this.redisClient) as (
      key: string
    ) => Promise<number>;
    this.keysAsync = promisify(this.redisClient.keys).bind(
      this.redisClient
    ) as (pattern: string) => Promise<string[]>;
    const redisEval = this.redisClient.eval;
    this.evalAsync =
      typeof redisEval === 'function'
        ? (promisify(redisEval).bind(this.redisClient) as (
            script: string,
            numberOfKeys: number,
            ...args: string[]
          ) => Promise<number>)
        : async () => {
            throw new Error('Redis EVAL is unavailable');
          };
    const redisPing = this.redisClient.ping;
    this.pingAsync =
      typeof redisPing === 'function'
        ? (promisify(redisPing).bind(this.redisClient) as () => Promise<string>)
        : async () => {
            throw new Error('Redis PING is unavailable');
          };
  }

  onModuleDestroy(): void {
    this.redisClient.end(true);
  }

  isReady(): boolean {
    return this.redisAvailable && !this.memorySessionsActive;
  }

  /** Performs a real Redis round-trip for the readiness endpoint. */
  async probeRedis(): Promise<boolean> {
    if (this.memorySessionsActive) return false;
    try {
      await this.pingAsync();
      return true;
    } catch (error) {
      this.markRedisOperationFailed('ping', error);
      return false;
    }
  }

  async ping(): Promise<boolean> {
    return this.probeRedis();
  }

  async getGameIP(type: string): Promise<string> {
    const output = await this.findAvailableGameServer([type]);
    if (!output) {
      return 'No available game servers';
    }
    return this.getServerConnectionUrl(output);
  }

  async getIslandGameIP(
    islandId: string,
    userId?: string,
    excludeConnectionUrl?: string
  ): Promise<IslandServerConnectionDto> {
    const normalizedIslandId = this.normalizeIslandId(islandId);
    const normalizedExcludedConnectionUrl =
      this.normalizeExcludedConnectionUrl(excludeConnectionUrl);
    const accessContext = await this.getUserIslandAccessContext(
      normalizedIslandId,
      userId
    );
    const sessionKey = this.getIslandSessionKey(normalizedIslandId);
    const registeredConnection = await this.findRegisteredIslandServerConnection(
      normalizedIslandId,
      userId,
      normalizedExcludedConnectionUrl
    );
    if (registeredConnection) {
      await this.setMultiplayerSession(
        sessionKey,
        JSON.stringify(registeredConnection)
      );
      return this.withRegisteredIslandJoinToken(
        {
          ...registeredConnection,
          status: 'allocated',
        },
        normalizedIslandId,
        userId,
        accessContext.claims
      );
    }

    const cachedSession = await this.getMultiplayerSession(sessionKey);
    const cachedConnection = this.parseIslandServerConnection(
      cachedSession,
      normalizedIslandId
    );

    if (cachedConnection) {
      if (
        cachedConnection.fleet === 'registered-island' ||
        this.isExcludedConnectionUrl(
          cachedConnection.connectionUrl,
          normalizedExcludedConnectionUrl
        )
      ) {
        await this.deleteMultiplayerSession(sessionKey);
      } else {
        return this.withIslandJoinToken(
          {
            ...cachedConnection,
            status: 'cached',
          },
          normalizedIslandId,
          userId,
          accessContext.claims
        );
      }
    }

    const output = await this.findAvailableGameServer(
      AppService.ISLAND_FLEET_TYPES,
      normalizedExcludedConnectionUrl
    );
    if (!output) {
      return {
        ...this.buildUnavailableIslandServerConnection(normalizedIslandId),
        ...accessContext.claims,
      };
    }

    const connection = this.buildIslandServerConnection(
      normalizedIslandId,
      output,
      'allocated'
    );
    await this.setMultiplayerSession(sessionKey, JSON.stringify(connection));
    return this.withIslandJoinToken(
      connection,
      normalizedIslandId,
      userId,
      accessContext.claims
    );
  }

  async registerIslandServer(
    registrationToken: string | undefined,
    registerIslandServerDto: RegisterIslandServerDto
  ): Promise<RegisteredIslandServerDto> {
    this.assertRegistrationToken(registrationToken);

    const now = Date.now();
    const ttlSeconds = this.normalizeRegisteredIslandServerTtlSeconds(
      registerIslandServerDto?.ttlSeconds
    );
    const islandId = this.normalizeIslandId(registerIslandServerDto?.islandId);
    const sessionId =
      this.normalizeSessionId(registerIslandServerDto?.sessionId) ||
      this.buildIslandSessionId(islandId);
    const { host, port } = this.parseConnectionUrl(
      registerIslandServerDto?.connectionUrl
    );
    const capacity = this.normalizeNonNegativeInteger(
      registerIslandServerDto?.capacity,
      0,
      'capacity'
    );
    const count = this.normalizeNonNegativeInteger(
      registerIslandServerDto?.count,
      0,
      'count'
    );

    if (capacity > 0 && count > capacity) {
      throw new HttpException(
        'Registered server count cannot exceed capacity',
        HttpStatus.BAD_REQUEST
      );
    }

    const serverId = this.normalizeServerId(registerIslandServerDto?.serverId);
    const joinToken = this.normalizeRegisteredJoinToken(
      registerIslandServerDto?.joinToken
    );
    const record: RegisteredIslandServerRecord = {
      serverId,
      connectionUrl: `${host}:${port}`,
      islandId,
      sessionId,
      capacity,
      count,
      status: 'registered',
      fleet: 'registered-island',
      registeredAt: now,
      expiresAt: now + ttlSeconds * 1000,
      joinToken,
    };

    await this.setSession(
      this.getRegisteredIslandServerKey(serverId),
      JSON.stringify(record),
      ttlSeconds
    );
    await this.deleteMultiplayerSession(this.getIslandSessionKey(islandId));

    return this.toRegisteredIslandServerDto(record);
  }

  async getRegisteredIslandServers(
    registrationToken: string | undefined
  ): Promise<RegisteredIslandServerDto[]> {
    this.assertRegistrationToken(registrationToken);

    const records = await this.getActiveRegisteredIslandServerRecords();
    return records.map((record) => this.toRegisteredIslandServerDto(record));
  }

  async heartbeatIslandServer(
    registrationToken: string | undefined,
    serverId: string,
    heartbeatIslandServerDto: HeartbeatIslandServerDto
  ): Promise<RegisteredIslandServerDto> {
    this.assertRegistrationToken(registrationToken);

    const normalizedServerId = this.normalizeServerId(serverId);
    const key = this.getRegisteredIslandServerKey(normalizedServerId);
    for (
      let attempt = 0;
      attempt < AppService.SESSION_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const rawRecord = await this.getSession(key);
      const existingRecord = this.parseRegisteredIslandServerRecord(rawRecord);
      if (!rawRecord || !existingRecord) {
        throw new HttpException(
          'Registered island server not found',
          HttpStatus.NOT_FOUND
        );
      }
      const { record: prunedExistingRecord } =
        this.pruneRegisteredIslandPendingJoins(existingRecord);

      const ttlSeconds = this.normalizeRegisteredIslandServerTtlSeconds(
        heartbeatIslandServerDto?.ttlSeconds
      );
      const capacity = this.normalizeNonNegativeInteger(
        heartbeatIslandServerDto?.capacity,
        prunedExistingRecord.capacity,
        'capacity'
      );
      const count = this.normalizeNonNegativeInteger(
        heartbeatIslandServerDto?.count,
        prunedExistingRecord.count,
        'count'
      );

      if (capacity > 0 && count > capacity) {
        throw new HttpException(
          'Registered server count cannot exceed capacity',
          HttpStatus.BAD_REQUEST
        );
      }

      const status = this.normalizeRegisteredIslandServerStatus(
        heartbeatIslandServerDto?.status,
        prunedExistingRecord.status
      );
      const updatedRecord: RegisteredIslandServerRecord = {
        ...prunedExistingRecord,
        capacity,
        count,
        status,
        expiresAt: Date.now() + ttlSeconds * 1000,
      };

      if (
        await this.compareAndSetSession(
          key,
          rawRecord,
          JSON.stringify(updatedRecord),
          ttlSeconds
        )
      ) {
        return this.toRegisteredIslandServerDto(updatedRecord);
      }
    }

    throw new HttpException(
      'Registered island server changed concurrently; retry heartbeat',
      HttpStatus.CONFLICT
    );
  }

  async unregisterIslandServer(
    registrationToken: string | undefined,
    serverId: string
  ): Promise<UnregisterIslandServerDto> {
    this.assertRegistrationToken(registrationToken);

    const normalizedServerId = this.normalizeServerId(serverId);
    const key = this.getRegisteredIslandServerKey(normalizedServerId);
    for (
      let attempt = 0;
      attempt < AppService.SESSION_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const rawRecord = await this.getSession(key);
      const existingRecord = this.parseRegisteredIslandServerRecord(rawRecord);
      if (!rawRecord || !existingRecord) {
        return {
          serverId: normalizedServerId,
          deleted: false,
        };
      }
      if (await this.compareAndDeleteSession(key, rawRecord)) {
        await this.deleteMultiplayerSession(
          this.getIslandSessionKey(existingRecord.islandId)
        );
        return {
          serverId: normalizedServerId,
          deleted: true,
        };
      }
    }

    throw new HttpException(
      'Registered island server changed concurrently; retry unregister',
      HttpStatus.CONFLICT
    );
  }

  async createMultiplayerGame(
    userId: string,
    createMultiplayerGameDto: CreateMultiplayerGameDto
  ): Promise<number | null> {
    // create a random number based on the id and the current time.
    // The id could be: t2h31nxb32t3h21
    // An example of one result would be: 1234567890
    // The max number would be: 10 digits
    const randomNumber = parseInt(
      userId + Date.now().toString().slice(-10),
      10
    );

    const random = Math.floor(Math.random() * randomNumber);

    await this.setMultiplayerSession(
      random.toString(),
      createMultiplayerGameDto.gameIP
    );
    return random;
  }

  async getMultiplayerGame(id: string): Promise<string | null> {
    return await this.getMultiplayerSession(id);
  }

  async deleteMultiplayerGame(id: string): Promise<string | null> {
    const deletedCount = await this.deleteMultiplayerSession(id);
    if (deletedCount > 0) {
      return 'Session successfully deleted';
    }

    return null;
  }

  private async setMultiplayerSession(
    key: string,
    value: string
  ): Promise<void> {
    await this.setSession(key, value, AppService.MULTIPLAYER_TTL_SECONDS);
  }

  private markRedisOperationFailed(operation: string, error: unknown): void {
    this.redisAvailable = false;
    Logger.warn(
      `Redis matchmaking ${operation} failed; session operations will fail closed: ${error}`
    );
  }

  private ensureInMemorySessionStore(): void {
    if (this.memorySessionsActive) {
      return;
    }
    if (this.allowInMemorySessions && !this.redisReadyOnce) {
      this.memorySessionsActive = true;
      Logger.warn(
        'Redis matchmaking is not ready; using the explicit process-local in-memory session store'
      );
      return;
    }

    throw new HttpException(
      'Matchmaking session store unavailable',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  private async setSession(
    key: string,
    value: string,
    ttlSeconds: number
  ): Promise<void> {
    if (this.redisAvailable) {
      try {
        await this.setexAsync(key, ttlSeconds, value);
        return;
      } catch (error) {
        this.markRedisOperationFailed('set', error);
      }
    }

    this.ensureInMemorySessionStore();
    this.memorySessions.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  private async getMultiplayerSession(key: string): Promise<string | null> {
    return this.getSession(key);
  }

  private async compareAndSetSession(
    key: string,
    expectedValue: string,
    nextValue: string,
    ttlSeconds: number
  ): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const result = await this.evalAsync(
          "local current=redis.call('GET',KEYS[1]); if current~=ARGV[1] then return 0 end; redis.call('SETEX',KEYS[1],tonumber(ARGV[3]),ARGV[2]); return 1",
          1,
          key,
          expectedValue,
          nextValue,
          String(ttlSeconds)
        );
        return Number(result) === 1;
      } catch (error) {
        this.markRedisOperationFailed('compare-and-set', error);
      }
    }

    this.ensureInMemorySessionStore();
    const session = this.memorySessions.get(key);
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        this.memorySessions.delete(key);
      }
      return false;
    }
    if (session.value !== expectedValue) {
      return false;
    }
    this.memorySessions.set(key, {
      value: nextValue,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  }

  private async compareAndDeleteSession(
    key: string,
    expectedValue: string
  ): Promise<boolean> {
    if (this.redisAvailable) {
      try {
        const result = await this.evalAsync(
          "local current=redis.call('GET',KEYS[1]); if current~=ARGV[1] then return 0 end; redis.call('DEL',KEYS[1]); return 1",
          1,
          key,
          expectedValue
        );
        return Number(result) === 1;
      } catch (error) {
        this.markRedisOperationFailed('compare-and-delete', error);
      }
    }

    this.ensureInMemorySessionStore();
    const session = this.memorySessions.get(key);
    if (!session || session.expiresAt < Date.now()) {
      if (session) {
        this.memorySessions.delete(key);
      }
      return false;
    }
    if (session.value !== expectedValue) {
      return false;
    }
    this.memorySessions.delete(key);
    return true;
  }

  private async getSession(key: string): Promise<string | null> {
    if (this.redisAvailable) {
      try {
        return await this.getAsync(key);
      } catch (error) {
        this.markRedisOperationFailed('get', error);
      }
    }

    this.ensureInMemorySessionStore();
    const session = this.memorySessions.get(key);
    if (!session) {
      return null;
    }
    if (session.expiresAt < Date.now()) {
      this.memorySessions.delete(key);
      return null;
    }
    return session.value;
  }

  private async deleteMultiplayerSession(key: string): Promise<number> {
    return this.deleteSession(key);
  }

  private async deleteSession(key: string): Promise<number> {
    if (this.redisAvailable) {
      try {
        return await this.delAsync(key);
      } catch (error) {
        this.markRedisOperationFailed('delete', error);
      }
    }

    this.ensureInMemorySessionStore();
    return this.memorySessions.delete(key) ? 1 : 0;
  }

  private async findAvailableGameServer(
    fleetTypes: string[],
    excludedConnectionUrl?: string
  ): Promise<GameServerDto | null> {
    if (!matchmakingEnv.AGONES_API_SERVER) {
      Logger.warn('Agones matchmaking lookup skipped: missing api server');
      return null;
    }

    let json: { gameservers?: GameServerDto[] };
    try {
      const data = await fetch(matchmakingEnv.AGONES_API_SERVER);
      json = await data.json();
    } catch (error) {
      Logger.warn(`Agones matchmaking lookup failed: ${error}`);
      return null;
    }

    const results = Array.isArray(json.gameservers)
      ? (json.gameservers as GameServerDto[])
      : [];
    const fleetNames = fleetTypes.map((type) => `fleet-${type}`);

    for (const fleetName of fleetNames) {
      const output = results.find(
        (server: GameServerDto) =>
          server.labels?.['agones.dev/fleet'] === fleetName &&
          !this.isExcludedConnectionUrl(
            this.getServerConnectionUrl(server),
            excludedConnectionUrl
          ) &&
          this.isGameServerAvailable(server)
      );

      if (output) {
        return output;
      }
    }

    return null;
  }

  private async findRegisteredIslandServerConnection(
    islandId: string,
    userId?: string,
    excludedConnectionUrl?: string
  ): Promise<IslandServerConnectionDto | null> {
    const candidates = (await this.getActiveRegisteredIslandServerRecords())
      .filter(
        (candidate) =>
          candidate.islandId === islandId &&
          !this.isExcludedConnectionUrl(
            candidate.connectionUrl,
            excludedConnectionUrl
          ) &&
          this.isRegisteredIslandServerAvailable(candidate, userId)
      )
      .sort((a, b) =>
        this.compareRegisteredIslandServerCandidates(a, b, userId)
      );
    for (const record of candidates) {
      let reservedRecord: RegisteredIslandServerRecord;
      try {
        reservedRecord = await this.reserveRegisteredIslandServerJoin(
          record,
          userId
        );
      } catch (error) {
        if (
          error instanceof HttpException &&
          error.getStatus() === HttpStatus.CONFLICT
        ) {
          continue;
        }
        throw error;
      }

      return {
        connectionUrl: reservedRecord.connectionUrl,
        ip: reservedRecord.connectionUrl.slice(
          0,
          reservedRecord.connectionUrl.lastIndexOf(':')
        ),
        port: Number(
          reservedRecord.connectionUrl.slice(
            reservedRecord.connectionUrl.lastIndexOf(':') + 1
          )
        ),
        islandId: reservedRecord.islandId,
        sessionId: reservedRecord.sessionId,
        joinToken: reservedRecord.joinToken,
        status: 'allocated',
        fleet: reservedRecord.fleet,
        gameServerName: reservedRecord.serverId,
      };
    }

    return null;
  }

  private isRegisteredIslandServerAvailable(
    record: RegisteredIslandServerRecord,
    userId?: string
  ): boolean {
    const now = Date.now();
    if (record.expiresAt <= now) {
      return false;
    }
    if (record.status !== 'registered') {
      return false;
    }
    if (record.capacity <= 0) {
      return true;
    }

    const normalizedUserId = (userId || '').trim();
    const pendingJoins = record.pendingJoins ?? {};
    if (
      normalizedUserId &&
      typeof pendingJoins[normalizedUserId] === 'number' &&
      pendingJoins[normalizedUserId] > now
    ) {
      return true;
    }

    const pendingJoinCount = Object.entries(pendingJoins).filter(
      ([pendingUserId, expiresAt]) =>
        pendingUserId !== normalizedUserId &&
        typeof expiresAt === 'number' &&
        expiresAt > now
    ).length;
    return record.count + pendingJoinCount < record.capacity;
  }

  private compareRegisteredIslandServerCandidates(
    a: RegisteredIslandServerRecord,
    b: RegisteredIslandServerRecord,
    userId?: string
  ): number {
    const aHasPendingJoin = this.hasActiveRegisteredIslandPendingJoin(
      a,
      userId
    );
    const bHasPendingJoin = this.hasActiveRegisteredIslandPendingJoin(
      b,
      userId
    );
    if (aHasPendingJoin !== bHasPendingJoin) {
      return aHasPendingJoin ? -1 : 1;
    }

    const aAvailableSlots = this.getRegisteredIslandServerAvailableSlots(
      a,
      userId
    );
    const bAvailableSlots = this.getRegisteredIslandServerAvailableSlots(
      b,
      userId
    );
    if (aAvailableSlots !== bAvailableSlots) {
      return bAvailableSlots - aAvailableSlots;
    }

    return a.registeredAt - b.registeredAt;
  }

  private hasActiveRegisteredIslandPendingJoin(
    record: RegisteredIslandServerRecord,
    userId?: string
  ): boolean {
    const normalizedUserId = (userId || '').trim();
    if (!normalizedUserId) {
      return false;
    }

    const expiresAt = record.pendingJoins?.[normalizedUserId];
    return typeof expiresAt === 'number' && expiresAt > Date.now();
  }

  private getRegisteredIslandServerAvailableSlots(
    record: RegisteredIslandServerRecord,
    userId?: string
  ): number {
    if (record.capacity <= 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    const normalizedUserId = (userId || '').trim();
    const now = Date.now();
    const pendingJoinCount = Object.entries(record.pendingJoins ?? {}).filter(
      ([pendingUserId, expiresAt]) =>
        pendingUserId !== normalizedUserId &&
        typeof expiresAt === 'number' &&
        expiresAt > now
    ).length;
    return Math.max(0, record.capacity - record.count - pendingJoinCount);
  }

  private getRegisteredIslandServerPendingJoinCount(
    record: RegisteredIslandServerRecord
  ): number {
    const now = Date.now();
    return Object.values(record.pendingJoins ?? {}).filter(
      (expiresAt) => typeof expiresAt === 'number' && expiresAt > now
    ).length;
  }

  private async reserveRegisteredIslandServerJoin(
    record: RegisteredIslandServerRecord,
    userId?: string
  ): Promise<RegisteredIslandServerRecord> {
    const normalizedUserId = (userId || '').trim();
    if (!normalizedUserId) {
      return record;
    }

    const key = this.getRegisteredIslandServerKey(record.serverId);
    for (
      let attempt = 0;
      attempt < AppService.SESSION_COMPARE_AND_SET_ATTEMPTS;
      attempt += 1
    ) {
      const rawRecord = await this.getSession(key);
      const currentRecord = this.parseRegisteredIslandServerRecord(rawRecord);
      if (!rawRecord || !currentRecord) {
        throw new HttpException(
          'Registered island server disappeared during allocation',
          HttpStatus.CONFLICT
        );
      }

      const now = Date.now();
      const { record: prunedRecord } =
        this.pruneRegisteredIslandPendingJoins(currentRecord, now);
      if (!this.isRegisteredIslandServerAvailable(prunedRecord, normalizedUserId)) {
        throw new HttpException(
          'Registered island server capacity changed during allocation',
          HttpStatus.CONFLICT
        );
      }
      const updatedRecord: RegisteredIslandServerRecord = {
        ...prunedRecord,
        pendingJoins: {
          ...(prunedRecord.pendingJoins ?? {}),
          [normalizedUserId]:
            now + AppService.REGISTERED_ISLAND_PENDING_JOIN_TTL_MS,
        },
      };
      const ttlSeconds =
        this.getRegisteredIslandServerRemainingTtlSeconds(updatedRecord, now);
      if (
        await this.compareAndSetSession(
          key,
          rawRecord,
          JSON.stringify(updatedRecord),
          ttlSeconds
        )
      ) {
        return updatedRecord;
      }
    }

    throw new HttpException(
      'Registered island server changed concurrently; retry allocation',
      HttpStatus.CONFLICT
    );
  }

  private async getActiveRegisteredIslandServerRecords(): Promise<
    RegisteredIslandServerRecord[]
  > {
    const activeRecords: RegisteredIslandServerRecord[] = [];
    const keys = await this.getRegisteredIslandServerKeys();

    for (const key of keys) {
      for (
        let attempt = 0;
        attempt < AppService.SESSION_COMPARE_AND_SET_ATTEMPTS;
        attempt += 1
      ) {
        const rawRecord = await this.getSession(key);
        const record = this.parseRegisteredIslandServerRecord(rawRecord);
        if (!rawRecord || !record) {
          break;
        }
        if (record.expiresAt <= Date.now()) {
          if (await this.compareAndDeleteSession(key, rawRecord)) {
            await this.deleteMultiplayerSession(
              this.getIslandSessionKey(record.islandId)
            );
            break;
          }
          continue;
        }

        const { record: prunedRecord } =
          this.pruneRegisteredIslandPendingJoins(record);
        activeRecords.push(prunedRecord);
        break;
      }
    }

    return activeRecords.sort((a, b) => a.registeredAt - b.registeredAt);
  }

  private pruneRegisteredIslandPendingJoins(
    record: RegisteredIslandServerRecord,
    now = Date.now()
  ): { record: RegisteredIslandServerRecord; changed: boolean } {
    const rawPendingJoins = record.pendingJoins;
    if (!rawPendingJoins || typeof rawPendingJoins !== 'object') {
      return {
        record:
          rawPendingJoins === undefined
            ? record
            : { ...record, pendingJoins: undefined },
        changed: rawPendingJoins !== undefined,
      };
    }

    const pendingJoins: Record<string, number> = {};
    let changed = false;
    for (const [rawUserId, rawExpiresAt] of Object.entries(rawPendingJoins)) {
      const userId = rawUserId.trim();
      const expiresAt = Number(rawExpiresAt);
      if (userId && Number.isFinite(expiresAt) && expiresAt > now) {
        pendingJoins[userId] = expiresAt;
      } else {
        changed = true;
      }
    }

    if (Object.keys(pendingJoins).length === 0) {
      return {
        record: { ...record, pendingJoins: undefined },
        changed: changed || Object.keys(rawPendingJoins).length > 0,
      };
    }

    return {
      record: { ...record, pendingJoins },
      changed:
        changed ||
        Object.keys(pendingJoins).length !== Object.keys(rawPendingJoins).length,
    };
  }

  private getRegisteredIslandServerRemainingTtlSeconds(
    record: RegisteredIslandServerRecord,
    now = Date.now()
  ): number {
    return Math.max(1, Math.ceil((record.expiresAt - now) / 1000));
  }

  private async getRegisteredIslandServerKeys(): Promise<string[]> {
    const pattern = `${AppService.REGISTERED_ISLAND_SERVER_PREFIX}*`;

    if (this.redisAvailable) {
      try {
        return await this.keysAsync(pattern);
      } catch (error) {
        this.markRedisOperationFailed('keys', error);
      }
    }

    this.ensureInMemorySessionStore();
    return Array.from(this.memorySessions.keys()).filter((key) =>
      key.startsWith(AppService.REGISTERED_ISLAND_SERVER_PREFIX)
    );
  }

  private isGameServerAvailable(server: GameServerDto): boolean {
    const playerCount = server.players?.count || 0;
    const playerCapacity = server.players?.capacity || 0;

    return (
      server.state === 'Ready' ||
      playerCapacity === 0 ||
      playerCount < playerCapacity
    );
  }

  private getServerConnectionUrl(server: GameServerDto): string {
    return `${server.addr}:${server.port}`;
  }

  private normalizeExcludedConnectionUrl(connectionUrl?: string): string {
    return (connectionUrl || '').trim();
  }

  private isExcludedConnectionUrl(
    connectionUrl: string | undefined,
    excludedConnectionUrl?: string
  ): boolean {
    const normalizedConnectionUrl = this.normalizeExcludedConnectionUrl(
      connectionUrl
    );
    const normalizedExcludedConnectionUrl =
      this.normalizeExcludedConnectionUrl(excludedConnectionUrl);
    return (
      normalizedConnectionUrl.length > 0 &&
      normalizedExcludedConnectionUrl.length > 0 &&
      normalizedConnectionUrl === normalizedExcludedConnectionUrl
    );
  }

  private buildIslandServerConnection(
    islandId: string,
    server: GameServerDto,
    status: string
  ): IslandServerConnectionDto {
    return {
      connectionUrl: this.getServerConnectionUrl(server),
      ip: server.addr,
      port: server.port,
      islandId,
      sessionId: this.buildIslandSessionId(islandId),
      status,
      fleet: server.labels?.['agones.dev/fleet'] || '',
      gameServerName: server.name || '',
    };
  }

  private buildUnavailableIslandServerConnection(
    islandId: string
  ): IslandServerConnectionDto {
    return {
      connectionUrl: '',
      ip: '',
      port: 0,
      islandId,
      sessionId: this.buildIslandSessionId(islandId),
      status: 'unavailable',
      fleet: '',
      gameServerName: '',
      message: 'No available game servers',
    };
  }

  private parseIslandServerConnection(
    session: string | null,
    islandId: string
  ): IslandServerConnectionDto | null {
    if (!session) {
      return null;
    }

    try {
      const parsed = JSON.parse(session) as IslandServerConnectionDto;
      if (parsed.connectionUrl || (parsed.ip && parsed.port)) {
        return {
          ...parsed,
          islandId: parsed.islandId || islandId,
          sessionId: parsed.sessionId || this.buildIslandSessionId(islandId),
        };
      }
    } catch (error) {
      Logger.warn(
        `Invalid island matchmaking session, parsing as URL: ${error}`
      );
    }

    const separatorIndex = session.lastIndexOf(':');
    if (separatorIndex <= 0 || separatorIndex >= session.length - 1) {
      return null;
    }

    const ip = session.slice(0, separatorIndex);
    const port = Number(session.slice(separatorIndex + 1));
    if (!Number.isFinite(port)) {
      return null;
    }

    return {
      connectionUrl: session,
      ip,
      port,
      islandId,
      sessionId: this.buildIslandSessionId(islandId),
      status: 'cached',
      fleet: '',
      gameServerName: '',
    };
  }

  private normalizeIslandId(islandId: string): string {
    const normalizedIslandId = (islandId || '').trim();
    if (
      !normalizedIslandId ||
      ['current', 'default', 'me'].includes(normalizedIslandId.toLowerCase())
    ) {
      throw new HttpException(
        'A stable islandId is required for matchmaking',
        HttpStatus.BAD_REQUEST
      );
    }
    return normalizedIslandId;
  }

  private normalizeSessionId(sessionId?: string): string {
    const normalizedSessionId = (sessionId || '').trim();
    if (!normalizedSessionId) {
      return '';
    }
    if (
      normalizedSessionId.includes('/') ||
      normalizedSessionId.includes('?') ||
      /\s/.test(normalizedSessionId)
    ) {
      throw new HttpException(
        'Registered sessionId is invalid',
        HttpStatus.BAD_REQUEST
      );
    }
    return normalizedSessionId;
  }

  private normalizeServerId(serverId?: string): string {
    const normalizedServerId = (serverId || '').trim();
    if (
      !normalizedServerId ||
      normalizedServerId.includes('/') ||
      normalizedServerId.includes('"')
    ) {
      throw new HttpException(
        'Registered serverId is invalid',
        HttpStatus.BAD_REQUEST
      );
    }
    return normalizedServerId;
  }

  private normalizeRegisteredJoinToken(joinToken?: string): string {
    const normalizedJoinToken = (joinToken || '').trim();
    if (
      !normalizedJoinToken ||
      normalizedJoinToken.length <
        AppService.MIN_REGISTERED_JOIN_TOKEN_LENGTH ||
      normalizedJoinToken.includes('/') ||
      normalizedJoinToken.includes('?') ||
      normalizedJoinToken.includes('"') ||
      /\s/.test(normalizedJoinToken)
    ) {
      throw new HttpException(
        'Registered joinToken is invalid',
        HttpStatus.BAD_REQUEST
      );
    }
    return normalizedJoinToken;
  }

  private normalizeNonNegativeInteger(
    value: unknown,
    defaultValue: number,
    fieldName: string
  ): number {
    const normalizedValue = value === undefined ? defaultValue : Number(value);
    if (!Number.isInteger(normalizedValue) || normalizedValue < 0) {
      throw new HttpException(
        `Registered server ${fieldName} is invalid`,
        HttpStatus.BAD_REQUEST
      );
    }
    return normalizedValue;
  }

  private normalizeRegisteredIslandServerTtlSeconds(value: unknown): number {
    const envTtl = Number(matchmakingEnv.REGISTERED_ISLAND_SERVER_TTL_SECONDS);
    const defaultValue =
      Number.isInteger(envTtl) && envTtl > 0
        ? envTtl
        : AppService.DEFAULT_REGISTERED_ISLAND_SERVER_TTL_SECONDS;
    const ttlSeconds = value === undefined ? defaultValue : Number(value);
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) {
      throw new HttpException(
        'Registered server ttlSeconds is invalid',
        HttpStatus.BAD_REQUEST
      );
    }
    return ttlSeconds;
  }

  private normalizeRegisteredIslandServerStatus(
    value: unknown,
    defaultValue: string
  ): string {
    const normalizedStatus = String(value ?? defaultValue ?? '').trim();
    if (
      !AppService.REGISTERED_ISLAND_SERVER_STATUSES.has(normalizedStatus)
    ) {
      throw new HttpException(
        'Registered server status is invalid',
        HttpStatus.BAD_REQUEST
      );
    }
    return normalizedStatus;
  }

  private parseConnectionUrl(connectionUrl?: string): {
    host: string;
    port: number;
  } {
    const normalizedConnectionUrl = (connectionUrl || '').trim();
    const separatorIndex = normalizedConnectionUrl.lastIndexOf(':');
    if (
      separatorIndex <= 0 ||
      separatorIndex >= normalizedConnectionUrl.length - 1 ||
      normalizedConnectionUrl.includes('/') ||
      normalizedConnectionUrl.includes('?')
    ) {
      throw new HttpException(
        'Registered connectionUrl is invalid',
        HttpStatus.BAD_REQUEST
      );
    }

    const host = normalizedConnectionUrl.slice(0, separatorIndex);
    const port = Number(normalizedConnectionUrl.slice(separatorIndex + 1));
    if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new HttpException(
        'Registered connectionUrl is invalid',
        HttpStatus.BAD_REQUEST
      );
    }

    return { host, port };
  }

  private async getUserIslandAccessContext(
    islandId: string,
    userId?: string
  ): Promise<IslandAccessContext> {
    if (!userId) {
      throw new HttpException('Island access denied', HttpStatus.FORBIDDEN);
    }

    if (!this.userModel || !this.userMapModel) {
      throw new HttpException(
        'Island access cannot be verified',
        HttpStatus.FORBIDDEN
      );
    }

    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new HttpException('Island access denied', HttpStatus.FORBIDDEN);
    }

    const allowedMapIds = (user.maps ?? []).map((mapId) => String(mapId));
    const islandLookup = Types.ObjectId.isValid(islandId)
      ? { $or: [{ _id: islandId }, { islandId }] }
      : { islandId };
    const islandMap = await this.userMapModel.findOne({
      $and: [
        islandLookup,
        { $or: [{ user: userId }, { _id: { $in: allowedMapIds } }] },
      ],
    });

    if (!islandMap) {
      throw new HttpException('Island access denied', HttpStatus.FORBIDDEN);
    }

    const ownerUserId = this.stringifyMongoId(
      (islandMap as { user?: unknown }).user
    );
    return {
      claims: this.buildIslandActionPermissionClaims(ownerUserId === userId),
    };
  }

  private stringifyMongoId(value: unknown): string {
    if (value && typeof value === 'object' && '_id' in value) {
      return String((value as { _id?: unknown })._id ?? '');
    }

    return String(value ?? '');
  }

  private buildIslandActionPermissionClaims(
    isOwner: boolean
  ): IslandActionPermissionClaims {
    if (isOwner) {
      return {
        islandRole: 'owner',
        islandPermissions: ['harvest', 'build', 'manage-access'],
        canHarvest: true,
        canBuild: true,
        canManageAccess: true,
      };
    }

    return {
      islandRole: 'guest',
      islandPermissions: [],
      canHarvest: false,
      canBuild: false,
      canManageAccess: false,
    };
  }

  private getIslandSessionKey(islandId: string): string {
    return `${AppService.ISLAND_SESSION_PREFIX}${islandId}`;
  }

  private buildIslandSessionId(islandId: string): string {
    const normalizedIslandId = this.normalizeIslandId(islandId);
    const safeIslandId = normalizedIslandId
      .replace(/[^a-zA-Z0-9_.-]+/g, '-')
      .slice(0, 80);

    return `island-${safeIslandId || 'default'}`;
  }

  private getRegisteredIslandServerKey(serverId: string): string {
    return `${AppService.REGISTERED_ISLAND_SERVER_PREFIX}${serverId}`;
  }

  private parseRegisteredIslandServerRecord(
    value: string | null
  ): RegisteredIslandServerRecord | null {
    if (!value) {
      return null;
    }

    try {
      const parsed = JSON.parse(value) as RegisteredIslandServerRecord;
      if (
        parsed.serverId &&
        parsed.connectionUrl &&
        parsed.islandId &&
        parsed.sessionId &&
        parsed.joinToken
      ) {
        return parsed;
      }
    } catch (error) {
      Logger.warn(`Invalid registered island server record: ${error}`);
    }

    return null;
  }

  private toRegisteredIslandServerDto(
    record: RegisteredIslandServerRecord
  ): RegisteredIslandServerDto {
    const pendingJoinCount =
      this.getRegisteredIslandServerPendingJoinCount(record);
    const availableSlots =
      record.capacity > 0
        ? Math.max(0, record.capacity - record.count - pendingJoinCount)
        : null;

    return {
      serverId: record.serverId,
      connectionUrl: record.connectionUrl,
      islandId: record.islandId,
      sessionId: record.sessionId,
      capacity: record.capacity,
      count: record.count,
      pendingJoinCount,
      availableSlots,
      status: record.status,
      fleet: record.fleet,
      registeredAt: record.registeredAt,
      expiresAt: record.expiresAt,
    };
  }

  private withIslandJoinToken(
    connection: IslandServerConnectionDto,
    islandId: string,
    userId?: string,
    claims?: IslandActionPermissionClaims
  ): IslandServerConnectionDto {
    return {
      ...connection,
      ...claims,
      joinToken: this.createIslandJoinToken({
        islandId,
        sessionId: connection.sessionId || this.buildIslandSessionId(islandId),
        userId,
      }),
      islandPermissionToken: this.createIslandPermissionToken({
        islandId,
        sessionId: connection.sessionId || this.buildIslandSessionId(islandId),
        userId,
        claims,
      }),
    };
  }

  private withRegisteredIslandJoinToken(
    connection: IslandServerConnectionDto,
    islandId: string,
    userId?: string,
    claims?: IslandActionPermissionClaims
  ): IslandServerConnectionDto {
    return {
      ...connection,
      ...claims,
      joinToken: connection.joinToken || '',
      islandPermissionToken: this.createIslandPermissionToken({
        islandId,
        sessionId: connection.sessionId || this.buildIslandSessionId(islandId),
        userId,
        claims,
      }),
    };
  }

  private assertRegistrationToken(registrationToken?: string): void {
    const expectedToken = matchmakingEnv.MATCHMAKING_SERVER_REGISTRATION_TOKEN;
    if (!expectedToken || registrationToken !== expectedToken) {
      throw new HttpException(
        'Island server registration denied',
        HttpStatus.FORBIDDEN
      );
    }
  }

  private createIslandJoinToken(params: {
    islandId: string;
    sessionId: string;
    userId?: string;
  }): string {
    const { islandId, sessionId, userId } = params;
    if (!userId) {
      throw new HttpException('Island access denied', HttpStatus.FORBIDDEN);
    }

    const secret = this.getIslandJoinTokenSecret();
    return jwt.sign(
      {
        type: 'island-join',
        islandId,
        sessionId,
        userId,
        env: matchmakingEnv.appEnv,
        namespace: matchmakingEnv.namespace,
      },
      secret,
      {
        algorithm: 'HS256',
        issuer: matchmakingEnv.sessionIssuer,
        audience: matchmakingEnv.sessionAudience,
        expiresIn: AppService.ISLAND_JOIN_TOKEN_EXPIRES_IN,
      }
    );
  }

  private createIslandPermissionToken(
    params: IslandPermissionTokenParams
  ): string {
    const { islandId, sessionId, userId, claims } = params;
    if (!userId) {
      throw new HttpException('Island access denied', HttpStatus.FORBIDDEN);
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 10 * 60;
    const payload = {
      type: 'island-permissions',
      env: matchmakingEnv.appEnv,
      namespace: matchmakingEnv.namespace,
      islandId,
      sessionId,
      userId,
      islandRole: claims?.islandRole ?? 'guest',
      islandPermissions: claims?.islandPermissions ?? [],
      canHarvest: claims?.canHarvest ?? false,
      canBuild: claims?.canBuild ?? false,
      canManageAccess: claims?.canManageAccess ?? false,
      exp: expiresAt,
    };
    const encodedPayload = this.base64UrlEncode(
      Buffer.from(JSON.stringify(payload), 'utf8')
    );
    const signature = crypto
      .createHmac('sha256', this.getIslandPermissionTokenSecret())
      .update(encodedPayload)
      .digest();

    return `${encodedPayload}.${this.base64UrlEncode(signature)}`;
  }

  private base64UrlEncode(value: Buffer): string {
    return value
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private getIslandPermissionTokenSecret(): string {
    const secret = matchmakingEnv.ISLAND_PERMISSION_SECRET;
    if (secret) {
      return secret;
    }
    if (process.env.NODE_ENV === 'test') {
      return 'test-island-permission-secret';
    }

    throw new HttpException(
      'Island permission token secret is not configured',
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  private getIslandJoinTokenSecret(): string {
    const secret = matchmakingEnv.ISLAND_JOIN_SECRET;
    if (secret) {
      return secret;
    }
    if (process.env.NODE_ENV === 'test') {
      return 'test-island-join-secret';
    }
    throw new HttpException(
      'Island join token is not configured',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }
}
