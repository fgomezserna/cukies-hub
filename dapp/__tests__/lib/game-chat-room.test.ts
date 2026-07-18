jest.mock('@/lib/prisma', () => ({
  prisma: {
    chatRoom: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import { getOrCreateWebGameChatRoom, isValidGameChatId } from '@/lib/game-chat-room';

describe('game chat rooms', () => {
  const create = prisma.chatRoom.create as jest.Mock;
  const findUnique = prisma.chatRoom.findUnique as jest.Mock;

  beforeEach(() => {
    create.mockReset();
    findUnique.mockReset();
  });

  it('creates a standalone web room without Telegram settings', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ id: 'room-1', gameId: 'sybil-slayer' });

    await getOrCreateWebGameChatRoom('sybil-slayer');

    expect(create).toHaveBeenCalledWith({
      data: {
        gameId: 'sybil-slayer',
        name: 'Treasure Hunt Chat',
        description: 'Chat web para jugadores de Treasure Hunt.',
      },
    });
  });

  it('returns the room created by a concurrent request after a unique conflict', async () => {
    findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'room-1', gameId: 'sybil-slayer' });
    create.mockRejectedValue({ code: 'P2002' });

    await expect(getOrCreateWebGameChatRoom('sybil-slayer')).resolves.toEqual({
      id: 'room-1',
      gameId: 'sybil-slayer',
    });
  });

  it('only accepts bounded game ids suitable for a chat room key', () => {
    expect(isValidGameChatId('tower-builder')).toBe(true);
    expect(isValidGameChatId('../admin')).toBe(false);
    expect(isValidGameChatId('')).toBe(false);
  });
});
