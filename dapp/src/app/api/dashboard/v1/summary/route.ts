import { getAddress } from 'viem';
import { NextResponse } from 'next/server';

import { assertDashboardRuntime } from '@/lib/dashboard/runtime';
import { getDashboardSummary } from '@/lib/dashboard/server';
import { prisma } from '@/lib/prisma';
import { isValidEvmWalletAddress, readWalletSession } from '@/lib/wallet-auth';

export const dynamic = 'force-dynamic';

function response(body: unknown, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return result;
}

export async function GET() {
  const session = await readWalletSession();
  if (
    !session
    || session.walletType !== 'evm'
    || typeof session.userId !== 'string'
    || !session.userId.trim()
    || !isValidEvmWalletAddress(session.signedWalletAddress)
  ) {
    return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
  }

  let runtime;
  try {
    runtime = assertDashboardRuntime(process.env);
  } catch {
    return response({ status: 'error', code: 'DASHBOARD_RUNTIME_UNAVAILABLE' }, 503);
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { username: true },
    });
    if (!user) {
      return response({ status: 'error', code: 'WALLET_SESSION_REQUIRED' }, 401);
    }
    const walletNormalized = getAddress(session.signedWalletAddress).toLowerCase();
    const data = await getDashboardSummary({
      runtime,
      identity: {
        username: user.username ?? null,
        walletNormalized,
        sessionExpiresAt: session.expiresAt,
      },
    });
    return response({ status: 'ok', data });
  } catch {
    return response({ status: 'error', code: 'DASHBOARD_UNAVAILABLE' }, 503);
  }
}
