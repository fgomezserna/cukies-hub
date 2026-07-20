import { cookies } from 'next/headers';

import {
  competitionErrorResponse,
  competitionJson,
  competitionRateLimitResponse,
  readJsonObject,
  requireCompetitionIdentity,
} from '@/lib/treasure-hunt-competition/server/api';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const identity = await requireCompetitionIdentity();
    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'attempts',
      identityKey: identity.walletAddress,
    });
    if (rateLimit) return rateLimit;
    const requestedLimit = Number(new URL(request.url).searchParams.get('limit') ?? 100);
    const attempts = await getCompetitionService().listMyAttempts(
      identity.walletAddress,
      Number.isSafeInteger(requestedLimit) ? requestedLimit : 100,
    );
    return competitionJson({ success: true, attempts });
  } catch (error) {
    return competitionErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireCompetitionIdentity();
    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'start',
      identityKey: identity.walletAddress,
    });
    if (rateLimit) return rateLimit;
    const body = await readJsonObject(request);
    if (
      typeof body.gameSessionId !== 'string' ||
      body.gameSessionId.length < 8 ||
      body.gameSessionId.length > 128
    ) {
      return competitionJson({ success: false, error: 'INVALID_GAME_SESSION' }, 400);
    }
    const cookieStore = await cookies();
    const referralCode = cookieStore.get('ukiReferralCode')?.value ?? null;
    const attempt = await getCompetitionService().startAttempt({
      userId: identity.userId,
      walletAddress: identity.walletAddress,
      gameSessionId: body.gameSessionId,
      referralCode,
    });
    return competitionJson({ success: true, attempt }, 201);
  } catch (error) {
    return competitionErrorResponse(error);
  }
}
