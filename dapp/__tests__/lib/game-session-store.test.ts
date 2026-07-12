jest.mock('server-only', () => ({}), { virtual: true });

jest.mock('@/lib/mongodb-hub', () => ({
  getHubCollection: jest.fn(),
}));

jest.mock('mongodb', () => ({
  ObjectId: class MockObjectId {
    private readonly value: string;

    constructor(value = '507f1f77bcf86cd799439012') {
      this.value = value;
    }

    static isValid(value: unknown) {
      return typeof value === 'string' && /^[0-9a-f]{24}$/i.test(value);
    }

    toHexString() {
      return this.value;
    }
  },
}));

import {
  claimGameSessionForMultiplayer,
  confirmGameSessionForMultiplayerDirectly,
  createGameSessionDirectly,
  releaseGameSessionForMultiplayerDirectly,
} from '@/lib/game-session-store';
import { getHubCollection } from '@/lib/mongodb-hub';

const createIndexes = jest.fn();
const insertOne = jest.fn();
const updateOne = jest.fn();
const mockGetHubCollection = getHubCollection as unknown as jest.Mock;
const userId = '507f1f77bcf86cd799439011';
const identity = {
  userId,
  gameSessionId: 'game-session-1',
  clientInstanceId: 'client-instance-1',
};

describe('game session Mongo store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createIndexes.mockResolvedValue(['sessionToken', 'sessionId', 'userGame']);
    insertOne.mockResolvedValue({ acknowledged: true });
    updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
    mockGetHubCollection.mockResolvedValue({ createIndexes, insertOne, updateOne });
  });

  it('creates the Prisma-compatible document and required idempotency indexes', async () => {
    await createGameSessionDirectly({
      sessionId: 'game-session-1',
      sessionToken: 'session-token-1',
      userId,
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
    });

    expect(mockGetHubCollection).toHaveBeenCalledWith('GameSession');
    expect(createIndexes).toHaveBeenCalledWith([
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
    ]);
    expect(insertOne).toHaveBeenCalledWith(expect.objectContaining({
      _id: expect.anything(),
      sessionId: 'game-session-1',
      sessionToken: 'session-token-1',
      userId: expect.anything(),
      gameId: 'sybil-slayer',
      gameVersion: '1.0.0',
      mode: 'standard',
      rewardEligible: true,
      multiplayerState: 'idle',
      multiplayerClientInstanceId: null,
      startedAt: expect.any(Date),
      endedAt: null,
      isActive: true,
      createdAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }));
    expect(insertOne.mock.calls[0][0].userId.toHexString()).toBe(userId);
  });

  it('claims only the owned active Treasure Hunt session and exact client lease', async () => {
    await expect(claimGameSessionForMultiplayer(identity)).resolves.toBe(true);

    expect(updateOne).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'game-session-1',
        userId: expect.anything(),
        gameId: 'sybil-slayer',
        isActive: true,
        $or: expect.arrayContaining([
          {
            multiplayerState: 'joining',
            multiplayerClientInstanceId: 'client-instance-1',
          },
          {
            multiplayerState: 'joined',
            multiplayerClientInstanceId: 'client-instance-1',
          },
        ]),
      }),
      {
        $set: expect.objectContaining({
          mode: 'staging_unranked',
          rewardEligible: false,
          multiplayerState: 'joining',
          multiplayerClientInstanceId: 'client-instance-1',
          updatedAt: expect.any(Date),
        }),
      },
    );
  });

  it('confirms and releases through atomic conditional updates', async () => {
    await expect(confirmGameSessionForMultiplayerDirectly(identity)).resolves.toBe(true);
    await expect(releaseGameSessionForMultiplayerDirectly(identity)).resolves.toBe(true);

    expect(updateOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sessionId: 'game-session-1',
        userId: expect.anything(),
        gameId: 'sybil-slayer',
        isActive: true,
        mode: 'staging_unranked',
        rewardEligible: false,
        multiplayerState: 'joining',
        multiplayerClientInstanceId: 'client-instance-1',
      }),
      {
        $set: expect.objectContaining({
          multiplayerState: 'joined',
          updatedAt: expect.any(Date),
        }),
      },
    );
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: 'game-session-1',
        userId: expect.anything(),
        gameId: 'sybil-slayer',
        isActive: true,
        $or: expect.any(Array),
      }),
      {
        $set: expect.objectContaining({
          isActive: false,
          endedAt: expect.any(Date),
          multiplayerState: 'released',
          multiplayerClientInstanceId: 'client-instance-1',
          updatedAt: expect.any(Date),
        }),
      },
    );
  });

  it('fails closed when the conditional update matches no session', async () => {
    updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

    await expect(claimGameSessionForMultiplayer(identity)).resolves.toBe(false);
    await expect(confirmGameSessionForMultiplayerDirectly(identity)).resolves.toBe(false);
    await expect(releaseGameSessionForMultiplayerDirectly(identity)).resolves.toBe(false);
  });

  it('rejects non-ObjectId user identities before issuing an update', async () => {
    await expect(
      claimGameSessionForMultiplayer({ ...identity, userId: 'not-an-object-id' }),
    ).rejects.toThrow('Game session user id must be a Mongo ObjectId');
    expect(updateOne).not.toHaveBeenCalled();
  });
});
