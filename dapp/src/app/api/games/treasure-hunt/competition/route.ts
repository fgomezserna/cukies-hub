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
    const participant = identity && runtime.campaign
      ? await service.getParticipant(identity.walletAddress)
      : null;

    return competitionJson({
      success: true,
      configured: runtime.configured,
      enabled: runtime.enabled,
      phase: runtime.phase,
      campaign: runtime.campaign,
      participant,
    });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
