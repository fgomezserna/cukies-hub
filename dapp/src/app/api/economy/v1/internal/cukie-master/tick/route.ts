import { NextResponse } from 'next/server';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from '@/lib/uki-economy/internal-auth';
import {
  CukieMasterRuntimeBusyError,
  runCukieMasterRuntimeTick,
} from '@/lib/uki-economy/cukie-master/runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PATH = '/api/economy/v1/internal/cukie-master/tick';

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError('INVALID_REQUEST', `Falta header ${name}.`);
  return value;
}

export async function POST(request: Request) {
  try {
    const rawBody = await readLimitedInternalEconomyRequestBody(request);
    const db = await getEconomyDb();
    await verifyAndConsumeInternalEconomyRequest({
      request: {
        method: 'POST',
        path: PATH,
        timestamp: requiredHeader(request, 'x-economy-timestamp'),
        nonce: requiredHeader(request, 'x-economy-nonce'),
        keyId: requiredHeader(request, 'x-economy-key-id'),
        signature: requiredHeader(request, 'x-economy-signature'),
        rawBody,
      },
      config: loadInternalEconomyAuthConfig(),
      nonces: createMongoInternalEconomyNonceRepository(db),
    });
    const payload = rawBody.byteLength > 0
      ? JSON.parse(rawBody.toString('utf8')) as { workerId?: unknown; queueLimit?: unknown }
      : {};
    const workerId = typeof payload.workerId === 'string' && payload.workerId.trim()
      ? payload.workerId.trim().slice(0, 128)
      : 'cukie-master-scheduler';
    const queueLimit = typeof payload.queueLimit === 'number' ? payload.queueLimit : undefined;
    const result = await runCukieMasterRuntimeTick({ workerId, queueLimit });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: 'error', code: error.code },
        { status: error.code === 'CONFIGURATION' ? 503 : 401 },
      );
    }
    if (error instanceof SyntaxError) {
      return NextResponse.json({ status: 'error', code: 'INVALID_JSON' }, { status: 400 });
    }
    if (error instanceof CukieMasterRuntimeBusyError) {
      return NextResponse.json(
        { status: 'busy', code: 'CUKIE_MASTER_RUNTIME_BUSY' },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_MASTER_RUNTIME_TICK_FAILED' },
      { status: 503 },
    );
  }
}
