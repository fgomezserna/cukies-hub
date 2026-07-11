import type { Document, WithId } from 'mongodb';

import {
  ActiveUserMatchConflictError,
  GameSessionMatchConflictError,
  MatchAlreadyExistsError,
  MatchNotFoundError,
  MatchRevisionConflictError,
} from './errors';
import type { MatchRepository } from './repository';
import type { Match, MatchIdentity } from './types';

const DEFAULT_COLLECTION_NAME = 'TreasureHuntMultiplayerMatch';

export interface MatchMongoIndexOptions {
  readonly unique?: true;
  readonly sparse?: true;
  readonly partialFilterExpression?: Document;
  readonly expireAfterSeconds?: number;
}

export interface MatchMongoCursor {
  sort(spec: Document): MatchMongoCursor;
  limit(limit: number): MatchMongoCursor;
  toArray(): Promise<WithId<Document>[]>;
}

export interface MatchMongoCollection {
  createIndex(spec: Document, options?: MatchMongoIndexOptions): Promise<string>;
  insertOne(document: Document): Promise<unknown>;
  updateMany(
    filter: Document,
    update: Document | readonly Document[],
  ): Promise<{ readonly matchedCount?: number; readonly modifiedCount?: number }>;
  findOne(
    filter: Document,
    options?: { readonly projection?: Document; readonly sort?: Document },
  ): Promise<WithId<Document> | null>;
  findOneAndUpdate(
    filter: Document,
    update: { readonly $set: Document },
    options: {
      readonly returnDocument: 'after';
      readonly includeResultMetadata: false;
    },
  ): Promise<WithId<Document> | null>;
  find(filter: Document): MatchMongoCursor;
}

export type MatchCollectionProvider = (collectionName: string) => Promise<MatchMongoCollection>;

interface HubCollectionModule {
  getHubCollection(collectionName: string): Promise<unknown>;
}

export interface HubCollectionProviderOptions {
  readonly getDatabaseUrl?: () => string | undefined;
  readonly loadHubCollection?: () => Promise<HubCollectionModule>;
}

export interface MongoMatchRepositoryOptions {
  readonly collectionName?: string;
  readonly collectionProvider?: MatchCollectionProvider;
}

export class MultiplayerMongoConfigurationError extends Error {
  constructor() {
    super('DATABASE_URL is required for Treasure Hunt multiplayer persistence');
    this.name = 'MultiplayerMongoConfigurationError';
  }
}

export function createHubCollectionProvider(
  options: HubCollectionProviderOptions = {},
): MatchCollectionProvider {
  const getDatabaseUrl = options.getDatabaseUrl ?? (() => process.env.DATABASE_URL);
  const loadHubCollection =
    options.loadHubCollection ?? (() => import('../mongodb-hub') as Promise<HubCollectionModule>);

  return async (collectionName) => {
    if (!getDatabaseUrl()?.trim()) {
      throw new MultiplayerMongoConfigurationError();
    }

    const { getHubCollection } = await loadHubCollection();
    return (await getHubCollection(collectionName)) as MatchMongoCollection;
  };
}

function isDuplicateKeyError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 11000);
}

function isActiveUserDuplicate(error: unknown) {
  if (!isDuplicateKeyError(error) || !error || typeof error !== 'object') {
    return false;
  }
  const keyPattern = 'keyPattern' in error ? error.keyPattern : null;
  return Boolean(
    keyPattern &&
      typeof keyPattern === 'object' &&
      keyPattern !== null &&
      'activeUserIds' in keyPattern,
  );
}

function isGameSessionDuplicate(error: unknown) {
  if (!isDuplicateKeyError(error) || !error || typeof error !== 'object') {
    return false;
  }
  const keyPattern = 'keyPattern' in error ? error.keyPattern : null;
  return Boolean(
    keyPattern &&
      typeof keyPattern === 'object' &&
      keyPattern !== null &&
      'players.gameSessionId' in keyPattern,
  );
}

function fromDocument(document: WithId<Document> | Document | null): Match | null {
  if (!document) {
    return null;
  }

  const { _id: _discarded, ...match } = document;
  const rawExpiresAt = match.expiresAt;
  const players = Array.isArray(match.players)
    ? match.players.map((player) => ({
        ...player,
        // Legacy rows predate instance authority. The empty sentinel cannot pass API/service
        // validation, so a client must enter the explicit rotate/forfeit recovery path.
        clientInstanceId:
          typeof player.clientInstanceId === 'string'
            ? player.clientInstanceId
            : '',
      }))
    : [];
  const terminal = match.status === 'finished' || match.status === 'abandoned';
  return {
    ...match,
    players,
    activeUserIds: Array.isArray(match.activeUserIds)
      ? match.activeUserIds
      : terminal
        ? []
        : players.map((player) => String(player.userId)),
    resumeEpoch:
      Number.isSafeInteger(match.resumeEpoch) && Number(match.resumeEpoch) >= 0
        ? match.resumeEpoch
        : 0,
    expiresAt:
      rawExpiresAt == null
        ? null
        : rawExpiresAt instanceof Date
          ? rawExpiresAt.getTime()
          : typeof rawExpiresAt === 'string'
            ? Date.parse(rawExpiresAt)
            : (rawExpiresAt as number),
  } as unknown as Match;
}

function toDocument(match: Match): Document {
  return {
    ...match,
    expiresAt: match.expiresAt === null ? null : new Date(match.expiresAt),
  };
}

