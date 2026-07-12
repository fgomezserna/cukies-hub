import { type NextRequest } from 'next/server';

import { treasureHuntMultiplayerHandlers } from '../_lib/dependencies';

export async function POST(request: NextRequest) {
  return treasureHuntMultiplayerHandlers.createOrJoin(request);
}
