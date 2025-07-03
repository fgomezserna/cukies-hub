import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { code, walletAddress, codeVerifier } = await request.json();

    if (!code || !walletAddress || !codeVerifier) {
      return NextResponse.json({ 
        error: 'Code, code verifier and wallet address are required' 
      }, { status: 400 });
    }

    // Exchange code for access token (Twitter OAuth 2.0 with PKCE)
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${process.env.NEXTAUTH_URL}/oauth/twitter/callback.html`,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('Twitter token exchange failed:', error);
      return NextResponse.json({ 
        error: 'Failed to exchange code for token' 
      }, { status: 400 });
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Twitter
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,public_metrics', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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