export class MongoMatchRepository implements MatchRepository {
  private readonly collectionName: string;
  private readonly collectionProvider: MatchCollectionProvider;
  private collectionReady: Promise<MatchMongoCollection> | null = null;

  constructor(options: MongoMatchRepositoryOptions = {}) {
    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION_NAME;
    this.collectionProvider = options.collectionProvider ?? createHubCollectionProvider();
  }

  private async collection() {
    if (!this.collectionReady) {
      this.collectionReady = this.collectionProvider(this.collectionName)
        .then(async (collection) => {
          await collection.updateMany(
            {
              activeUserIds: { $exists: false },
              status: { $in: ['finished', 'abandoned'] },
            },
            { $set: { activeUserIds: [] } },
          );
          await collection.updateMany(
            {
              activeUserIds: { $exists: false },
              status: { $nin: ['finished', 'abandoned'] },
            },
            [{ $set: { activeUserIds: '$players.userId' } }],
          );
          await Promise.all([
            collection.createIndex({ matchId: 1 }, { unique: true }),
            collection.createIndex({ roomCode: 1 }, { unique: true }),
            collection.createIndex(
              { activeUserIds: 1 },
              {
                unique: true,
                partialFilterExpression: { 'activeUserIds.0': { $exists: true } },
              },
            ),
            collection.createIndex({ 'players.gameSessionId': 1 }, { unique: true }),
            collection.createIndex({ 'players.userId': 1, status: 1 }),
            collection.createIndex({ nextReconcileAt: 1, status: 1 }),
            collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          ]);
          return collection;
        })
        .catch((error) => {
          this.collectionReady = null;
          throw error;
        });
    }
    return this.collectionReady;
  }

  async create(match: Match): Promise<Match> {
    const collection = await this.collection();
    const stored: Match = { ...match, revision: 0 };

    try {
      await collection.insertOne(toDocument(stored));
      return stored;
    } catch (error) {
      if (isActiveUserDuplicate(error)) {
        throw new ActiveUserMatchConflictError();
      }
      if (isGameSessionDuplicate(error)) {
        throw new GameSessionMatchConflictError();
      }
      if (isDuplicateKeyError(error)) {
        throw new MatchAlreadyExistsError();
      }
      throw error;
    }
  }

  async findByMatchId(matchId: string): Promise<Match | null> {
    const collection = await this.collection();
    return fromDocument(await collection.findOne({ matchId }));
  }

  async findByRoomCode(roomCode: string): Promise<Match | null> {
    const collection = await this.collection();
    return fromDocument(await collection.findOne({ roomCode }));
  }

  async findNonTerminalByUserId(userId: string): Promise<Match | null> {
    const collection = await this.collection();
    return fromDocument(
      await collection.findOne({
        activeUserIds: userId,
        'activeUserIds.0': { $exists: true },
      }),
    );
  }

  async findNonTerminalByIdentity(identity: MatchIdentity): Promise<Match | null> {
    const collection = await this.collection();
    return fromDocument(
      await collection.findOne({
        activeUserIds: identity.userId,
        'activeUserIds.0': { $exists: true },
        players: {
          $elemMatch: {
            userId: identity.userId,
            gameSessionId: identity.gameSessionId,
            clientInstanceId: identity.clientInstanceId,
          },
        },
      }),
    );
  }

  async findNonTerminalByGameSession(
    userId: string,
    gameSessionId: string,
  ): Promise<Match | null> {
    const collection = await this.collection();
    return fromDocument(
      await collection.findOne({
        activeUserIds: userId,
        'activeUserIds.0': { $exists: true },
        players: { $elemMatch: { userId, gameSessionId } },
      }),
    );
  }

  async findByGameSession(userId: string, gameSessionId: string): Promise<Match | null> {
    const collection = await this.collection();
    return fromDocument(
      await collection.findOne({
        players: { $elemMatch: { userId, gameSessionId } },
      }),
    );
  }

  async findDue(now: number, limit: number): Promise<readonly Match[]> {
    const collection = await this.collection();
    const documents = await collection
      .find({
        status: { $nin: ['finished', 'abandoned'] },
        nextReconcileAt: { $ne: null, $lte: now },
      })
      .sort({ nextReconcileAt: 1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => fromDocument(document) as Match);
  }

  async save(match: Match, expectedRevision: number): Promise<Match> {
    const collection = await this.collection();
    const stored: Match = { ...match, revision: expectedRevision + 1 };
    let updated: WithId<Document> | null;

    try {
      updated = await collection.findOneAndUpdate(
        { matchId: match.matchId, revision: expectedRevision },
        { $set: toDocument(stored) },
        { returnDocument: 'after', includeResultMetadata: false },
      );
    } catch (error) {
      if (isActiveUserDuplicate(error)) {
        throw new ActiveUserMatchConflictError();
      }
      if (isGameSessionDuplicate(error)) {
        throw new GameSessionMatchConflictError();
      }
      if (isDuplicateKeyError(error)) {
        throw new MatchAlreadyExistsError();
      }
      throw error;
    }

    if (updated) {
      return fromDocument(updated) as Match;
    }

    const exists = await collection.findOne({ matchId: match.matchId }, { projection: { _id: 1 } });
    if (!exists) {
      throw new MatchNotFoundError(match.matchId);
    }

    throw new MatchRevisionConflictError(match.matchId, expectedRevision);
  }
}
