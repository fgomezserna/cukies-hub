jest.mock('server-only', () => ({}), { virtual: true });

import {
  createTreasureHuntMultiplayerRuntime,
  getTreasureHuntMultiplayerRuntime,
} from '@/lib/treasure-hunt-multiplayer/server';

describe('Treasure Hunt multiplayer server runtime', () => {
  it('is a singleton by default', () => {
    expect(getTreasureHuntMultiplayerRuntime()).toBe(getTreasureHuntMultiplayerRuntime());
  });

  it('does not connect or create indexes while the runtime module/factory is initialized', async () => {
    const unavailable = new Error('database unavailable');
    const collectionProvider = jest.fn().mockRejectedValue(unavailable);
    const service = createTreasureHuntMultiplayerRuntime({
      mongoRepositoryOptions: { collectionProvider },
    });

    expect(collectionProvider).not.toHaveBeenCalled();

    await expect(
      service.getForParticipant({
        matchId: 'match-1',
        userId: 'user-1',
        gameSessionId: 'session-1',
      }),
    ).rejects.toBe(unavailable);
    expect(collectionProvider).toHaveBeenCalledTimes(1);
  });
});
