import 'server-only';

import { prisma } from '@/lib/prisma';
import { applyPresaleReferralCode } from '@/lib/presale-referrals';
import {
  claimGameSessionForCompetition,
  finishGameSessionForCompetition,
  releaseGameSessionForCompetition,
} from '@/lib/game-session-store';

import { MongoCompetitionRepository } from './mongo-repository';
import { createCompetitionService } from './service';

declare global {
  // eslint-disable-next-line no-var
  var treasureHuntCompetitionService:
    | ReturnType<typeof createCompetitionService>
    | undefined;
}

function buildCompetitionService() {
  return createCompetitionService({
    repository: new MongoCompetitionRepository(),
    findGameSession: async (gameSessionId) => {
      const session = await prisma.gameSession.findUnique({
        where: { sessionId: gameSessionId },
        select: {
          sessionId: true,
          userId: true,
          gameId: true,
          isActive: true,
          mode: true,
          rewardEligible: true,
          competitionAttemptId: true,
        },
      });
      if (!session) return null;
      return {
        gameSessionId: session.sessionId,
        userId: session.userId,
        gameId: session.gameId,
        isActive: session.isActive,
        mode: session.mode ?? 'legacy',
        rewardEligible: session.rewardEligible === true,
        competitionAttemptId: session.competitionAttemptId,
      };
    },
    applyReferral: applyPresaleReferralCode,
    claimGameSession: claimGameSessionForCompetition,
    finishGameSession: finishGameSessionForCompetition,
    releaseGameSession: releaseGameSessionForCompetition,
  });
}

export function getCompetitionService() {
  if (!global.treasureHuntCompetitionService) {
    global.treasureHuntCompetitionService = buildCompetitionService();
  }
  return global.treasureHuntCompetitionService;
}
