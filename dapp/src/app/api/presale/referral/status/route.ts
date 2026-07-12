import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { applyPresaleReferralCode, getPresaleReferralStatus } from '@/lib/presale-referrals';

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
  const shouldApplyReferral = searchParams.get('applyReferral') === '1';

  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  try {
    const cookieStore = await cookies();
    const cookieReferralCode = cookieStore.get('ukiReferralCode')?.value;
    let referralAttribution: Awaited<ReturnType<typeof applyPresaleReferralCode>> | null = null;

    if (shouldApplyReferral && cookieReferralCode) {
      referralAttribution = await applyPresaleReferralCode(walletAddress, cookieReferralCode);

      if (referralAttribution.applied) {
        cookieStore.set('ukiReferralCode', '', { expires: new Date(0), path: '/' });
      }
    }

    const status = await getPresaleReferralStatus(walletAddress, origin);
    return NextResponse.json({
      ...status,
      referralAttribution,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
