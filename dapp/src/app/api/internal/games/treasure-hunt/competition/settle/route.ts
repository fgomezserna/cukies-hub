import { NextResponse } from 'next/server';

import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import {
  getCompetitionSettlementSecret,
  hasValidCompetitionInternalAuthorization,
} from '@/lib/treasure-hunt-competition/server/internal-auth';
import { resolveCompetitionRuntime } from '@/lib/treasure-hunt-competition/server/runtime';
import {
  closeTreasureHuntCompetition,
  CompetitionSettlementCloseError,
} from '@/lib/treasure-hunt-competition/server/settlement-close';
import {
  MongoCompetitionSettlementRepository,
  MongoCompetitionSettlementSource,
} from '@/lib/treasure-hunt-competition/server/settlement-mongo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: NO_STORE_HEADERS },
  );
}

function publicCloseError(error: CompetitionSettlementCloseError) {
  switch (error.code) {
    case 'competition_not_closed':
      return errorResponse(
        409,
        'COMPETITION_NOT_CLOSED',
        'Competition cannot be settled before it is closed',
      );
    case 'invalid_settlement_input':
      return errorResponse(
        422,
        'INVALID_SETTLEMENT_INPUT',
        'Competition settlement input is invalid',
      );
    case 'settlement_source_not_ready':
      return errorResponse(
        409,
        'SETTLEMENT_SOURCE_NOT_READY',
        'Competition settlement source is not ready',
      );
    case 'settlement_input_conflict':
      return errorResponse(
        409,
        'SETTLEMENT_INPUT_CONFLICT',
        'A different settlement snapshot already exists',
      );
  }
}

export async function POST(request: Request) {
  const secret = getCompetitionSettlementSecret();
  if (!secret) {
    return errorResponse(
      503,
      'SETTLEMENT_NOT_CONFIGURED',
      'Competition settlement is not configured',
    );
  }
  if (!hasValidCompetitionInternalAuthorization(request, secret)) {
    return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized');
  }

  const now = new Date();
  try {
    const competitionRuntime = resolveCompetitionRuntime(process.env, now);
    const source = new MongoCompetitionSettlementSource();
    const repository = new MongoCompetitionSettlementRepository();

    const result = await closeTreasureHuntCompetition({
      runtime: competitionRuntime,
      source,
      repository,
      prepareSource: async () => {
        const recovery = await getCompetitionService().recoverPendingFinishes();
        if (!recovery.complete) {
          throw new CompetitionSettlementCloseError(
            'settlement_source_not_ready',
            'Competition finish recovery is incomplete',
          );
        }
      },
      now,
    });

    return NextResponse.json(
      {
        created: result.created,
        idempotent: !result.created,
        snapshot: result.snapshot,
      },
      { status: result.created ? 201 : 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof CompetitionSettlementCloseError) return publicCloseError(error);

    console.error('Treasure Hunt competition settlement failed', {
      errorName: error instanceof Error ? error.name : 'UnknownError',
    });
    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error');
  }
}
