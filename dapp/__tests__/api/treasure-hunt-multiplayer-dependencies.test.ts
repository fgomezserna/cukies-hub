jest.mock('server-only', () => ({}), { virtual: true });

jest.mock('@/lib/prisma', () => ({
  prisma: {
    gameSession: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/game-session-store', () => ({
  claimGameSessionForMultiplayer: jest.fn(),
  confirmGameSessionForMultiplayerDirectly: jest.fn(),
  releaseGameSessionForMultiplayerDirectly: jest.fn(),
}));

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));

jest.mock('@/lib/treasure-hunt-multiplayer/server', () => ({
  getTreasureHuntMultiplayerRuntime: jest.fn(),
}));

import { createDefaultMultiplayerHandlerDependencies } from '@/app/api/games/treasure-hunt/multiplayer/_lib/dependencies';
import {
  claimGameSessionForMultiplayer,
  confirmGameSessionForMultiplayerDirectly,
  releaseGameSessionForMultiplayerDirectly,
} from '@/lib/game-session-store';
import { prisma } from '@/lib/prisma';

const findGameSession = prisma.gameSession.findUnique as unknown as jest.Mock;
const claimGameSession = claimGameSessionForMultiplayer as unknown as jest.Mock;
const confirmGameSession = confirmGameSessionForMultiplayerDirectly as unknown as jest.Mock;
const releaseGameSession = releaseGameSessionForMultiplayerDirectly as unknown as jest.Mock;
const identity = {
  userId: 'wallet-user',
  gameSessionId: 'game-session-1',
  clientInstanceId: 'client-instance-1',
};

describe('Treasure Hunt multiplayer default dependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    claimGameSession.mockResolvedValue(false);
    confirmGameSession.mockResolvedValue(false);
    releaseGameSession.mockResolvedValue(false);
  });

  it('loads durable authority fields and atomically claims the active owned session', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValue({ sessionId: 'game-session-1' });
    claimGameSession.mockResolvedValue(true);

    await dependencies.findGameSessionBySessionId('game-session-1');
    await expect(dependencies.lockGameSessionForMultiplayer(identity)).resolves.toBe(true);

    expect(findGameSession).toHaveBeenCalledWith({
      where: { sessionId: 'game-session-1' },
      select: {
        sessionId: true,
        userId: true,
        gameId: true,
        isActive: true,
        mode: true,
        rewardEligible: true,
        multiplayerState: true,
        multiplayerClientInstanceId: true,
      },
    });
    expect(claimGameSession).toHaveBeenCalledWith(identity);
  });

  it('fails a claim when no exact active safe state was updated', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValue(null);

    await expect(dependencies.lockGameSessionForMultiplayer(identity)).resolves.toBe(false);
  });

  it('replays an in-progress claim only for the exact iframe client', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValue({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'joining',
      multiplayerClientInstanceId: 'client-instance-1',
    });

    await expect(dependencies.lockGameSessionForMultiplayer(identity)).resolves.toBe(true);
    await expect(
      dependencies.lockGameSessionForMultiplayer({
        ...identity,
        clientInstanceId: 'stale-iframe-client',
      }),
    ).resolves.toBe(false);
    expect(claimGameSession).toHaveBeenNthCalledWith(1, identity);
    expect(claimGameSession).toHaveBeenNthCalledWith(2, {
      ...identity,
      clientInstanceId: 'stale-iframe-client',
    });
  });

  it('rejects ABA takeover of a joined lease by a different client', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValue({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'joined',
      multiplayerClientInstanceId: 'client-instance-1',
    });

    await expect(
      dependencies.lockGameSessionForMultiplayer({
        ...identity,
        clientInstanceId: 'new-iframe-client',
      }),
    ).resolves.toBe(false);
    expect(claimGameSession).toHaveBeenCalledWith({
      ...identity,
      clientInstanceId: 'new-iframe-client',
    });
  });

  it('confirms only an exact active durable join claim', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    confirmGameSession.mockResolvedValue(true);

    await expect(dependencies.confirmGameSessionForMultiplayer(identity)).resolves.toBe('confirmed');

    expect(confirmGameSession).toHaveBeenCalledWith(identity);
  });

  it('distinguishes idempotent confirm and a released tombstone', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValueOnce({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'joined',
      multiplayerClientInstanceId: 'client-instance-1',
    }).mockResolvedValueOnce({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: false,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'released',
      multiplayerClientInstanceId: 'client-instance-1',
    });

    await expect(dependencies.confirmGameSessionForMultiplayer(identity)).resolves.toBe('confirmed');
    await expect(dependencies.confirmGameSessionForMultiplayer(identity)).resolves.toBe('released');
  });

  it('atomically tombstones an active normal or claimed session before match cleanup', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    releaseGameSession.mockResolvedValue(true);

    await expect(dependencies.releaseGameSessionForMultiplayer(identity)).resolves.toBe(true);

    expect(releaseGameSession).toHaveBeenCalledWith(identity);
  });

  it('accepts only the exact inactive release replay and fails closed for legacy rows', async () => {
    const dependencies = createDefaultMultiplayerHandlerDependencies();
    findGameSession.mockResolvedValueOnce({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: false,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'released',
      multiplayerClientInstanceId: 'client-instance-1',
    }).mockResolvedValueOnce({
      userId: 'wallet-user',
      gameId: 'sybil-slayer',
      isActive: false,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: null,
      multiplayerClientInstanceId: null,
    }).mockResolvedValueOnce({
      userId: 'other-wallet',
      gameId: 'sybil-slayer',
      isActive: false,
      mode: 'staging_unranked',
      rewardEligible: false,
      multiplayerState: 'released',
      multiplayerClientInstanceId: 'client-instance-1',
    });

    await expect(dependencies.releaseGameSessionForMultiplayer(identity)).resolves.toBe(true);
    await expect(dependencies.releaseGameSessionForMultiplayer(identity)).resolves.toBe(false);
    await expect(dependencies.releaseGameSessionForMultiplayer(identity)).resolves.toBe(false);
  });
});
