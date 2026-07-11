import type { Document, WithId } from 'mongodb';

import {
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

function duplicateKeyError() {
  return Object.assign(new Error('E11000 duplicate key'), { code: 11000 });
}

class FakeMatchMongoCollection implements MatchMongoCollection {
  private readonly documents = new Map<string, WithId<Document>>();
  private nextId = 1;

  readonly createIndex = jest.fn(
    async (spec: Document, _options?: MatchMongoIndexOptions): Promise<string> =>
      `${Object.keys(spec)[0]}_1`,
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

    const stored = {
      ...clone(document),
      _id: `fake-${this.nextId++}`,
    } as unknown as WithId<Document>;
    this.documents.set(matchId, stored);
    return { acknowledged: true, insertedId: stored._id };
  });

  readonly findOne = jest.fn(
    async (
      filter: Document,
      options?: { readonly projection?: Document },
    ): Promise<WithId<Document> | null> => {
      const found = [...this.documents.values()].find((document) => {
        if (filter.matchId !== undefined && document.matchId !== filter.matchId) return false;
        if (filter.roomCode !== undefined && document.roomCode !== filter.roomCode) return false;
        if (
          filter['players.userId'] !== undefined &&
          !(document.players as Array<{ userId: string }>).some(
            (player) => player.userId === filter['players.userId'],
          )
        ) return false;
        const excludedStatuses = (filter.status as { $nin?: string[] } | undefined)?.$nin;
        if (excludedStatuses?.includes(String(document.status))) return false;
        return true;
      });
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

    expect(collection.createIndex).toHaveBeenCalledTimes(5);
    expect(collection.createIndex).toHaveBeenNthCalledWith(1, { matchId: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, { roomCode: 1 }, { unique: true });
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

  it('finds one active match per user and returns scheduler work ordered and limited', async () => {
    const { repository } = createRepository();
    await repository.create({ ...createMatch('match-1', 'ROOM-1'), nextReconcileAt: 20 });
    await repository.create({ ...createMatch('match-2', 'ROOM-2'), nextReconcileAt: 10 });
    await repository.create({
      ...createMatch('match-3', 'ROOM-3'),
      status: 'finished',
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
