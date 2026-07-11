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
  type MatchUniqueIndex,
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
    async (spec: MatchUniqueIndex, _options: { readonly unique: true }): Promise<string> =>
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
        return true;
      });
      if (!found) return null;
      if (options?.projection?._id === 1) {
        return { _id: found._id } as WithId<Document>;
      }
      return clone(found);
    },
  );

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
  it('creates the two unique indexes exactly once', async () => {
    const { collection, repository } = createRepository();

    await Promise.all([
      repository.findByMatchId('missing'),
      repository.findByRoomCode('MISSING'),
    ]);
    await repository.findByMatchId('still-missing');

    expect(collection.createIndex).toHaveBeenCalledTimes(2);
    expect(collection.createIndex).toHaveBeenNthCalledWith(1, { matchId: 1 }, { unique: true });
    expect(collection.createIndex).toHaveBeenNthCalledWith(2, { roomCode: 1 }, { unique: true });
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
