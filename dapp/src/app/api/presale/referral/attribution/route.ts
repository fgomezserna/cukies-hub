import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { applyPresaleReferralCode } from '@/lib/presale-referrals';
import { competitionRateLimitResponse } from '@/lib/treasure-hunt-competition/server/api';
import {
  evmWalletSessionMatchesSignedAddress,
  isValidEvmWalletAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

const REFERRAL_COOKIE_NAME = 'ukiReferralCode';
const REFERRAL_CODE_PATTERN = /^uki-[a-f0-9]{10}$/i;

function normalizeReferralCode(value: unknown) {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(normalized) ? normalized : null;
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const bodyRecord = body && typeof body === 'object'
      ? body as Record<string, unknown>
      : {};
    const walletAddress = typeof bodyRecord.walletAddress === 'string'
      ? bodyRecord.walletAddress.trim()
      : null;

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 },
      );
    }

    if (!isValidEvmWalletAddress(walletAddress)) {
      return NextResponse.json({ error: 'walletAddress must be a valid EVM address' }, { status: 400 });
    }

    const walletSession = await readWalletSession();
    if (!walletSession || !evmWalletSessionMatchesSignedAddress(walletSession, walletAddress)) {
      return NextResponse.json({ error: 'Authenticated EVM wallet does not match' }, { status: 401 });
    }

    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'referral',
      identityKey: walletAddress.toLowerCase(),
    });
    if (rateLimit) return rateLimit;

    const cookieStore = await cookies();
    const bodyReferralCode = normalizeReferralCode(bodyRecord.referralCode);
    const cookieReferralCode = normalizeReferralCode(
      cookieStore.get(REFERRAL_COOKIE_NAME)?.value,
    );
    const referralCode = bodyReferralCode ?? cookieReferralCode;

    if (!referralCode) {
      return NextResponse.json({ applied: false, reason: 'no_referral_code' as const });
    }

    const result = await applyPresaleReferralCode(walletAddress, referralCode);

    if (result.applied) {
      cookieStore.set(REFERRAL_COOKIE_NAME, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        expires: new Date(0),
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to apply presale referral attribution:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
