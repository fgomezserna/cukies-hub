jest.mock('server-only', () => ({}), { virtual: true });

jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameSession: { findUnique: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/treasure-hunt-multiplayer/server', () => ({
  getTreasureHuntMultiplayerRuntime: jest.fn(),
}));

import { createDefaultMultiplayerHandlerDependencies } from '@/app/api/games/treasure-hunt/multiplayer/_lib/dependencies';
import { prisma } from '@/lib/prisma';

const findGameSession = prisma.gameSession.findUnique as unknown as jest.Mock;
const updateGameSessions = prisma.gameSession.updateMany as unknown as jest.Mock;

describe('Treasure Hunt multiplayer default dependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads reward authority fields and atomically locks the active owned session', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValue({ sessionId: 'game-session-1' });
    updateGameSessions.mockResolvedValue({ count: 1 });

    await dependencies.findGameSessionBySessionId('game-session-1');
    await expect(
      dependencies.lockGameSessionForMultiplayer({
        userId: 'wallet-user',
        gameSessionId: 'game-session-1',
      }),
    ).resolves.toBe(true);

    expect(findGameSession).toHaveBeenCalledWith({
      where: { sessionId: 'game-session-1' },
      select: {
        sessionId: true,
        userId: true,
        gameId: true,
        isActive: true,
        mode: true,
        rewardEligible: true,
      },
    });
    expect(updateGameSessions).toHaveBeenCalledWith({
      where: {
        sessionId: 'game-session-1',
        userId: 'wallet-user',
        gameId: 'sybil-slayer',
        isActive: true,
      },
      data: { mode: 'staging_unranked', rewardEligible: false },
    });
  });

  it('fails the lock when no exact active session was updated', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    updateGameSessions.mockResolvedValue({ count: 0 });
    findGameSession.mockResolvedValue(null);

    await expect(
      dependencies.lockGameSessionForMultiplayer({
        userId: 'wallet-user',
        gameSessionId: 'missing-session',
      }),
    ).resolves.toBe(false);
  });

  it('accepts an idempotent lock replay only when the exact session is still active and locked', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    updateGameSessions.mockResolvedValue({ count: 0 });
    findGameSession.mockResolvedValue({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
    });

    await expect(
      dependencies.lockGameSessionForMultiplayer({
        userId: 'wallet-user',
        gameSessionId: 'game-session-1',
      }),
    ).resolves.toBe(true);
    expect(findGameSession).toHaveBeenCalledWith({
      where: { sessionId: 'game-session-1' },
      select: {
        userId: true,
        gameId: true,
        isActive: true,
        mode: true,
        rewardEligible: true,
      },
    });
  });
});
