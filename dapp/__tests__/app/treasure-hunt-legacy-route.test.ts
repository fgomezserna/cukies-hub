const mockRedirect = jest.fn((_target: string) => {
  throw new Error('NEXT_REDIRECT');
});

jest.mock('next/navigation', () => ({
  redirect: (target: string) => mockRedirect(target),
}));

import LegacyTreasureHuntRoute from '@/app/(app)/games/sybil-slayer/page';

describe('ruta antigua de Treasure Hunt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirige a la ruta canónica y conserva los parámetros de invitación', async () => {
    await expect(LegacyTreasureHuntRoute({
      searchParams: Promise.resolve({
        room: 'ROOM 42',
        campaign: ['launch', 'bonus'],
      }),
    })).rejects.toThrow('NEXT_REDIRECT');

    expect(mockRedirect).toHaveBeenCalledWith(
      '/games/treasure-hunt?room=ROOM+42&campaign=launch&campaign=bonus',
    );
  });
});
