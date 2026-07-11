import 'server-only';

import { prisma } from '@/lib/prisma';
import { getTreasureHuntMultiplayerRuntime } from '@/lib/treasure-hunt-multiplayer/server';
import { readWalletSession } from '@/lib/wallet-auth';

import {
  createTreasureHuntMultiplayerHandlers,
  isTreasureHuntMultiplayerFeatureEnabled,
  type TreasureHuntMultiplayerHandlerDependencies,
} from './handlers';
import { MultiplayerFixedWindowRateLimiter } from './rate-limit';

const multiplayerRateLimiter = new MultiplayerFixedWindowRateLimiter();

export function createDefaultMultiplayerHandlerDependencies(): TreasureHuntMultiplayerHandlerDependencies {
  return {
    isFeatureEnabled: isTreasureHuntMultiplayerFeatureEnabled,
    readWalletSession,
    findGameSessionBySessionId: (sessionId) =>
      prisma.gameSession.findUnique({
        where: { sessionId },
        select: {
          sessionId: true,
          userId: true,
          gameId: true,
          isActive: true,
          mode: true,
          rewardEligible: true,
        },
      }),
    lockGameSessionForMultiplayer: async ({ gameSessionId, userId }) => {
      const result = await prisma.gameSession.updateMany({
        where: {
          sessionId: gameSessionId,
          userId,
          gameId: 'sybil-slayer',
          isActive: true,
        },
        data: {
          mode: 'staging_unranked',
          rewardEligible: false,
        },
      });
      if (result.count === 1) {
        return true;
      }

      // Mongo may report zero modified documents when an idempotent replay writes the
      // exact same values. Re-read the authority fields and fail closed on every other case.
      const current = await prisma.gameSession.findUnique({
        where: { sessionId: gameSessionId },
        select: {
          userId: true,
          gameId: true,
          isActive: true,
          mode: true,
          rewardEligible: true,
        },
      });
      return Boolean(
        current?.userId === userId &&
          current.gameId === 'sybil-slayer' &&
          current.isActive &&
          current.mode === 'staging_unranked' &&
          current.rewardEligible === false,
      );
    },
    releaseGameSessionForMultiplayer: async ({ gameSessionId, userId }) => {
      const endedAt = new Date();
      const result = await prisma.gameSession.updateMany({
        where: {
          sessionId: gameSessionId,
          userId,
          gameId: 'sybil-slayer',
          isActive: true,
          mode: 'staging_unranked',
          rewardEligible: false,
        },
        data: { isActive: false, endedAt },
      });
      if (result.count === 1) {
        return true;
      }
      const current = await prisma.gameSession.findUnique({
        where: { sessionId: gameSessionId },
        select: {
          userId: true,
          gameId: true,
          isActive: true,
          mode: true,
          rewardEligible: true,
        },
      });
      return Boolean(
        current?.userId === userId &&
          current.gameId === 'sybil-slayer' &&
          !current.isActive &&
          current.mode === 'staging_unranked' &&
          current.rewardEligible === false,
      );
    },
    consumeRateLimit: (input) => multiplayerRateLimiter.consume(input),
    getService: getTreasureHuntMultiplayerRuntime,
  };
}

export const treasureHuntMultiplayerHandlers = createTreasureHuntMultiplayerHandlers(
  createDefaultMultiplayerHandlerDependencies(),
);
