import { NextResponse } from 'next/server';

import {
  getCompetitionReviewSecret,
  hasValidCompetitionInternalAuthorization,
} from './internal-auth';
import { CompetitionServiceError } from './service';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function competitionInternalJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

export function competitionInternalError(status: number, code: string, message: string) {
  return competitionInternalJson({ error: { code, message } }, status);
}

export function authorizeCompetitionInternalRequest(request: Request) {
  const secret = getCompetitionReviewSecret();
  if (!secret) {
    return competitionInternalError(
      503,
      'COMPETITION_INTERNAL_NOT_CONFIGURED',
      'Competition internal operations are not configured',
    );
  }
  if (!hasValidCompetitionInternalAuthorization(request, secret)) {
    return competitionInternalError(401, 'UNAUTHORIZED', 'Unauthorized');
  }
  return null;
}

export function competitionInternalErrorResponse(error: unknown) {
  if (error instanceof CompetitionServiceError) {
    return competitionInternalError(error.status, error.code, error.message);
  }
  console.error('Treasure Hunt competition internal request failed', {
    errorName: error instanceof Error ? error.name : 'UnknownError',
  });
  return competitionInternalError(500, 'INTERNAL_ERROR', 'Internal server error');
}
