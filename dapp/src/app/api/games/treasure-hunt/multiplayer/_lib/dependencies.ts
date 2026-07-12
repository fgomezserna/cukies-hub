import 'server-only';

import {
  claimGameSessionForMultiplayer,
  confirmGameSessionForMultiplayerDirectly,
  releaseGameSessionForMultiplayerDirectly,
} from '@/lib/game-session-store';
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
          multiplayerState: true,
          multiplayerClientInstanceId: true,
        },
      }),
    lockGameSessionForMultiplayer: async ({ gameSessionId, userId, clientInstanceId }) => {
      const claimed = await claimGameSessionForMultiplayer({
        gameSessionId,
        userId,
        clientInstanceId,
      });
      if (claimed) {
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
          multiplayerState: true,
          multiplayerClientInstanceId: true,
        },
      });
      return Boolean(
        current?.userId === userId &&
          current.gameId === 'sybil-slayer' &&
          current.isActive &&
          current.mode === 'staging_unranked' &&
          current.rewardEligible === false &&
          current.multiplayerState === 'joining' &&
          current.multiplayerClientInstanceId === clientInstanceId,
      );
    },
    confirmGameSessionForMultiplayer: async ({ gameSessionId, userId, clientInstanceId }) => {
      const confirmed = await confirmGameSessionForMultiplayerDirectly({
        gameSessionId,
        userId,
        clientInstanceId,
      });
      if (confirmed) {
        return 'confirmed' as const;
      }

      const current = await prisma.gameSession.findUnique({
        where: { sessionId: gameSessionId },
        select: {
          userId: true,
          gameId: true,
          isActive: true,
          mode: true,
          rewardEligible: true,
          multiplayerState: true,
          multiplayerClientInstanceId: true,
        },
      });
      if (
        current?.userId === userId &&
          current.gameId === 'sybil-slayer' &&
          current.isActive &&
          current.mode === 'staging_unranked' &&
          current.rewardEligible === false &&
          current.multiplayerState === 'joined' &&
          current.multiplayerClientInstanceId === clientInstanceId
      ) {
        return 'confirmed' as const;
      }
      if (
        current?.userId === userId &&
        current.gameId === 'sybil-slayer' &&
        !current.isActive &&
        current.multiplayerState === 'released' &&
        current.multiplayerClientInstanceId === clientInstanceId
      ) {
        return 'released' as const;
      }
      return 'invalid' as const;
    },
    releaseGameSessionForMultiplayer: async ({ gameSessionId, userId, clientInstanceId }) => {
      const released = await releaseGameSessionForMultiplayerDirectly({
        gameSessionId,
        userId,
        clientInstanceId,
      });
      if (released) {
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
          multiplayerState: true,
          multiplayerClientInstanceId: true,
        },
      });
      return Boolean(
        current?.userId === userId &&
          current.gameId === 'sybil-slayer' &&
          !current.isActive &&
          current.mode === 'staging_unranked' &&
          current.rewardEligible === false &&
          current.multiplayerState === 'released' &&
          current.multiplayerClientInstanceId === clientInstanceId,
      );
    },
    consumeRateLimit: (input) => multiplayerRateLimiter.consume(input),
    getService: getTreasureHuntMultiplayerRuntime,
  };
}

export const treasureHuntMultiplayerHandlers = createTreasureHuntMultiplayerHandlers(
  createDefaultMultiplayerHandlerDependencies(),
);
