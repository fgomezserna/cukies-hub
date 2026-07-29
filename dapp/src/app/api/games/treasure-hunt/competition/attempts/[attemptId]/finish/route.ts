import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  parseEvidenceBody,
  readJsonObject,
  requireCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';

type RouteContext = { params: Promise<{ attemptId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const identity = await requireCompetitionIdentity();
    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'finish',
      identityKey: identity.walletAddress,
    });
    if (rateLimit) return rateLimit;
    const { attemptId } = await context.params;
    const evidence = parseEvidenceBody(await readJsonObject(request));
    const result = await getCompetitionService().finishAttempt({
      walletAddress: identity.walletAddress,
      attemptId,
      ...evidence,
    });
    return competitionJson({ success: true, result });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
