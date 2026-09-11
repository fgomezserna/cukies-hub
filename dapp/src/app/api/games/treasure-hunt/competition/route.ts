import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rateLimit = competitionRateLimitResponse({ request, operation: 'status' });
    if (rateLimit) return rateLimit;
    const service = getCompetitionService();
    const runtime = service.getRuntime();
    const identity = await readCompetitionIdentity();
    const weeklyAliasScope = new URL(request.url).searchParams.get('scope') === 'weekly';
    const participant = identity
      ? weeklyAliasScope
        ? await service.getWeeklyParticipant(identity.walletAddress)
        : runtime.campaign
          ? await service.getParticipant(identity.walletAddress)
          : null
      : null;
    const eligibility = !weeklyAliasScope && identity && runtime.campaign?.eligibilityKind === 'uki_staking'
      ? await service.getStakingEligibility(identity.walletAddress)
      : null;

    return competitionJson({
      success: true,
      configured: runtime.configured,
      enabled: runtime.enabled,
      phase: runtime.phase,
      campaign: runtime.campaign,
      participant,
      eligibility,
    });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
