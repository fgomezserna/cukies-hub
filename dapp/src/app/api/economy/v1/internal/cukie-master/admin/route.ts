import { NextResponse } from 'next/server';

import { getEconomyDb } from '@/lib/indexer-db/mongodb';
import {
  expandCukieMasterRouteCapacity,
  proposeRequirementIncrease,
} from '@/lib/uki-economy/cukie-master';
import { parseCukieMasterAdminCommand } from '@/lib/uki-economy/cukie-master/admin-command';
import { UkiEconomyError } from '@/lib/uki-economy/errors';
import {
  InternalEconomyAuthError,
  createMongoInternalEconomyNonceRepository,
  loadInternalEconomyAuthConfig,
  readLimitedInternalEconomyRequestBody,
  verifyAndConsumeInternalEconomyRequest,
} from '@/lib/uki-economy/internal-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const PATH = '/api/economy/v1/internal/cukie-master/admin';

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
    const command = parseCukieMasterAdminCommand(rawBody);
    if (command.command === 'expand_capacity') {
      const result = await expandCukieMasterRouteCapacity(
        command.route,
        command.capacitySlots,
        new Date(),
        command.idempotencyKey,
      );
      return NextResponse.json({ status: 'ok', command: command.command, ...result });
    }
    const round = await proposeRequirementIncrease(
      command.route,
      command.requirement,
      new Date(),
      command.idempotencyKey,
    );
    return NextResponse.json({
      status: 'ok',
      command: command.command,
      round: {
        route: round.route,
        roundId: round.roundId,
        requirement: round.requirement,
        pendingRequirement: round.pendingRequirement ?? null,
        graceEndsAt: round.graceEndsAt ?? null,
        graceHours: 48,
        capacitySlots: round.capacitySlots,
        revision: round.revision,
      },
    });
  } catch (error) {
    if (error instanceof InternalEconomyAuthError) {
      return NextResponse.json(
        { status: 'error', code: error.code },
        { status: error.code === 'CONFIGURATION' ? 503 : 401 },
      );
    }
    if (error instanceof UkiEconomyError) {
      const status = error.code === 'VALIDATION' ? 400 : error.code === 'NOT_FOUND' ? 404 : 409;
      return NextResponse.json(
        { status: 'error', code: `CUKIE_MASTER_ADMIN_${error.code}` },
        { status },
      );
    }
    return NextResponse.json(
      { status: 'error', code: 'CUKIE_MASTER_ADMIN_FAILED' },
      { status: 503 },
    );
  }
}
