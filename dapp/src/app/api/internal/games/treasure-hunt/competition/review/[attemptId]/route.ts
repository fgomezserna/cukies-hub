import {
  authorizeCompetitionInternalRequest,
  competitionInternalError,
  competitionInternalErrorResponse,
  competitionInternalJson,
} from '@/lib/treasure-hunt-competition/server/internal-api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { getCompetitionReviewActor } from '@/lib/treasure-hunt-competition/server/internal-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ attemptId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const authError = authorizeCompetitionInternalRequest(request);
  if (authError) return authError;

  try {
    const { attemptId } = await context.params;
    const attempt = await getCompetitionService().getAttemptForReview(attemptId);
    return competitionInternalJson({ attempt });
  } catch (error) {
    return competitionInternalErrorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const authError = authorizeCompetitionInternalRequest(request);
  if (authError) return authError;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return competitionInternalError(400, 'INVALID_REVIEW', 'Request body must be valid JSON');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return competitionInternalError(400, 'INVALID_REVIEW', 'Request body must be an object');
    }
    const { attemptId } = await context.params;
    const input = body as Record<string, unknown>;
    const reviewer = getCompetitionReviewActor();
    if (!reviewer) {
      return competitionInternalError(
        503,
        'COMPETITION_INTERNAL_NOT_CONFIGURED',
        'Competition internal operations are not configured',
      );
    }
    const result = await getCompetitionService().adjudicateAttempt({
      attemptId,
      decision: input.decision as 'valid' | 'invalid',
      reason: input.reason as string,
      reviewer,
    });
    return competitionInternalJson(result);
  } catch (error) {
    return competitionInternalErrorResponse(error);
  }
}
