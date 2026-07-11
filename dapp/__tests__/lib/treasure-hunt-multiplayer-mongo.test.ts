import type { Document, WithId } from 'mongodb';

import {
  ActiveUserMatchConflictError,
  GameSessionMatchConflictError,
  MatchAlreadyExistsError,
  MatchNotFoundError,
  MatchRevisionConflictError,
  createMatchRules,
  createWaitingMatch,
  type Match,
} from '@/lib/treasure-hunt-multiplayer';
import {
  MongoMatchRepository,
  MultiplayerMongoConfigurationError,
  createHubCollectionProvider,
  type MatchMongoCollection,
  type MatchMongoCursor,
  type MatchMongoIndexOptions,
} from '@/lib/treasure-hunt-multiplayer/mongo-repository';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function duplicateKeyError(keyPattern?: Document) {
  return Object.assign(new Error('E11000 duplicate key'), { code: 11000, keyPattern });
}

function activeUserIds(document: Document): string[] {
  return Array.isArray(document.activeUserIds)
    ? document.activeUserIds.map((userId) => String(userId))
    : [];
}

class FakeMatchMongoCollection implements MatchMongoCollection {
  private readonly documents = new Map<string, WithId<Document>>();
  private nextId = 1;

  readonly createIndex = jest.fn(
    async (spec: Document, options?: MatchMongoIndexOptions): Promise<string> => {
      const field = Object.keys(spec)[0];
      if (options?.unique && field === 'activeUserIds') {
        const seen = new Set<string>();
        for (const document of this.documents.values()) {
          for (const userId of activeUserIds(document)) {
            if (seen.has(userId)) throw duplicateKeyError({ activeUserIds: 1 });
            seen.add(userId);
          }
        }
      }
      if (options?.unique && field === 'players.gameSessionId') {
        const seen = new Set<string>();
        for (const document of this.documents.values()) {
          for (const player of document.players as Document[]) {
            const gameSessionId = String(player.gameSessionId);
            if (seen.has(gameSessionId)) {
              throw duplicateKeyError({ 'players.gameSessionId': 1 });
            }
            seen.add(gameSessionId);
          }
        }
      }
      return `${field}_1`;
    },
  );

  readonly insertOne = jest.fn(async (document: Document): Promise<unknown> => {
    const matchId = String(document.matchId);
    const roomCode = String(document.roomCode);
    if (
      this.documents.has(matchId) ||
      [...this.documents.values()].some((candidate) => candidate.roomCode === roomCode)
    ) {
      throw duplicateKeyError();
    }
    if (
      activeUserIds(document).some((userId) =>
        [...this.documents.values()].some((candidate) =>
          activeUserIds(candidate).includes(userId),
        ),
      )
    ) {
      throw duplicateKeyError({ activeUserIds: 1 });
    }
    const incomingGameSessions = (document.players as Document[]).map((player) =>
      String(player.gameSessionId),
    );
    if (
      [...this.documents.values()].some((candidate) =>
        (candidate.players as Document[]).some((player) =>
          incomingGameSessions.includes(String(player.gameSessionId)),
        ),
      )
    ) {
      throw duplicateKeyError({ 'players.gameSessionId': 1 });
    }

    const stored = {
      ...clone(document),
      _id: `fake-${this.nextId++}`,
    } as unknown as WithId<Document>;
    this.documents.set(matchId, stored);
    return { acknowledged: true, insertedId: stored._id };
  });

  readonly updateMany = jest.fn(
    async (
      filter: Document,
      update: Document | readonly Document[],
    ): Promise<{ matchedCount: number; modifiedCount: number }> => {
      let matchedCount = 0;
      for (const [matchId, document] of this.documents) {
        if (
          (filter.activeUserIds as { $exists?: boolean } | undefined)?.$exists === false &&
          Object.prototype.hasOwnProperty.call(document, 'activeUserIds')
        ) continue;
        const statusFilter = filter.status as { $in?: string[]; $nin?: string[] } | undefined;
        if (statusFilter?.$in && !statusFilter.$in.includes(String(document.status))) continue;
        if (statusFilter?.$nin?.includes(String(document.status))) continue;

        matchedCount += 1;
        const set = Array.isArray(update)
          ? (update[0]?.$set as Document)
          : ((update as Document).$set as Document);
        const nextActiveUserIds =
          set.activeUserIds === '$players.userId'
            ? (document.players as Document[]).map((player) => String(player.userId))
            : clone(set.activeUserIds);
        this.documents.set(matchId, {
          ...document,
          activeUserIds: nextActiveUserIds,
        } as WithId<Document>);
      }
      return { matchedCount, modifiedCount: matchedCount };
    },
  );

