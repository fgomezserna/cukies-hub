import type { Document, WithId } from 'mongodb';

import { getHubCollection } from '../mongodb-hub';
import {
  MatchAlreadyExistsError,
  MatchNotFoundError,
  MatchRevisionConflictError,
} from './errors';
import type { MatchRepository } from './repository';
import type { Match } from './types';

const DEFAULT_COLLECTION_NAME = 'TreasureHuntMultiplayerMatch';

type HubCollection = Awaited<ReturnType<typeof getHubCollection>>;
type CollectionFactory = (collectionName: string) => Promise<HubCollection>;

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
  private indexesReady: Promise<void> | null = null;

  constructor(
    private readonly collectionName = DEFAULT_COLLECTION_NAME,
    private readonly collectionFactory: CollectionFactory = getHubCollection,
  ) {}

  private async collection() {
    const collection = await this.collectionFactory(this.collectionName);
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
        { returnDocument: 'after' },
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
