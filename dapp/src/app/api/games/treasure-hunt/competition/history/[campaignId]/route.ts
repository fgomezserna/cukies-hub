import { competitionJson } from '@/lib/treasure-hunt-competition/server/api';
import { parseCompetitionRankingArchiveQuery } from '@/lib/treasure-hunt-competition/server/archive-api';
import {
  CompetitionRankingArchiveNotFoundError,
  getCompetitionRankingArchiveService,
} from '@/lib/treasure-hunt-competition/server/archive-service';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: { params: Promise<{ campaignId: string }> },
) {
  try {
    const query = parseCompetitionRankingArchiveQuery(request);
    const { campaignId } = await context.params;
    const history = await getCompetitionRankingArchiveService().getHistory({
      campaignId,
      page: query.page,
      pageSize: query.pageSize,
      stage: query.stage ?? undefined,
    });
    return competitionJson({ success: true, ...history });
  } catch (error) {
    if (error instanceof CompetitionRankingArchiveNotFoundError) {
      return competitionJson({ success: false, error: 'ARCHIVE_NOT_FOUND' }, 404);
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return competitionJson({ success: false, error: 'INVALID_QUERY', message: error.message }, 400);
    }
    console.error('Treasure Hunt competition history detail request failed');
    return competitionJson({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
}
