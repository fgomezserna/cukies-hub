import { competitionJson } from '@/lib/treasure-hunt-competition/server/api';
import { parseCompetitionRankingArchiveQuery } from '@/lib/treasure-hunt-competition/server/archive-api';
import { getCompetitionRankingArchiveService } from '@/lib/treasure-hunt-competition/server/archive-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const query = parseCompetitionRankingArchiveQuery(request);
    const history = await getCompetitionRankingArchiveService().listHistory({
      page: query.page,
      pageSize: query.pageSize,
      stage: query.stage ?? undefined,
    });
    return competitionJson({ success: true, ...history });
  } catch (error) {
    if (error instanceof RangeError || error instanceof TypeError) {
      return competitionJson({ success: false, error: 'INVALID_QUERY', message: error.message }, 400);
    }
    console.error('Treasure Hunt competition history request failed');
    return competitionJson({ success: false, error: 'INTERNAL_ERROR' }, 500);
  }
}
