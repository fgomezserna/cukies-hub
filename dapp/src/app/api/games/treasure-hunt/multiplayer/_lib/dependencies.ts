import 'server-only';

import { prisma } from '@/lib/prisma';
import { getTreasureHuntMultiplayerRuntime } from '@/lib/treasure-hunt-multiplayer/server';
import { readWalletSession } from '@/lib/wallet-auth';

import {
  createTreasureHuntMultiplayerHandlers,
  type TreasureHuntMultiplayerHandlerDependencies,
} from './handlers';

export function createDefaultMultiplayerHandlerDependencies(): TreasureHuntMultiplayerHandlerDependencies {
  return {
    readWalletSession,
    findGameSessionBySessionId: (sessionId) =>
      prisma.gameSession.findUnique({
        where: { sessionId },
        select: {
          sessionId: true,
          userId: true,
          gameId: true,
          isActive: true,
        },
      }),
    getService: getTreasureHuntMultiplayerRuntime,
  };
}

export const treasureHuntMultiplayerHandlers = createTreasureHuntMultiplayerHandlers(
  createDefaultMultiplayerHandlerDependencies(),
);
