import {
  authorizeCompetitionInternalRequest,
  competitionInternalErrorResponse,
  competitionInternalJson,
} from '@/lib/treasure-hunt-competition/server/internal-api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = authorizeCompetitionInternalRequest(request);
  if (authError) return authError;

  try {
    const requestedLimit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
    const attempts = await getCompetitionService().listReviewAttempts(requestedLimit);
    return competitionInternalJson({ attempts });
  } catch (error) {
    return competitionInternalErrorResponse(error);
  }
}
