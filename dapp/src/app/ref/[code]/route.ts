import { NextRequest, NextResponse } from 'next/server';

type RouteContext = {
  params: Promise<{ code: string }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { code } = await params;
  const redirectUrl = new URL('/#presale-console', request.url);
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