  readonly findOne = jest.fn(
    async (
      filter: Document,
      options?: { readonly projection?: Document; readonly sort?: Document },
    ): Promise<WithId<Document> | null> => {
      const candidates = [...this.documents.values()].filter((document) => {
        if (filter.matchId !== undefined && document.matchId !== filter.matchId) return false;
        if (filter.roomCode !== undefined && document.roomCode !== filter.roomCode) return false;
        if (filter.activeUserIds !== undefined) {
          const activeFilter = filter.activeUserIds as { $exists?: boolean } | string;
          if (
            typeof activeFilter === 'object' &&
            activeFilter.$exists === false &&
            Object.prototype.hasOwnProperty.call(document, 'activeUserIds')
          ) return false;
          if (
            typeof activeFilter === 'string' &&
            !activeUserIds(document).includes(activeFilter)
          ) return false;
        }
        if (
          filter['players.userId'] !== undefined &&
          !(document.players as Array<{ userId: string }>).some(
            (player) => player.userId === filter['players.userId'],
          )
        ) return false;
        const playerIdentity = (filter.players as { $elemMatch?: Document } | undefined)
          ?.$elemMatch;
        if (
          playerIdentity &&
          !(document.players as Document[]).some((player) =>
            Object.entries(playerIdentity).every(([field, value]) => player[field] === value),
          )
        ) return false;
        const excludedStatuses = (filter.status as { $nin?: string[] } | undefined)?.$nin;
        if (excludedStatuses?.includes(String(document.status))) return false;
        return true;
      });
      if (options?.sort?.updatedAt === -1) {
        candidates.sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));
      }
      const found = candidates[0];
      if (!found) return null;
      if (options?.projection?._id === 1) {
        return { _id: found._id } as WithId<Document>;
      }
      return clone(found);
    },
  );

  readonly find = jest.fn((filter: Document): MatchMongoCursor => {
    let documents = [...this.documents.values()].filter((document) => {
      const excludedStatuses = (filter.status as { $nin?: string[] } | undefined)?.$nin;
      if (excludedStatuses?.includes(String(document.status))) return false;
      const deadline = filter.nextReconcileAt as { $ne?: null; $lte?: number } | undefined;
      if (deadline) {
        if (deadline.$ne === null && document.nextReconcileAt === null) return false;
        if (typeof deadline.$lte === 'number' && Number(document.nextReconcileAt) > deadline.$lte) {
          return false;
        }
      }
      return true;
    });
    const cursor: MatchMongoCursor = {
      sort: (spec) => {
        if (spec.nextReconcileAt === 1) {
          documents = documents.sort(
            (left, right) => Number(left.nextReconcileAt) - Number(right.nextReconcileAt),
          );
        }
        return cursor;
      },
      limit: (limit) => {
        documents = documents.slice(0, limit);
        return cursor;
      },
      toArray: async () => clone(documents),
    };
    return cursor;
  });

  readonly findOneAndUpdate = jest.fn(
    async (
      filter: Document,
      update: { readonly $set: Document },
      _options: {
        readonly returnDocument: 'after';
        readonly includeResultMetadata: false;
      },
    ): Promise<WithId<Document> | null> => {
      const matchId = String(filter.matchId);
      const current = this.documents.get(matchId);
      if (!current || current.revision !== filter.revision) {
        return null;
      }

      const nextRoomCode = String(update.$set.roomCode);
      if (
        [...this.documents.values()].some(
          (candidate) => candidate.matchId !== matchId && candidate.roomCode === nextRoomCode,
        )
      ) {
        throw duplicateKeyError();
      }
      if (
        activeUserIds(update.$set).some((userId) =>
          [...this.documents.values()].some(
            (candidate) =>
              candidate.matchId !== matchId && activeUserIds(candidate).includes(userId),
          ),
        )
      ) {
        throw duplicateKeyError({ activeUserIds: 1 });
      }
      const nextGameSessions = (update.$set.players as Document[]).map((player) =>
        String(player.gameSessionId),
      );
      if (
        [...this.documents.values()].some(
          (candidate) =>
            candidate.matchId !== matchId &&
            (candidate.players as Document[]).some((player) =>
              nextGameSessions.includes(String(player.gameSessionId)),
            ),
        )
      ) {
        throw duplicateKeyError({ 'players.gameSessionId': 1 });
      }

      const updated = {
        ...current,
        ...clone(update.$set),
        _id: current._id,
      } as WithId<Document>;
      this.documents.set(matchId, updated);
      return clone(updated);
    },
  );

  document(matchId: string) {
    const document = this.documents.get(matchId);
    return document ? clone(document) : null;
  }
}

