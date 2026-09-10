import { NextResponse } from 'next/server';

export async function POST(_request: Request) {
  return NextResponse.json(
    { error: 'This Telegram verification method has been retired' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } },
  );
}
