jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatRoom: {
      upsert: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { getOrCreateWebGameChatRoom, isValidGameChatId } from '@/lib/game-chat-room';

describe('game chat rooms', () => {
  const upsert = prisma.chatRoom.upsert as jest.Mock;

  beforeEach(() => {
    upsert.mockReset();
  });

  it('creates a standalone web room without Telegram settings', async () => {
    upsert.mockResolvedValue({ id: 'room-1', gameId: 'sybil-slayer' });

    await getOrCreateWebGameChatRoom('sybil-slayer');

    expect(upsert).toHaveBeenCalledWith({
      where: { gameId: 'sybil-slayer' },
      create: {
        gameId: 'sybil-slayer',
        name: 'Treasure Hunt Chat',
        description: 'Chat web para jugadores de Treasure Hunt.',
      },
      update: {},
    });
  });

  it('only accepts bounded game ids suitable for a chat room key', () => {
    expect(isValidGameChatId('tower-builder')).toBe(true);
    expect(isValidGameChatId('../admin')).toBe(false);
    expect(isValidGameChatId('')).toBe(false);
  });
});
