import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readJsonObject,
  requireCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await requireCompetitionIdentity();
    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'participant',
      identityKey: identity.walletAddress,
    });
    if (rateLimit) return rateLimit;
    const service = getCompetitionService();
    const weeklyAliasScope = new URL(request.url).searchParams.get('scope') === 'weekly';
    const participant = weeklyAliasScope
      ? await service.getWeeklyParticipant(identity.walletAddress)
      : await service.getParticipant(identity.walletAddress);
    const eligibility = weeklyAliasScope
      ? null
      : await service.getStakingEligibility(identity.walletAddress);
    return competitionJson({ success: true, participant, eligibility });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireCompetitionIdentity();
    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'participant',
      identityKey: identity.walletAddress,
    });
    if (rateLimit) return rateLimit;
    const body = await readJsonObject(request);
    if (typeof body.alias !== 'string') {
      return competitionJson({ success: false, error: 'INVALID_ALIAS' }, 400);
    }
    const service = getCompetitionService();
    const weeklyAliasScope = new URL(request.url).searchParams.get('scope') === 'weekly';
    const participant = weeklyAliasScope
      ? await service.updateWeeklyAlias(identity.walletAddress, body.alias)
      : await service.updateAlias(identity.walletAddress, body.alias);
    return competitionJson({ success: true, participant });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
