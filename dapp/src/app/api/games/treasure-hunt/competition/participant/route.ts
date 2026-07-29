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
    const participant = await getCompetitionService().getParticipant(identity.walletAddress);
    return competitionJson({ success: true, participant });
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
    const participant = await getCompetitionService().updateAlias(
      identity.walletAddress,
      body.alias,
    );
    return competitionJson({ success: true, participant });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
