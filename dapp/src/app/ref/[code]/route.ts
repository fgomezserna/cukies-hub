import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{ code: string }>;
};

function getPublicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const host = forwardedHost || request.headers.get('host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const proto = forwardedProto || (host?.startsWith('localhost') ? 'http' : 'https');

  if (host && !host.startsWith('0.0.0.0')) return `${proto}://${host}`;

  const url = new URL(request.url);
  if (url.hostname !== '0.0.0.0') return url.origin;

  return 'https://cukieshub.eurekand.com';
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { code } = await params;
  const redirectUrl = new URL('/#presale-console', getPublicOrigin(request));
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.set('ukiReferralCode', code, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return response;
}
