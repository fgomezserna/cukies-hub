import { NextResponse } from 'next/server';

import { readWalletSession } from '@/lib/wallet-auth';
import { UkiEconomyError } from '../errors';
import { getCanonicalAmbassadorInvitationWallet } from './service';
import { assertAmbassadorInvitationCode, getDefaultAmbassadorWallet, stableAmbassadorHash, validAmbassadorWallet } from './rules';
import type { AmbassadorConfirmationTarget } from './confirmation';

export function ambassadorJson(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function signedAmbassadorIdentity() {
  const session = await readWalletSession();
  if (
    !session || session.walletType !== 'evm'
    || typeof session.userId !== 'string' || !session.userId.trim()
    || typeof session.signedWalletAddress !== 'string'
  ) return null;
  let walletAddress: string;
  try {
    walletAddress = validAmbassadorWallet(session.signedWalletAddress);
  } catch {
    return null;
  }
  return {
    walletAddress,
    signedSessionEvidenceHash: stableAmbassadorHash({
      kind: 'signed_wallet_session', userId: session.userId,
      signedWalletAddress: walletAddress, issuedAt: session.issuedAt, expiresAt: session.expiresAt,
    }),
  };
}

export async function readAmbassadorBody(request: Request) {
  try {
    const body: unknown = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function ambassadorTarget(body: Record<string, unknown> | null): AmbassadorConfirmationTarget | null {
  if (body?.sponsor === 'cukies_world' && body.invitationCode === undefined) return { sponsor: 'cukies_world' };
  if (typeof body?.invitationCode === 'string' && body.sponsor === undefined) {
    return { invitationCode: assertAmbassadorInvitationCode(body.invitationCode) };
  }
  return null;
}

export async function ambassadorTargetWallet(target: AmbassadorConfirmationTarget) {
  return 'invitationCode' in target
    ? getCanonicalAmbassadorInvitationWallet(target.invitationCode)
    : getDefaultAmbassadorWallet();
}

const PUBLIC_CONFLICT_REASONS = new Set([
  'AMBASSADOR_CYCLE', 'PRESALE_SPONSOR_LOCKED', 'AMBASSADOR_ALREADY_CONFIRMED',
]);

export function ambassadorErrorResponse(error: unknown) {
  if (error instanceof UkiEconomyError) {
    const reason = error.details?.reason;
    const code = error.code === 'CONFLICT' && typeof reason === 'string' && PUBLIC_CONFLICT_REASONS.has(reason)
      ? reason : error.code;
    return ambassadorJson({ status: 'error', code },
      error.code === 'CONFLICT' ? 409 : error.code === 'NOT_FOUND' ? 404 : 400);
  }
  if (error instanceof TypeError && error.message === 'AMBASSADOR_RUNTIME_MISCONFIGURED') {
    return ambassadorJson({ status: 'error', code: error.message }, 400);
  }
  if (error instanceof TypeError && [
    'AMBASSADOR_ATTRIBUTION_WRITES_DISABLED', 'AMBASSADOR_DEFAULT_WALLET_NOT_CONFIGURED',
    'AMBASSADOR_CONFIRMATION_SECRET_NOT_CONFIGURED',
  ].includes(error.message)) {
    return ambassadorJson({ status: 'error', code: error.message }, 503);
  }
  console.error('Ambassador request failed', { name: error instanceof Error ? error.name : 'UnknownError' });
  return ambassadorJson({ status: 'error', code: 'INTERNAL_ERROR' }, 500);
}
