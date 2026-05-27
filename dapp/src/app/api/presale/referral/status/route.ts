import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { applyPresaleReferralCode, getPresaleReferralStatus } from '@/lib/presale-referrals';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');

  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  try {
    const cookieStore = await cookies();
    const cookieReferralCode = cookieStore.get('ukiReferralCode')?.value;

    if (cookieReferralCode) {
      await applyPresaleReferralCode(walletAddress, cookieReferralCode);
      cookieStore.set('ukiReferralCode', '', { expires: new Date(0), path: '/' });
    }

    const status = await getPresaleReferralStatus(walletAddress, origin);
    return NextResponse.json(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
