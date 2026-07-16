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

type CompetitionSessionIdentity = {
  readonly userId: string;
  readonly gameSessionId: string;
  readonly attemptId: string;
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

function ownedSession(identity: Pick<SessionIdentity, 'userId' | 'gameSessionId'>): Filter<Document> {
  return {
    sessionId: identity.gameSessionId,
    userId: toObjectId(identity.userId),
    gameId: TREASURE_HUNT_GAME_ID,
  };
}

function activeOwnedSession(identity: SessionIdentity): Filter<Document> {
  return {
    ...ownedSession(identity),
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
    competitionAttemptId: null,
    startedAt: now,
    endedAt: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

export async function claimGameSessionForCompetition(identity: CompetitionSessionIdentity) {
  const collection = await getGameSessionCollection();
  const result = await collection.updateOne(
    {
      ...activeOwnedSession({
        userId: identity.userId,
        gameSessionId: identity.gameSessionId,
        clientInstanceId: '',
      }),
      $or: [
        {
          mode: 'standard',
          rewardEligible: true,
          competitionAttemptId: null,
          multiplayerState: { $in: ['idle', null] },
        },
        {
          mode: 'standard',
          rewardEligible: true,
          competitionAttemptId: null,
          multiplayerState: { $exists: false },
        },
        {
          mode: 'presale_competition',
          rewardEligible: false,
          competitionAttemptId: identity.attemptId,
        },
      ],
    },
    {
      $set: {
        mode: 'presale_competition',
        rewardEligible: false,
        competitionAttemptId: identity.attemptId,
        updatedAt: new Date(),
      },
    },
  );
  return result.matchedCount === 1;
}

export async function finishGameSessionForCompetition(identity: CompetitionSessionIdentity) {
  const collection = await getGameSessionCollection();
  const endedAt = new Date();
  const result = await collection.updateOne(
    {
      ...ownedSession({
        userId: identity.userId,
        gameSessionId: identity.gameSessionId,
      }),
      mode: 'presale_competition',
      rewardEligible: false,
      competitionAttemptId: identity.attemptId,
      $or: [
        { isActive: true },
        { isActive: false, endedAt: { $ne: null } },
      ],
    },
    [
      {
        $set: {
          isActive: false,
          endedAt: {
            $cond: [{ $eq: ['$isActive', true] }, endedAt, '$endedAt'],
          },
          updatedAt: {
            $cond: [{ $eq: ['$isActive', true] }, endedAt, '$updatedAt'],
          },
        },
      },
    ],
  );
  return result.matchedCount === 1;
}

export async function releaseGameSessionForCompetition(identity: CompetitionSessionIdentity) {
  const collection = await getGameSessionCollection();
  const result = await collection.updateOne(
    {
      ...activeOwnedSession({
        userId: identity.userId,
        gameSessionId: identity.gameSessionId,
        clientInstanceId: '',
      }),
      mode: 'presale_competition',
      rewardEligible: false,
      competitionAttemptId: identity.attemptId,
    },
    {
      $set: { mode: 'standard', rewardEligible: true, updatedAt: new Date() },
      $unset: { competitionAttemptId: '' },
    },
  );
  return result.matchedCount === 1;
}

export async function claimGameSessionForMultiplayer(identity: SessionIdentity) {
  const collection = await getGameSessionCollection();
  const clientLease = availableClientLease(identity.clientInstanceId);
  const result = await collection.updateOne(
    {
      ...activeOwnedSession(identity),
      $or: [
        {
          mode: 'standard',
          rewardEligible: true,
          $and: [
            {
              $or: [
                { competitionAttemptId: null },
                { competitionAttemptId: { $exists: false } },
              ],
            },
            {
              $or: [
                { multiplayerState: 'idle', ...clientLease },
                { multiplayerState: null, ...clientLease },
                { multiplayerState: { $exists: false }, ...clientLease },
              ],
            },
          ],
        },
        {
          mode: 'staging_unranked',
          rewardEligible: false,
          multiplayerState: { $in: ['joining', 'joined'] },
          multiplayerClientInstanceId: identity.clientInstanceId,
          $or: [
            { competitionAttemptId: null },
            { competitionAttemptId: { $exists: false } },
          ],
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
