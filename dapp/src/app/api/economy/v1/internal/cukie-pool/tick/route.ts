import { NextResponse } from 'next/server';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import {
  CukiePoolRuntimeBusyError,
  CukiePoolRuntimeConfigurationError,
  runCukiePoolRuntimeTick,
} from '@/lib/uki-economy/cukie-pool/runtime';
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from '@/lib/uki-economy/internal-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PATH = '/api/economy/v1/internal/cukie-pool/tick';

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError('INVALID_REQUEST', `Falta header ${name}.`);
  return value;
}

function parsePayload(rawBody: Buffer) {
  if (rawBody.byteLength === 0) return { workerId: 'cukie-pool-scheduler' };
  const value = JSON.parse(rawBody.toString('utf8')) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SyntaxError('El payload debe ser un objeto JSON.');
  }
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== 'workerId') {
    throw new SyntaxError('El payload solo acepta workerId.');
  }
  const workerId = (value as { workerId?: unknown }).workerId;
  if (
    typeof workerId !== 'string'
    || workerId.trim() !== workerId
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(workerId)
  ) {
    throw new SyntaxError('workerId no es valido.');
  }
  return { workerId };
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
    return NextResponse.json(await runCukiePoolRuntimeTick(parsePayload(rawBody)));
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
    if (error instanceof CukiePoolRuntimeBusyError) {
      return NextResponse.json(
        { status: 'busy', code: 'CUKIE_POOL_RUNTIME_BUSY' },
        { status: 409 },
      );
    }
    if (error instanceof CukiePoolRuntimeConfigurationError) {
      return NextResponse.json(
        { status: 'error', code: 'CUKIE_POOL_RUNTIME_CONFIGURATION' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_POOL_RUNTIME_TICK_FAILED' },
      { status: 503 },
    );
  }
}