function createMatch(matchId = 'match-1', roomCode = 'ROOM-1'): Match {
  return createWaitingMatch({
    matchId,
    roomCode,
    firstPlayer: {
      playerId: `player-${matchId}`,
      userId: `user-${matchId}`,
      gameSessionId: `session-${matchId}`,
      clientInstanceId: `instance-${matchId}`,
    },
    rules: createMatchRules(),
    now: 0,
  });
}

function createRepository(collection = new FakeMatchMongoCollection()) {
  const collectionProvider = jest.fn(async () => collection);
  return {
    collection,
    collectionProvider,
    repository: new MongoMatchRepository({ collectionProvider }),
  };
}

describe('MongoMatchRepository', () => {
  it('creates unique, scheduler and TTL indexes exactly once', async () => {
    const { collection, repository } = createRepository();

    await Promise.all([
      repository.findByMatchId('missing'),
      repository.findByRoomCode('MISSING'),
    ]);
    await repository.findByMatchId('still-missing');

    expect(collection.updateMany).toHaveBeenCalledTimes(2);
    expect(collection.updateMany).toHaveBeenNthCalledWith(
      1,
      {
        activeUserIds: { $exists: false },
        status: { $in: ['finished', 'abandoned'] },
      },
      { $set: { activeUserIds: [] } },
    );
    expect(collection.updateMany).toHaveBeenNthCalledWith(
      2,
      {
        activeUserIds: { $exists: false },
        status: { $nin: ['finished', 'abandoned'] },
      },
      [{ $set: { activeUserIds: '$players.userId' } }],
    );
    expect(collection.createIndex).toHaveBeenCalledTimes(7);
    expect(collection.updateMany.mock.invocationCallOrder[1]).toBeLessThan(
      collection.createIndex.mock.invocationCallOrder[0],
    );
    expect(collection.createIndex).toHaveBeenNthCalledWith(1, { matchId: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, { roomCode: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenNthCalledWith(
      3,
      { activeUserIds: 1 },
      {
        unique: true,
        partialFilterExpression: { 'activeUserIds.0': { $exists: true } },
      },
    );
    expect(collection.createIndex).toHaveBeenNthCalledWith(
      4,
      { 'players.gameSessionId': 1 },
      { unique: true },
    );
    expect(collection.createIndex).toHaveBeenCalledWith(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  });

  it('maps numeric Mongo duplicate-key errors on matchId and roomCode', async () => {
    const { repository } = createRepository();
    await repository.create(createMatch());

    await expect(repository.create(createMatch('match-1', 'ROOM-2'))).rejects.toBeInstanceOf(
      MatchAlreadyExistsError,
    );
    await expect(repository.create(createMatch('match-2', 'ROOM-1'))).rejects.toBeInstanceOf(
      MatchAlreadyExistsError,
    );
  });

  it('uses MongoDB 7 direct-document CAS semantics and returns the next revision', async () => {
    const { collection, repository } = createRepository();
    const created = await repository.create(createMatch());

    const saved = await repository.save({ ...created, updatedAt: 10 }, 0);

    expect(saved.revision).toBe(1);
    expect(saved.updatedAt).toBe(10);
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { matchId: 'match-1', revision: 0 },
      { $set: expect.objectContaining({ matchId: 'match-1', revision: 1, updatedAt: 10 }) },
      { returnDocument: 'after', includeResultMetadata: false },
    );
    expect(collection.document('match-1')?.revision).toBe(1);
  });

  it('stores terminal expiry as a BSON Date and restores Unix milliseconds', async () => {
    const { collection, repository } = createRepository();
    const terminal: Match = {
      ...createMatch(),
      status: 'abandoned',
      activeUserIds: [],
      nextReconcileAt: null,
      expiresAt: 123_456,
      result: {
        winnerPlayerId: null,
        reason: 'abandoned',
        finalScores: { 'player-match-1': 0 },
        finishedAt: 100,
      },
    };

    await repository.create(terminal);

    const inserted = collection.insertOne.mock.calls[0][0];
    expect(inserted.expiresAt).toBeInstanceOf(Date);
    expect((inserted.expiresAt as Date).getTime()).toBe(123_456);
    await expect(repository.findByMatchId(terminal.matchId)).resolves.toMatchObject({
      expiresAt: 123_456,
    });
  });

  it('loads legacy rows fail-closed without inventing a client instance authority', async () => {
    const { collection, repository } = createRepository();
    const legacy = clone(createMatch()) as unknown as Document;
    delete legacy.activeUserIds;
    delete legacy.resumeEpoch;
    delete (legacy.players as Document[])[0].clientInstanceId;
    await collection.insertOne(legacy);

    const loaded = await repository.findByMatchId('match-1');
    expect(loaded).toMatchObject({
      activeUserIds: ['user-match-1'],
      resumeEpoch: 0,
      players: [expect.objectContaining({ clientInstanceId: '' })],
    });
    await expect(repository.findNonTerminalByUserId('user-match-1')).resolves.toMatchObject({
      matchId: 'match-1',
    });
    expect(collection.findOne).toHaveBeenCalledWith({
      activeUserIds: 'user-match-1',
      'activeUserIds.0': { $exists: true },
    });
    expect(collection.document('match-1')?.activeUserIds).toEqual(['user-match-1']);
    await expect(
      repository.findNonTerminalByIdentity({
        userId: 'user-match-1',
        gameSessionId: 'session-match-1',
        clientInstanceId: 'session-match-1',
      }),
    ).resolves.toBeNull();
  });

  it('fails closed when activeUserIds backfill reveals duplicate active wallets', async () => {
    const { collection, repository } = createRepository();
    const firstLegacy = clone(createMatch()) as unknown as Document;
    delete firstLegacy.activeUserIds;
    const secondLegacy = clone(createMatch('match-2', 'ROOM-2')) as unknown as Document;
    delete secondLegacy.activeUserIds;
    (secondLegacy.players as Document[])[0].userId = 'user-match-1';
    await collection.insertOne(firstLegacy);
    await collection.insertOne(secondLegacy);

    await expect(repository.findByMatchId('match-1')).rejects.toMatchObject({
      code: 11000,
      keyPattern: { activeUserIds: 1 },
    });
  });

  it('finds one active match per user and returns scheduler work ordered and limited', async () => {
    const { repository } = createRepository();
    await repository.create({ ...createMatch('match-1', 'ROOM-1'), nextReconcileAt: 20 });
    await repository.create({ ...createMatch('match-2', 'ROOM-2'), nextReconcileAt: 10 });
    await repository.create({
      ...createMatch('match-3', 'ROOM-3'),
      status: 'finished',
      activeUserIds: [],
      nextReconcileAt: 5,
    });

    await expect(repository.findNonTerminalByUserId('user-match-1')).resolves.toMatchObject({
      matchId: 'match-1',
    });
    await expect(repository.findNonTerminalByUserId('missing-user')).resolves.toBeNull();
    await expect(repository.findDue(20, 1)).resolves.toEqual([
      expect.objectContaining({ matchId: 'match-2', nextReconcileAt: 10 }),
    ]);
  });

  it('finds exact active identity and its immutable GameSession binding', async () => {
    const { repository } = createRepository();
    const active = await repository.create(createMatch());

    await expect(
      repository.findNonTerminalByIdentity({
        userId: active.players[0].userId,
        gameSessionId: active.players[0].gameSessionId,
        clientInstanceId: active.players[0].clientInstanceId,
      }),
    ).resolves.toMatchObject({ matchId: active.matchId });
    await expect(
      repository.findNonTerminalByIdentity({
        userId: active.players[0].userId,
        gameSessionId: active.players[0].gameSessionId,
        clientInstanceId: 'stale-instance',
      }),
    ).resolves.toBeNull();

    const terminal: Match = {
      ...active,
      status: 'abandoned',
      activeUserIds: [],
      updatedAt: 10,
    };
    await repository.save(terminal, active.revision);

    await expect(
      repository.findByGameSession(
        active.players[0].userId,
        active.players[0].gameSessionId,
      ),
    ).resolves.toMatchObject({ matchId: active.matchId, status: 'abandoned' });
  });

  it('maps immutable GameSession collisions to a 409 domain error', async () => {
    const { repository } = createRepository();
    const firstMatch = await repository.create(createMatch());
    const conflicting = createMatch('match-2', 'ROOM-2');

    await expect(
      repository.create({
        ...conflicting,
        players: conflicting.players.map((player) => ({
          ...player,
          gameSessionId: firstMatch.players[0].gameSessionId,
        })),
      }),
    ).rejects.toBeInstanceOf(GameSessionMatchConflictError);
  });

  it('maps atomic active-user collisions on create and CAS to a 409 domain error', async () => {
    const { repository } = createRepository();
    const firstMatch = await repository.create(createMatch());
    const conflicting = createMatch('match-2', 'ROOM-2');

    await expect(
      repository.create({
        ...conflicting,
        activeUserIds: firstMatch.activeUserIds,
        players: conflicting.players.map((player) => ({
          ...player,
          userId: firstMatch.players[0].userId,
        })),
      }),
    ).rejects.toBeInstanceOf(ActiveUserMatchConflictError);

    const third = await repository.create(createMatch('match-3', 'ROOM-3'));
    await expect(
      repository.save({ ...third, activeUserIds: firstMatch.activeUserIds }, third.revision),
    ).rejects.toMatchObject({ code: 'PLAYER_ACTIVE_MATCH', statusCode: 409 });
  });

  it('allows a wallet to enter a new room after terminal activeUserIds are cleared', async () => {
    const { repository } = createRepository();
    const firstMatch = await repository.create(createMatch());
    await repository.save(
      { ...firstMatch, status: 'abandoned', activeUserIds: [], updatedAt: 1 },
      firstMatch.revision,
    );
    const next = createMatch('match-next', 'ROOM-NEXT');

    await expect(
      repository.create({
        ...next,
        activeUserIds: [firstMatch.players[0].userId],
        players: next.players.map((player) => ({
          ...player,
          userId: firstMatch.players[0].userId,
        })),
      }),
    ).resolves.toMatchObject({ roomCode: 'ROOM-NEXT' });
  });

  it('keeps concurrent CAS atomic and distinguishes conflict from not found', async () => {
    const { repository } = createRepository();
    const created = await repository.create(createMatch());

    const concurrent = await Promise.allSettled([
      repository.save({ ...created, updatedAt: 1 }, 0),
      repository.save({ ...created, updatedAt: 2 }, 0),
    ]);
    expect(concurrent.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = concurrent.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(MatchRevisionConflictError);

    await expect(repository.save({ ...created, updatedAt: 3 }, 0)).rejects.toBeInstanceOf(
      MatchRevisionConflictError,
    );
    await expect(
      repository.save({ ...created, matchId: 'missing', updatedAt: 3 }, 0),
    ).rejects.toBeInstanceOf(MatchNotFoundError);
  });

  it('maps a unique roomCode collision during CAS without mutating the stored match', async () => {
    const { collection, repository } = createRepository();
    await repository.create(createMatch('match-1', 'ROOM-1'));
    const second = await repository.create(createMatch('match-2', 'ROOM-2'));

    await expect(repository.save({ ...second, roomCode: 'ROOM-1' }, 0)).rejects.toBeInstanceOf(
      MatchAlreadyExistsError,
    );
    expect(collection.document('match-2')).toMatchObject({ roomCode: 'ROOM-2', revision: 0 });
  });

  it('fails closed before loading mongodb-hub when DATABASE_URL is absent', async () => {
    const loadHubCollection = jest.fn(async () => ({
      getHubCollection: jest.fn(),
    }));
    const collectionProvider = createHubCollectionProvider({
      getDatabaseUrl: () => undefined,
      loadHubCollection,
    });
    const repository = new MongoMatchRepository({ collectionProvider });

    await expect(repository.findByMatchId('match-1')).rejects.toBeInstanceOf(
      MultiplayerMongoConfigurationError,
    );
    expect(loadHubCollection).not.toHaveBeenCalled();
  });
});
