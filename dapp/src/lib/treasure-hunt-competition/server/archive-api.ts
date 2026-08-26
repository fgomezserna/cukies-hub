import type { CompetitionRankingArchiveStage } from '../archive';

const ALLOWED_STAGES = new Set<CompetitionRankingArchiveStage>(['provisional', 'final']);

export function parseCompetitionRankingArchiveQuery(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const rawPage = searchParams.get('page') ?? '1';
  const rawPageSize = searchParams.get('pageSize') ?? '20';
  if (!/^\d+$/.test(rawPage) || !/^\d+$/.test(rawPageSize)) {
    throw new RangeError('Archive pagination must use positive integers');
  }
  const page = Number(rawPage);
  const pageSize = Number(rawPageSize);
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('Archive page must be a positive safe integer');
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new RangeError('Archive pageSize must be between 1 and 100');
  }
  const rawStage = searchParams.get('stage');
  if (rawStage !== null && !ALLOWED_STAGES.has(rawStage as CompetitionRankingArchiveStage)) {
    throw new TypeError('Archive stage must be provisional or final');
  }
  return {
    page,
    pageSize,
    stage: rawStage as CompetitionRankingArchiveStage | null,
  };
}
