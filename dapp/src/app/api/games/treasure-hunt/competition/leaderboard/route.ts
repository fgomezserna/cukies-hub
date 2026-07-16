import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rateLimit = competitionRateLimitResponse({ request, operation: 'leaderboard' });
    if (rateLimit) return rateLimit;
    const identity = await readCompetitionIdentity();
    const requestedLimit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
    const leaderboard = await getCompetitionService().getLeaderboard(
      identity?.walletAddress,
      Number.isSafeInteger(requestedLimit) ? requestedLimit : 100,
    );
    return competitionJson({ success: true, ...leaderboard });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
