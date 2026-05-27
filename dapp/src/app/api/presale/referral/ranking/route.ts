import { NextRequest, NextResponse } from 'next/server';

import { listPresaleReferralRanking } from '@/lib/presale-referrals';

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  if (!/[",\n]/.test(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 100);
  const format = searchParams.get('format');

  try {
    const ranking = await listPresaleReferralRanking(limit);

    if (format === 'csv') {
      const headers = [
        'rank',
        'walletAddress',
        'referralCode',
        'level1Uki',
        'level2Uki',
        'level3Uki',
        'totalReferralUki',
        'weightedScore',
        'ownUkiPurchased',
      ];
      const csv = [
        headers.join(','),
        ...ranking.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(',')),
      ].join('\n');

      return new NextResponse(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="presale-referral-ranking.csv"',
        },
      });
    }

    return NextResponse.json({ ranking });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
