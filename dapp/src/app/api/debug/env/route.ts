import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    PUSHER_APP_ID: process.env.PUSHER_APP_ID ? 'SET' : 'MISSING',
    PUSHER_KEY: process.env.PUSHER_KEY ? 'SET' : 'MISSING',
    PUSHER_SECRET: process.env.PUSHER_SECRET ? 'SET' : 'MISSING',
    PUSHER_CLUSTER: process.env.PUSHER_CLUSTER ? 'SET' : 'MISSING',
    NEXT_PUBLIC_PUSHER_KEY: process.env.NEXT_PUBLIC_PUSHER_KEY ? 'SET' : 'MISSING',
    NEXT_PUBLIC_PUSHER_CLUSTER: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ? 'SET' : 'MISSING',
  });
}
