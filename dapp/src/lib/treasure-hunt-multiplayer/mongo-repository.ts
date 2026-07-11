import type { Document, WithId } from 'mongodb';

import {
  MatchAlreadyExistsError,
  MatchNotFoundError,
  MatchRevisionConflictError,
} from './errors';
import type { MatchRepository } from './repository';
import type { Match } from './types';

const DEFAULT_COLLECTION_NAME = 'TreasureHuntMultiplayerMatch';

export type MatchUniqueIndex = { readonly matchId: 1 } | { readonly roomCode: 1 };

export interface MatchMongoCollection {
  createIndex(spec: MatchUniqueIndex, options: { readonly unique: true }): Promise<string>;
  insertOne(document: Document): Promise<unknown>;
  findOne(
    filter: Document,
    options?: { readonly projection?: Document },
  ): Promise<WithId<Document> | null>;
  findOneAndUpdate(
    filter: Document,
    update: { readonly $set: Document },
    options: {
      readonly returnDocument: 'after';
      readonly includeResultMetadata: false;
    },
  ): Promise<WithId<Document> | null>;
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

function fromDocument(document: WithId<Document> | Document | null): Match | null {
  if (!document) {
    return null;
  }

  const { _id: _discarded, ...match } = document;
  return match as unknown as Match;
}

export class MongoMatchRepository implements MatchRepository {
  private readonly collectionName: string;
  private readonly collectionProvider: MatchCollectionProvider;
  private indexesReady: Promise<void> | null = null;

  constructor(options: MongoMatchRepositoryOptions = {}) {
    this.collectionName = options.collectionName ?? DEFAULT_COLLECTION_NAME;
    this.collectionProvider = options.collectionProvider ?? createHubCollectionProvider();
  }

  private async collection() {
    const collection = await this.collectionProvider(this.collectionName);
    if (!this.indexesReady) {
      this.indexesReady = Promise.all([
        collection.createIndex({ matchId: 1 }, { unique: true }),
        collection.createIndex({ roomCode: 1 }, { unique: true }),
      ]).then(() => undefined);
    }

    await this.indexesReady;
    return collection;
  }

  async create(match: Match): Promise<Match> {
    const collection = await this.collection();
    const stored: Match = { ...match, revision: 0 };

    try {
      await collection.insertOne({ ...stored });
      return stored;
    } catch (error) {
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

  async save(match: Match, expectedRevision: number): Promise<Match> {
    const collection = await this.collection();
    const stored: Match = { ...match, revision: expectedRevision + 1 };
    let updated: WithId<Document> | null;

    try {
      updated = await collection.findOneAndUpdate(
        { matchId: match.matchId, revision: expectedRevision },
        { $set: stored },
        { returnDocument: 'after', includeResultMetadata: false },
      );
    } catch (error) {
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
