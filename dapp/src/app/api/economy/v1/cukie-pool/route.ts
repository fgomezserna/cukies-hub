import { NextRequest, NextResponse } from 'next/server';

import { verifyWalletAuth } from '@/lib/auth-utils';
import {
  depositCukiePoolPosition,
  listCukiePoolWalletPositions,
  requestCukiePoolWithdrawal,
  type CukiePoolPosition,
} from '@/lib/uki-economy/cukie-pool';
import { UkiEconomyError } from '@/lib/uki-economy/errors';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 16 * 1024;

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return result;
}

function publicPosition(position: CukiePoolPosition) {
  return {
    positionId: position.positionId,
    assetId: position.assetId,
    tokenId: position.tokenId,
    generation: position.generation,
    rarity: position.rarity,
    gamesQuota: position.gamesQuota,
    gamesRemaining: position.gamesRemaining,
    status: position.status,
    stakedAt: position.stakedAt,
    eligibleAt: position.eligibleAt,
    assignmentExpiresAt: position.assignmentExpiresAt ?? null,
    withdrawalRequestedAt: position.withdrawalRequestedAt ?? null,
    revision: position.revision,
  };
}

async function authenticatedWallet(walletAddress: unknown) {
  if (typeof walletAddress !== 'string' || walletAddress.length === 0 || walletAddress.length > 80) {
    throw new Error('INVALID_WALLET');
  }
  try {
    await verifyWalletAuth(walletAddress);
  } catch {
    throw new Error('WALLET_SESSION_REQUIRED');
  }
  return walletAddress;
}

async function boundedJson(request: NextRequest) {
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
        await reader.cancel('cukie pool request body limit exceeded');
        throw new SyntaxError('BODY_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks, total).toString('utf8')) as unknown;
}

function domainError(error: UkiEconomyError) {
  if (error.code === 'VALIDATION') return response({ status: 'error', code: 'INVALID_POOL_REQUEST' }, 400);
  if (error.code === 'NOT_FOUND') return response({ status: 'error', code: 'POOL_POSITION_NOT_FOUND' }, 404);
  if (error.code === 'SCHEMA_NOT_READY') return response({ status: 'error', code: 'CUKIE_POOL_UNAVAILABLE' }, 503);
  return response({ status: 'error', code: 'CUKIE_POOL_CONFLICT' }, 409);
}

export async function GET(request: NextRequest) {
  const walletAddress = request.nextUrl.searchParams.get('walletAddress')?.trim() ?? null;
  try {
    await authenticatedWallet(walletAddress);
    const limitText = request.nextUrl.searchParams.get('limit');
    const limit = limitText === null ? undefined : Number(limitText);
    const result = await listCukiePoolWalletPositions({
      walletAddress: walletAddress!,
      cursor: request.nextUrl.searchParams.get('cursor'),
      limit,
    });
    return response({ status: 'ok', data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'INVALID_WALLET') {
      return response({ status: 'error', code: 'INVALID_WALLET' }, 400);
    }
    if (error instanceof Error && error.message === 'WALLET_SESSION_REQUIRED') {
      return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
    }
    if (error instanceof UkiEconomyError) return domainError(error);
    return response({ status: 'error', code: 'CUKIE_POOL_UNAVAILABLE' }, 503);
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await boundedJson(request);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return response({ status: 'error', code: 'INVALID_POOL_REQUEST' }, 400);
    }
    const record = payload as Record<string, unknown>;
    const walletAddress = await authenticatedWallet(record.walletAddress);
    const idempotencyKey = request.headers.get('idempotency-key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 256) {
      return response({ status: 'error', code: 'IDEMPOTENCY_KEY_REQUIRED' }, 400);
    }

    let position: CukiePoolPosition;
    if (record.action === 'deposit') {
      if (
        Object.keys(record).sort().join(',') !== 'action,assetId,walletAddress'
        || typeof record.assetId !== 'string'
      ) {
        return response({ status: 'error', code: 'INVALID_POOL_REQUEST' }, 400);
      }
      position = await depositCukiePoolPosition({
        walletAddress,
        assetId: record.assetId,
        idempotencyKey,
      });
    } else if (record.action === 'withdraw') {
      if (
        Object.keys(record).sort().join(',') !== 'action,expectedRevision,positionId,walletAddress'
        || typeof record.positionId !== 'string'
        || typeof record.expectedRevision !== 'number'
      ) {
        return response({ status: 'error', code: 'INVALID_POOL_REQUEST' }, 400);
      }
      position = await requestCukiePoolWithdrawal({
        walletAddress,
        positionId: record.positionId,
        expectedRevision: record.expectedRevision,
        idempotencyKey,
      });
    } else {
      return response({ status: 'error', code: 'INVALID_POOL_REQUEST' }, 400);
    }
    return response({ status: 'ok', data: publicPosition(position) });
  } catch (error) {
    if (error instanceof SyntaxError) return response({ status: 'error', code: 'INVALID_POOL_REQUEST' }, 400);
    if (error instanceof Error && error.message === 'INVALID_WALLET') {
      return response({ status: 'error', code: 'INVALID_WALLET' }, 400);
    }
    if (error instanceof Error && error.message === 'WALLET_SESSION_REQUIRED') {
      return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
    }
    if (error instanceof UkiEconomyError) return domainError(error);
    return response({ status: 'error', code: 'CUKIE_POOL_UNAVAILABLE' }, 503);
  }
}
