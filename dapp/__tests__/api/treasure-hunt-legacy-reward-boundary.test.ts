jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameSession: { findUnique: jest.fn(), updateMany: jest.fn() },
    gameCheckpoint: { create: jest.fn() },
    gameResult: { create: jest.fn() },
    user: { update: jest.fn() },
    pointTransaction: { create: jest.fn() },
  },
}));

import { NextRequest } from 'next/server';

import { POST as checkpoint } from '@/app/api/games/checkpoint/route';
import { POST as endSession } from '@/app/api/games/end-session/route';
import { prisma } from '@/lib/prisma';

const findGameSession = prisma.gameSession.findUnique as unknown as jest.Mock;
const updateGameSessions = prisma.gameSession.updateMany as unknown as jest.Mock;
const createCheckpoint = prisma.gameCheckpoint.create as unknown as jest.Mock;
const createGameResult = prisma.gameResult.create as unknown as jest.Mock;
const updateUser = prisma.user.update as unknown as jest.Mock;
const createPointTransaction = prisma.pointTransaction.create as unknown as jest.Mock;

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function gameSession(overrides: Record<string, unknown> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    sessionId: 'game-session-1',
    sessionToken: 'secret-session-token',
    userId: '507f191e810c19729de860ea',
    gameId: 'sybil-slayer',
    isActive: true,
    mode: 'staging_unranked',
    rewardEligible: false,
    competitionAttemptId: null,
    checkpoints: [],
    result: null,
    ...overrides,
  };
}

describe('Treasure Hunt legacy reward boundary', () => {
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    updateGameSessions.mockResolvedValue({ count: 1 });
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it.each([
    ['multiplayer mode', { mode: 'staging_unranked', rewardEligible: true }],
    ['ineligible reward flag', { mode: 'standard', rewardEligible: false }],
    ['competition attempt authority', {
      mode: 'standard',
      rewardEligible: true,
      competitionAttemptId: 'attempt-1',
    }],
  ])('rejects end-session for %s with zero database writes', async (_label, overrides) => {
    findGameSession.mockResolvedValue(gameSession(overrides));

    const response = await endSession(
      request('/api/games/end-session', {
        sessionToken: 'secret-session-token',
        finalScore: 50_000,
        metadata: { injected: true },
      }),
    );

    expect(response.status).toBe(403);
    expect(updateGameSessions).not.toHaveBeenCalled();
    expect(createGameResult).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(createPointTransaction).not.toHaveBeenCalled();
    expect(createCheckpoint).not.toHaveBeenCalled();
  });

  it.each([
    ['multiplayer mode', { mode: 'staging_unranked', rewardEligible: true }],
    ['ineligible reward flag', { mode: 'standard', rewardEligible: false }],
    ['competition attempt authority', {
      mode: 'standard',
      rewardEligible: true,
      competitionAttemptId: 'attempt-1',
    }],
  ])('rejects checkpoints for %s with zero database writes', async (_label, overrides) => {
    findGameSession.mockResolvedValue(gameSession(overrides));

    const response = await checkpoint(
      request('/api/games/checkpoint', {
        sessionToken: 'secret-session-token',
        checkpoint: { score: 50_000, gameTime: 10, nonce: 'n', hash: 'h' },
        events: [],
      }),
    );

    expect(response.status).toBe(403);
    expect(createCheckpoint).not.toHaveBeenCalled();
    expect(updateGameSessions).not.toHaveBeenCalled();
    expect(createGameResult).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(createPointTransaction).not.toHaveBeenCalled();
  });

  it('loses the settlement race to a multiplayer lock before economic writes', async () => {
    findGameSession
      .mockResolvedValueOnce(gameSession({ mode: 'standard', rewardEligible: true }))
      .mockResolvedValueOnce({ mode: 'staging_unranked', rewardEligible: false });
    updateGameSessions.mockResolvedValue({ count: 0 });

    const response = await endSession(
      request('/api/games/end-session', {
        sessionToken: 'secret-session-token',
        finalScore: 50_000,
      }),
    );

    expect(response.status).toBe(403);
    expect(updateGameSessions).toHaveBeenCalledWith({
      where: {
        id: '507f1f77bcf86cd799439011',
        isActive: true,
        mode: 'standard',
        rewardEligible: true,
        OR: [
          { competitionAttemptId: null },
          { competitionAttemptId: { isSet: false } },
        ],
      },
      data: { isActive: false, endedAt: expect.any(Date) },
    });
    expect(createGameResult).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(createPointTransaction).not.toHaveBeenCalled();
  });

  it('fails a legacy checkpoint when the exact standard-session CAS loses a race', async () => {
    findGameSession.mockResolvedValue(gameSession({ mode: 'standard', rewardEligible: true }));
    updateGameSessions.mockResolvedValue({ count: 0 });

    const response = await checkpoint(
      request('/api/games/checkpoint', {
        sessionToken: 'secret-session-token',
        checkpoint: { score: 100, gameTime: 1_000, nonce: 'n', hash: 'h' },
        events: [],
      }),
    );

    expect(response.status).toBe(403);
    expect(updateGameSessions).toHaveBeenCalledWith({
      where: {
        id: '507f1f77bcf86cd799439011',
        isActive: true,
        mode: 'standard',
        rewardEligible: true,
        OR: [
          { competitionAttemptId: null },
          { competitionAttemptId: { isSet: false } },
        ],
      },
      data: { updatedAt: expect.any(Date) },
    });
    expect(createCheckpoint).not.toHaveBeenCalled();
  });
});
