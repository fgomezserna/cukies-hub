import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readJsonObject,
  requireCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { CompetitionServiceError } from '@/lib/treasure-hunt-competition/server/service';

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
    const body = await readJsonObject(request);
    if (
      typeof body.receipt !== 'string' ||
      body.receipt.length === 0 ||
      body.receipt.length > 4_096 ||
      !Number.isSafeInteger(body.sequence)
    ) {
      throw new CompetitionServiceError(
        'INVALID_EVIDENCE',
        'Invalid competition abandon body',
        400,
      );
    }
    const result = await getCompetitionService().abandonAttempt({
      walletAddress: identity.walletAddress,
      attemptId,
      receipt: body.receipt,
      sequence: Number(body.sequence),
    });
    return competitionJson({ success: true, result });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
