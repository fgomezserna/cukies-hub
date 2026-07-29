import { NextResponse } from 'next/server';

import { isCompetitionWalletAddress, normalizeCompetitionWallet } from '..';
import { readWalletSession } from '@/lib/wallet-auth';

import { CompetitionServiceError } from './service';
import {
  competitionRequestKey,
  getCompetitionRateLimiter,
  type CompetitionRateLimitOperation,
} from './rate-limit';

const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;

export function competitionJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: NO_STORE_HEADERS });
}

export function competitionRateLimitResponse(input: {
  readonly request: Request;
  readonly operation: CompetitionRateLimitOperation;
  readonly identityKey?: string;
}) {
  const result = getCompetitionRateLimiter().consume({
    key: input.identityKey ?? competitionRequestKey(input.request),
    operation: input.operation,
  });
  if (result.allowed) return null;

  return NextResponse.json(
    {
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many competition requests',
    },
    {
      status: 429,
      headers: {
        ...NO_STORE_HEADERS,
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}

export async function readCompetitionIdentity() {
  const session = await readWalletSession();
  if (
    !session ||
    session.walletType !== 'evm' ||
    typeof session.userId !== 'string' ||
    !session.userId.trim() ||
    typeof session.signedWalletAddress !== 'string'
  ) return null;
  const walletAddress = normalizeCompetitionWallet(session.signedWalletAddress);
  if (!isCompetitionWalletAddress(walletAddress)) return null;
  return { userId: session.userId, walletAddress };
}

export async function requireCompetitionIdentity() {
  const identity = await readCompetitionIdentity();
  if (!identity) {
    throw new CompetitionServiceError(
      'INVALID_WALLET',
      'An authenticated EVM wallet session is required',
      401,
    );
  }
  return identity;
}

export async function readJsonObject(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new CompetitionServiceError('INVALID_EVIDENCE', 'Request body must be valid JSON', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new CompetitionServiceError('INVALID_EVIDENCE', 'Request body must be an object', 400);
  }
  return body as Record<string, unknown>;
}

export function competitionErrorResponse(error: unknown) {
  if (error instanceof CompetitionServiceError) {
    return competitionJson({ success: false, error: error.code, message: error.message }, error.status);
  }
  console.error('Treasure Hunt competition request failed');
  return competitionJson({ success: false, error: 'INTERNAL_ERROR' }, 500);
}

export function parseEvidenceBody(body: Record<string, unknown>) {
  if (
    typeof body.receipt !== 'string' ||
    body.receipt.length === 0 ||
    body.receipt.length > 4_096 ||
    !Number.isSafeInteger(body.sequence) ||
    !Number.isSafeInteger(body.score) ||
    !Number.isSafeInteger(body.gameTimeMs)
  ) {
    throw new CompetitionServiceError('INVALID_EVIDENCE', 'Invalid competition evidence body', 400);
  }
  if (
    body.clientTimestampMs !== undefined &&
    body.clientTimestampMs !== null &&
    !Number.isSafeInteger(body.clientTimestampMs)
  ) {
    throw new CompetitionServiceError('INVALID_EVIDENCE', 'Invalid client timestamp', 400);
  }
  return {
    receipt: body.receipt,
    sequence: Number(body.sequence),
    score: Number(body.score),
    gameTimeMs: Number(body.gameTimeMs),
    clientTimestampMs: body.clientTimestampMs == null ? null : Number(body.clientTimestampMs),
  };
}
