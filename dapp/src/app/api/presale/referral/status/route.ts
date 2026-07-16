import { NextRequest, NextResponse } from 'next/server';

import { getPresaleReferralStatus } from '@/lib/presale-referrals';
import { competitionRateLimitResponse } from '@/lib/treasure-hunt-competition/server/api';
import {
  evmWalletSessionMatchesSignedAddress,
  isValidEvmWalletAddress,
  readWalletSession,
} from '@/lib/wallet-auth';

function validBrowserOrigin(value: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.hostname === '0.0.0.0' || url.hostname === '[::]' || url.hostname === '') return null;

    return url.origin;
  } catch {
    return null;
  }
}

function getPublicOrigin(request: NextRequest, browserOrigin: string | null) {
  const explicitBrowserOrigin = validBrowserOrigin(browserOrigin);
  if (explicitBrowserOrigin) return explicitBrowserOrigin;

  const headerBrowserOrigin = validBrowserOrigin(request.headers.get('origin'));
  if (headerBrowserOrigin) return headerBrowserOrigin;

  const refererOrigin = validBrowserOrigin(request.headers.get('referer'));
  if (refererOrigin) return refererOrigin;

  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || (host?.startsWith('localhost') ? 'http' : 'https');

  if (host && !host.startsWith('0.0.0.0')) return `${proto}://${host}`;

  return new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = getPublicOrigin(request, searchParams.get('origin'));
  const walletAddress = searchParams.get('walletAddress');

  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  if (!isValidEvmWalletAddress(walletAddress)) {
    return NextResponse.json({ error: 'walletAddress must be a valid EVM address' }, { status: 400 });
  }

  try {
    const walletSession = await readWalletSession();
    if (!walletSession || !evmWalletSessionMatchesSignedAddress(walletSession, walletAddress)) {
      return NextResponse.json(
        { error: 'Authenticated EVM wallet does not match' },
        { status: 401 },
      );
    }

    const rateLimit = competitionRateLimitResponse({
      request,
      operation: 'referral',
      identityKey: walletAddress.toLowerCase(),
    });
    if (rateLimit) return rateLimit;

    const status = await getPresaleReferralStatus(walletAddress, origin);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Failed to read presale referral status:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
