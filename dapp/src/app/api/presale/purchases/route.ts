import { NextRequest, NextResponse } from 'next/server';

import { getBscScanTxUrl } from '@/lib/contracts/uki-sale';
import { listPresalePurchasesForWallet } from '@/lib/presale-referrals';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const walletAddress = searchParams.get('walletAddress');
  const limit = Number(searchParams.get('limit') ?? 25);

  if (!walletAddress) {
    return NextResponse.json({ error: 'walletAddress is required' }, { status: 400 });
  }

  try {
    const purchases = await listPresalePurchasesForWallet(walletAddress, limit);

    return NextResponse.json({
      purchases: purchases.map((purchase) => ({
        ...purchase,
        txUrl: purchase.txHash ? getBscScanTxUrl(purchase.txHash) : null,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
