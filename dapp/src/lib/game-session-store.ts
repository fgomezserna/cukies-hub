import 'server-only';

import { ObjectId, type Collection, type Document, type Filter } from 'mongodb';

import { getHubCollection } from './mongodb-hub';

const GAME_SESSION_COLLECTION = 'GameSession';
const TREASURE_HUNT_GAME_ID = 'sybil-slayer';

type SessionIdentity = {
  readonly userId: string;
  readonly gameSessionId: string;
  readonly clientInstanceId: string;
};

export type DirectGameSessionInput = {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly userId: string;
  readonly gameId: string;
  readonly gameVersion: string;
};

let gameSessionIndexesPromise: Promise<void> | null = null;

function toObjectId(value: string) {
  if (!ObjectId.isValid(value)) {
    throw new Error('Game session user id must be a Mongo ObjectId');
  }

  return new ObjectId(value);
}

async function getGameSessionCollection(): Promise<Collection<Document>> {
  return getHubCollection(GAME_SESSION_COLLECTION);
}

async function ensureGameSessionIndexes(collection: Collection<Document>) {
  if (!gameSessionIndexesPromise) {
    gameSessionIndexesPromise = collection
      .createIndexes([
        {
          key: { sessionToken: 1 },
          name: 'GameSession_sessionToken_key',
          unique: true,
        },
        {
          key: { sessionId: 1 },
          name: 'GameSession_sessionId_key',
          unique: true,
        },
        {
          key: { userId: 1, gameId: 1 },
          name: 'GameSession_userId_gameId_idx',
        },
      ])
      .then(() => undefined)
      .catch((error) => {
        gameSessionIndexesPromise = null;
        throw error;
      });
  }

  await gameSessionIndexesPromise;
}

function availableClientLease(clientInstanceId: string) {
  return {
    $or: [
      { multiplayerClientInstanceId: clientInstanceId },
      { multiplayerClientInstanceId: null },
      { multiplayerClientInstanceId: { $exists: false } },
    ],
  };
}

function activeOwnedSession(identity: SessionIdentity): Filter<Document> {
  return {
    sessionId: identity.gameSessionId,
    userId: toObjectId(identity.userId),
    gameId: TREASURE_HUNT_GAME_ID,
    isActive: true,
  };
}

export async function createGameSessionDirectly(input: DirectGameSessionInput) {
  const collection = await getGameSessionCollection();
  await ensureGameSessionIndexes(collection);

  const now = new Date();
  await collection.insertOne({
    _id: new ObjectId(),
    sessionToken: input.sessionToken,
    sessionId: input.sessionId,
    userId: toObjectId(input.userId),
    gameId: input.gameId,
    gameVersion: input.gameVersion,
    mode: 'standard',
    rewardEligible: true,
    multiplayerState: 'idle',
    multiplayerClientInstanceId: null,
    startedAt: now,
    endedAt: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function claimGameSessionForMultiplayer(identity: SessionIdentity) {
  const collection = await getGameSessionCollection();
  const clientLease = availableClientLease(identity.clientInstanceId);
  const result = await collection.updateOne(
    {
      ...activeOwnedSession(identity),
      $or: [
        { multiplayerState: 'idle', ...clientLease },
        { multiplayerState: null, ...clientLease },
        { multiplayerState: { $exists: false }, ...clientLease },
        {
          multiplayerState: 'joining',
          multiplayerClientInstanceId: identity.clientInstanceId,
        },
        {
          multiplayerState: 'joined',
          multiplayerClientInstanceId: identity.clientInstanceId,
        },
      ],
    },
    {
      $set: {
        mode: 'staging_unranked',
        rewardEligible: false,
        multiplayerState: 'joining',
        multiplayerClientInstanceId: identity.clientInstanceId,
        updatedAt: new Date(),
      },
    },
  );

  return result.matchedCount === 1;
}

export async function confirmGameSessionForMultiplayerDirectly(identity: SessionIdentity) {
  const collection = await getGameSessionCollection();
  const result = await collection.updateOne(
    {
      ...activeOwnedSession(identity),
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'joining',
      multiplayerClientInstanceId: identity.clientInstanceId,
    },
    {
      $set: {
        multiplayerState: 'joined',
        updatedAt: new Date(),
      },
    },
  );

  return result.matchedCount === 1;
}

export async function releaseGameSessionForMultiplayerDirectly(identity: SessionIdentity) {
  const collection = await getGameSessionCollection();
  const clientLease = availableClientLease(identity.clientInstanceId);
  const endedAt = new Date();
  const result = await collection.updateOne(
    {
      ...activeOwnedSession(identity),
      $or: [
        {
          multiplayerState: { $in: ['joining', 'joined'] },
          multiplayerClientInstanceId: identity.clientInstanceId,
        },
        { multiplayerState: 'idle', ...clientLease },
        { multiplayerState: null, ...clientLease },
        { multiplayerState: { $exists: false }, ...clientLease },
      ],
    },
    {
      $set: {
        isActive: false,
        endedAt,
        mode: 'staging_unranked',
        rewardEligible: false,
        multiplayerState: 'released',
        multiplayerClientInstanceId: identity.clientInstanceId,
        updatedAt: endedAt,
      },
    },
  );

  return result.matchedCount === 1;
}
