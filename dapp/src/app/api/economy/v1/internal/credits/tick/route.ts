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
  CompetitionCreditRuntimeBusyError,
  CompetitionCreditRuntimeConfigurationError,
  runCompetitionCreditRuntimeTick,
} from '@/lib/uki-economy/credits/runtime';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PATH = '/api/economy/v1/internal/credits/tick';

function requiredHeader(request: Request, name: string) {
  const value = request.headers.get(name)?.trim();
  if (!value) throw new InternalEconomyAuthError('INVALID_REQUEST', `Falta header ${name}.`);
  return value;
}

function parsePayload(rawBody: Buffer) {
  if (rawBody.byteLength === 0) return { workerId: 'competition-credit-scheduler' };
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
    || workerId.length === 0
    || workerId.length > 128
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
    const result = await runCompetitionCreditRuntimeTick(parsePayload(rawBody));
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
    if (error instanceof CompetitionCreditRuntimeBusyError) {
      return NextResponse.json(
        { status: 'busy', code: 'COMPETITION_CREDITS_RUNTIME_BUSY' },
        { status: 409 },
      );
    }
    if (error instanceof CompetitionCreditRuntimeConfigurationError) {
      return NextResponse.json(
        { status: 'error', code: 'COMPETITION_CREDITS_RUNTIME_CONFIGURATION' },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { status: 'error', code: 'COMPETITION_CREDITS_RUNTIME_TICK_FAILED' },
      { status: 503 },
    );
  }
}
