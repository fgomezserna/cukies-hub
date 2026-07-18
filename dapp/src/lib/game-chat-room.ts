import { prisma } from '@/lib/prisma';

const GAME_CHAT_DETAILS: Record<string, { name: string; description: string }> = {
  'sybil-slayer': {
    name: 'Treasure Hunt Chat',
    description: 'Chat web para jugadores de Treasure Hunt.',
  },
  'hyppie-road': {
    name: 'Hyppie Road Chat',
    description: 'Chat web para jugadores de Hyppie Road.',
  },
  'tower-builder': {
    name: 'Hyppie Tower Chat',
    description: 'Chat web para jugadores de Hyppie Tower.',
  },
};

export function isValidGameChatId(gameId: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(gameId);
}

/** A game chat is provisioned in the web app, independently of Telegram. */
export async function getOrCreateWebGameChatRoom(gameId: string) {
  if (!isValidGameChatId(gameId)) {
    throw new Error('Invalid game chat id');
  }

  const details = GAME_CHAT_DETAILS[gameId] ?? {
    name: `${gameId.replace(/-/g, ' ')} chat`,
    description: `Chat web para jugadores de ${gameId.replace(/-/g, ' ')}.`,
  };

  return prisma.chatRoom.upsert({
    where: { gameId },
    create: {
      gameId,
      name: details.name,
      description: details.description,
    },
    update: {},
  });
}
