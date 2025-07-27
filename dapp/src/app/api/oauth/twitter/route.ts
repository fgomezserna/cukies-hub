import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { code, walletAddress, codeVerifier } = await request.json();

    if (!code || !walletAddress || !codeVerifier) {
      return NextResponse.json({ 
        error: 'Code, code verifier and wallet address are required' 
      }, { status: 400 });
    }

    // Find user by wallet address
    const user = await prisma.user.findUnique({ where: { walletAddress } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the correct redirect URI (match frontend logic)
    let baseUrl = process.env.NEXTAUTH_URL;
    
    if (!baseUrl && process.env.VERCEL_URL) {
      // VERCEL_URL might not include protocol, ensure it has https://
      baseUrl = process.env.VERCEL_URL.startsWith('http') 
        ? process.env.VERCEL_URL 
        : `https://${process.env.VERCEL_URL}`;
    }
    
    if (!baseUrl) {
      baseUrl = 'http://localhost:3000';
    }
    
    // Remove trailing slash to avoid double slashes
    baseUrl = baseUrl.replace(/\/$/, '');
    
    const redirectUri = `${baseUrl}/oauth/twitter/callback.html`;
    
    console.log(`[Twitter OAuth] Environment check:`, {
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'not set',
      VERCEL_URL: process.env.VERCEL_URL || 'not set',
      finalBaseUrl: baseUrl,
      redirectUri: redirectUri
    });
    
    // Exchange code for access token (Twitter OAuth 2.0 with PKCE)
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Twitter token exchange failed:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: error,
        redirectUri: redirectUri,
        code: code?.substring(0, 20) + '...',
        codeVerifier: codeVerifier?.substring(0, 20) + '...'
      });
      return NextResponse.json({ 
        error: 'Failed to exchange code for token',
        details: error,
        redirectUri: redirectUri,
        debug: {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText
        }
      }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const { access_token: accessToken, refresh_token: refreshToken, expires_in: expiresIn, scope, token_type: tokenType } = tokenData;

    // Get user info from Twitter
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,public_metrics', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userResponse.ok) {
      const error = await userResponse.text();
      console.error('Twitter user fetch failed:', error);
      return NextResponse.json({ 
        error: 'Failed to get user info from Twitter' 
      }, { status: 400 });
    }

    const userData = await userResponse.json();
    const twitterUser = userData.data;

    // Save or update Twitter account in DB
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: { provider: 'twitter', providerAccountId: twitterUser.id },
      },
    });

    if (existingAccount) {
      await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          userId: user.id,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
          scope,
          token_type: tokenType,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.account.create({
        data: {
          userId: user.id,
          type: 'oauth',
          provider: 'twitter',
          providerAccountId: twitterUser.id,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
          scope,
          token_type: tokenType,
        },
      });
    }

    // Update user's Twitter data
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        twitterHandle: twitterUser.username.toLowerCase(),
        twitterName: twitterUser.name,
        twitterId: twitterUser.id,
      },
    });

    return NextResponse.json({
      success: true,
      twitterUser: {
        id: twitterUser.id,
        username: twitterUser.username,
        name: twitterUser.name,
        profile_image_url: twitterUser.profile_image_url,
        public_metrics: twitterUser.public_metrics,
      },
    });

  } catch (error) {
    console.error('Twitter OAuth error:', error);
    return NextResponse.json({ 
      error: 'Internal Server Error' 
    }, { status: 500 });
  }
} 