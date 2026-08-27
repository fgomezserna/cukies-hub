import { NextRequest, NextResponse } from 'next/server';

import { verifyWalletAuth } from '@/lib/auth-utils';
import {
  competitionCreditService,
  getCompetitionCreditWalletStatus,
} from '@/lib/uki-economy/credits';
import { UkiEconomyError } from '@/lib/uki-economy/errors';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;

function noStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function errorResponse(code: string, status: number) {
  return noStore(NextResponse.json({ status: 'error', code }, { status }));
}

async function requireWallet(walletAddress: string | null) {
  if (!walletAddress || walletAddress.length > 80) throw new Error('INVALID_WALLET');
  try {
    await verifyWalletAuth(walletAddress);
  } catch {
    throw new Error('WALLET_SESSION_REQUIRED');
  }
  return walletAddress;
}

async function readBoundedJson(request: NextRequest) {
  const contentLength = request.headers.get('content-length');
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    throw new SyntaxError('BODY_TOO_LARGE');
  }
  if (!request.body) throw new SyntaxError('EMPTY_BODY');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        await reader.cancel('credit request body limit exceeded');
        throw new SyntaxError('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8')) as unknown;
}

function mapDomainError(error: UkiEconomyError) {
  switch (error.code) {
    case 'VALIDATION':
      return errorResponse('INVALID_CREDIT_REQUEST', 400);
    case 'NOT_FOUND':
      return errorResponse('CREDIT_SLOT_NOT_FOUND', 404);
    case 'CONFLICT':
    case 'STALE_FENCE':
      return errorResponse('CREDIT_STATE_CONFLICT', 409);
    case 'SCHEMA_NOT_READY':
      return errorResponse('CREDIT_SERVICE_UNAVAILABLE', 503);
  }
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? null;
  try {
    await requireWallet(walletAddress);
    const status = await getCompetitionCreditWalletStatus(walletAddress!);
    return noStore(NextResponse.json({ status: 'ok', data: status }));
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_WALLET') {
      return errorResponse('INVALID_WALLET', 400);
    }
    if (error instanceof Error && error.message === 'WALLET_SESSION_REQUIRED') {
      return errorResponse('WALLET_SESSION_REQUIRED', 401);
    }
    if (error instanceof UkiEconomyError) return mapDomainError(error);
    return errorResponse('CREDIT_SERVICE_UNAVAILABLE', 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await readBoundedJson(request);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return errorResponse('INVALID_CREDIT_REQUEST', 400);
    }
    const keys = Object.keys(payload).sort();
    if (keys.join(',') !== 'poolCreditsPerSlot,slotId,walletAddress') {
      return errorResponse('INVALID_CREDIT_REQUEST', 400);
    }
    const { walletAddress, slotId, poolCreditsPerSlot } = payload as Record<string, unknown>;
    if (
      typeof walletAddress !== 'string'
      || typeof slotId !== 'string'
      || typeof poolCreditsPerSlot !== 'number'
    ) {
      return errorResponse('INVALID_CREDIT_REQUEST', 400);
    }
    await requireWallet(walletAddress);
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return errorResponse('IDEMPOTENCY_KEY_REQUIRED', 400);
    }
    const config = await competitionCreditService.configurePool({
      walletAddress,
      slotId,
      poolCreditsPerSlot,
      idempotencyKey,
      now: new Date(),
    });
    return noStore(NextResponse.json({
      status: 'ok',
      data: {
        configId: config.configId,
        slotId: config.slotId,
        eligibilityEpoch: config.eligibilityEpoch,
        poolCreditsPerSlot: config.poolCreditsPerSlot,
        requestedAt: config.requestedAt,
        effectiveCutoff: config.effectiveCutoff,
        ruleVersion: config.ruleVersion,
      },
    }));
  } catch (error) {
    if (error instanceof SyntaxError) return errorResponse('INVALID_CREDIT_REQUEST', 400);
    if (error instanceof Error && error.message === 'INVALID_WALLET') {
      return errorResponse('INVALID_WALLET', 400);
    }
    if (error instanceof Error && error.message === 'WALLET_SESSION_REQUIRED') {
      return errorResponse('WALLET_SESSION_REQUIRED', 401);
    }
    if (error instanceof UkiEconomyError) return mapDomainError(error);
    return errorResponse('CREDIT_SERVICE_UNAVAILABLE', 503);
  }
}
