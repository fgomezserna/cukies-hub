import { type NextRequest } from 'next/server';

import { treasureHuntMultiplayerHandlers } from '../../_lib/dependencies';

interface MatchRouteContext {
  readonly params: Promise<{ matchId: string }>;
}

export async function GET(request: NextRequest, context: MatchRouteContext) {
  const { matchId } = await context.params;
  return treasureHuntMultiplayerHandlers.get(request, matchId);
}

export async function POST(request: NextRequest, context: MatchRouteContext) {
  const { matchId } = await context.params;
  return treasureHuntMultiplayerHandlers.operate(request, matchId);
}
