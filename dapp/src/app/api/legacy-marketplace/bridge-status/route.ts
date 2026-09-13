import { NextRequest, NextResponse } from 'next/server';

import {
  getLegacyBridgeStatus,
  normalizeBridgeSourceEventIndex,
  normalizeBridgeSourceTxHash,
} from '@/lib/legacy-marketplace/bridge-status';

export const dynamic = 'force-dynamic';

function json(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      // A status transition must be observable without a proxy/browser cache
      // hiding a previous relayer state.
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
export async function GET(request: NextRequest) {
  const sourceTxHash = normalizeBridgeSourceTxHash(
    request.nextUrl.searchParams.get('sourceTxHash'),
  );
  const rawEventIndex = request.nextUrl.searchParams.get('sourceEventIndex');
  const sourceEventIndex = normalizeBridgeSourceEventIndex(rawEventIndex);

  if (!sourceTxHash) {
    return json(
      {
        status: 'invalid_request',
        code: 'BRIDGE_SOURCE_TX_HASH_INVALID',
      },
      400,
    );
  }

  if (rawEventIndex !== null && sourceEventIndex === null) {
    return json(
      {
        status: 'invalid_request',
        code: 'BRIDGE_SOURCE_EVENT_INDEX_INVALID',
      },
      400,
    );
  }

  try {
    return json(await getLegacyBridgeStatus(sourceTxHash, sourceEventIndex));
  } catch {
    // Do not expose Mongo URLs, topology details or credentials in a public
    // status response. The client keeps the confirmed source transaction
    // visible and can retry this read later.
    return json(
      {
        status: 'unavailable',
        code: 'BRIDGE_STATUS_UNAVAILABLE',
        sourceTxHash,
        sourceEventIndex,
      },
      503,
    );
  }
}
