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
          multiplayerState: true,
          multiplayerClientInstanceId: true,
        },
      }),
    lockGameSessionForMultiplayer: async ({ gameSessionId, userId, clientInstanceId }) => {
      const result = await prisma.gameSession.updateMany({
        where: {
          sessionId: gameSessionId,
          userId,
          gameId: 'sybil-slayer',
          isActive: true,
          OR: [
            {
              multiplayerState: 'idle',
              OR: [
                { multiplayerClientInstanceId: clientInstanceId },
                { multiplayerClientInstanceId: null },
                { multiplayerClientInstanceId: { isSet: false } },
              ],
            },
            {
              multiplayerState: null,
              OR: [
                { multiplayerClientInstanceId: clientInstanceId },
                { multiplayerClientInstanceId: null },
                { multiplayerClientInstanceId: { isSet: false } },
              ],
            },
            {
              multiplayerState: { isSet: false },
              OR: [
                { multiplayerClientInstanceId: clientInstanceId },
                { multiplayerClientInstanceId: null },
                { multiplayerClientInstanceId: { isSet: false } },
              ],
            },
            {
              multiplayerState: 'joining',
              multiplayerClientInstanceId: clientInstanceId,
            },
            { multiplayerState: 'joined' },
          ],
        },
        data: {
          mode: 'staging_unranked',
          rewardEligible: false,
          multiplayerState: 'joining',
          multiplayerClientInstanceId: clientInstanceId,
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
      const result = await prisma.gameSession.updateMany({
        where: {
          sessionId: gameSessionId,
          userId,
          gameId: 'sybil-slayer',
          isActive: true,
          mode: 'staging_unranked',
          rewardEligible: false,
          multiplayerState: 'joining',
          multiplayerClientInstanceId: clientInstanceId,
        },
        data: { multiplayerState: 'joined' },
      });
      if (result.count === 1) {
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
      if (
        current?.userId === userId &&
        current.gameId === 'sybil-slayer' &&
        current.isActive &&
        (current.multiplayerState === 'joining' || current.multiplayerState === 'joined') &&
        current.multiplayerClientInstanceId !== clientInstanceId
      ) {
        return 'superseded' as const;
      }
      return 'invalid' as const;
    },
    releaseGameSessionForMultiplayer: async ({ gameSessionId, userId, clientInstanceId }) => {
      const endedAt = new Date();
      const result = await prisma.gameSession.updateMany({
        where: {
          sessionId: gameSessionId,
          userId,
          gameId: 'sybil-slayer',
          isActive: true,
          OR: [
            {
              multiplayerState: { in: ['joining', 'joined'] },
              multiplayerClientInstanceId: clientInstanceId,
            },
            {
              multiplayerState: 'idle',
              OR: [
                { multiplayerClientInstanceId: clientInstanceId },
                { multiplayerClientInstanceId: null },
                { multiplayerClientInstanceId: { isSet: false } },
              ],
            },
            {
              multiplayerState: null,
              OR: [
                { multiplayerClientInstanceId: clientInstanceId },
                { multiplayerClientInstanceId: null },
                { multiplayerClientInstanceId: { isSet: false } },
              ],
            },
            {
              multiplayerState: { isSet: false },
              OR: [
                { multiplayerClientInstanceId: clientInstanceId },
                { multiplayerClientInstanceId: null },
                { multiplayerClientInstanceId: { isSet: false } },
              ],
            },
          ],
        },
        data: {
          isActive: false,
          endedAt,
          mode: 'staging_unranked',
          rewardEligible: false,
          multiplayerState: 'released',
          multiplayerClientInstanceId: clientInstanceId,
        },
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
          (current.multiplayerState === 'released' || current.multiplayerState == null) &&
          (current.multiplayerClientInstanceId === clientInstanceId ||
            current.multiplayerClientInstanceId == null),
      );
    },
    consumeRateLimit: (input) => multiplayerRateLimiter.consume(input),
    getService: getTreasureHuntMultiplayerRuntime,
  };
}

export const treasureHuntMultiplayerHandlers = createTreasureHuntMultiplayerHandlers(
  createDefaultMultiplayerHandlerDependencies(),
);
