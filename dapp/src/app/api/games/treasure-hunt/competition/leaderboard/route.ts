import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import {
  buildCompetitionLeaderboardWithRewards,
} from '@/lib/treasure-hunt-competition/server/leaderboard-rewards';
import { MongoCompetitionRewardSource } from '@/lib/treasure-hunt-competition/server/leaderboard-rewards-mongo';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rateLimit = competitionRateLimitResponse({ request, operation: 'leaderboard' });
    if (rateLimit) return rateLimit;
    const identity = await readCompetitionIdentity();
    const searchParams = new URL(request.url).searchParams;
    const legacyLimit = searchParams.get('limit');
    const requestedPageSize = Number(searchParams.get('pageSize') ?? legacyLimit ?? 20);
    const requestedPage = Number(searchParams.get('page') ?? 1);
    const service = getCompetitionService();
    const allocation = await service.getLeaderboardAllocationInput(500);
    const leaderboard = await buildCompetitionLeaderboardWithRewards({
      allocation,
      source: new MongoCompetitionRewardSource(),
      currentWalletAddress: identity?.walletAddress,
      page: Number.isSafeInteger(requestedPage) ? requestedPage : 1,
      pageSize: Number.isSafeInteger(requestedPageSize) ? requestedPageSize : 20,
      mineOnly: searchParams.get('mine') === '1',
    });
    return competitionJson({ success: true, ...leaderboard });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
