import { NextRequest, NextResponse } from 'next/server';

import { applyPresaleReferralCode } from '@/lib/presale-referrals';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const walletAddress = typeof body.walletAddress === 'string' ? body.walletAddress : null;
    const referralCode = typeof body.referralCode === 'string' ? body.referralCode : null;

    if (!walletAddress || !referralCode) {
      return NextResponse.json(
        { error: 'walletAddress and referralCode are required' },
        { status: 400 },
      );
    }

    const result = await applyPresaleReferralCode(walletAddress, referralCode);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
