// Utility functions for OAuth flows

// Generate a random string for OAuth state parameter
export function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate code verifier for PKCE (Twitter OAuth 2.0)
export function generateCodeVerifier(): string {
  return generateRandomString(128);
}

// Generate code challenge from verifier for PKCE
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Discord OAuth URL generator
export function getDiscordOAuthURL(state: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || 'DISCORD_CLIENT_ID_NOT_SET';
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/oauth/discord/callback.html`,
    response_type: 'code',
    scope: 'identify guilds',
    state: state,
  });
  
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

// Twitter OAuth URL generator
export function getTwitterOAuthURL(state: string, codeChallenge: string): string {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID || 'TWITTER_CLIENT_ID_NOT_SET';
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${window.location.origin}/oauth/twitter/callback.html`,
    response_type: 'code',
    scope: 'tweet.read users.read follows.read offline.access',
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  
  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

// Open OAuth popup window
export function openOAuthPopup(url: string, name: string): Window | null {
  const width = 500;
  const height = 600;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  
  return window.open(
    url,
    name,
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
  );
}

// Promise-based OAuth flow handler
export function handleOAuthFlow(
  popup: Window,
  expectedMessageType: string,
  timeout: number = 60000
): Promise<any> {
  return new Promise((resolve, reject) => {
    console.log('[OAuth Flow] Starting flow, expecting:', expectedMessageType);
    
    const timer = setTimeout(() => {
      console.log('[OAuth Flow] Timeout reached');
      cleanup();
      reject(new Error('OAuth flow timed out'));
    }, timeout);

    const messageHandler = (event: MessageEvent) => {
      console.log('[OAuth Flow] Received message:', event.data, 'from origin:', event.origin);
      
      // Verify origin for security
      // Temporarily allow all origins for debugging
      // if (event.origin !== window.location.origin) {
      //   console.log('[OAuth Flow] Origin mismatch, ignoring');
      //   return;
      // }

      if (event.data.type === expectedMessageType) {
        console.log('[OAuth Flow] Success message received');
        cleanup();
        resolve(event.data);
      } else if (event.data.type?.includes('ERROR')) {
        console.log('[OAuth Flow] Error message received:', event.data.error);
        cleanup();
        reject(new Error(event.data.error || 'OAuth flow failed'));
      }
    };

    const cleanup = () => {
      console.log('[OAuth Flow] Cleaning up');
      clearTimeout(timer);
      window.removeEventListener('message', messageHandler);
      if (popup && !popup.closed) {
        popup.close();
      }
    };

    // Check if popup was blocked
    if (!popup) {
      console.log('[OAuth Flow] Popup was blocked');
      cleanup();
      reject(new Error('Popup was blocked by browser'));
      return;
    }

    console.log('[OAuth Flow] Adding message listener');
    window.addEventListener('message', messageHandler);

    // Check if popup was closed manually
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        console.log('[OAuth Flow] Popup was closed manually');
        clearInterval(checkClosed);
        cleanup();
        reject(new Error('OAuth flow was cancelled'));
      }
    }, 1000);
  });
} 

// Discord OAuth complete flow
export async function handleDiscordOAuth(walletAddress?: string) {
  try {
    console.log('[Discord OAuth] Starting Discord OAuth flow');
    
    // Check if environment variables are configured
    if (!process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) {
      throw new Error('Discord OAuth not configured. Please set NEXT_PUBLIC_DISCORD_CLIENT_ID environment variable.');
    }
    
    const state = generateRandomString(32);
    const authUrl = getDiscordOAuthURL(state);
    console.log('[Discord OAuth] Auth URL:', authUrl);
    
    const popup = openOAuthPopup(authUrl, 'discord-oauth');
    console.log('[Discord OAuth] Popup opened:', popup);
    
    const result = await handleOAuthFlow(popup, 'DISCORD_OAUTH_SUCCESS');
    console.log('[Discord OAuth] Flow completed, result:', result);
    
    // Exchange code for user info
    console.log('[Discord OAuth] Exchanging code for user info');
    const response = await fetch('/api/oauth/discord', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        code: result.code,
        walletAddress: walletAddress
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to connect Discord account');
    }
    
    const data = await response.json();
    console.log('[Discord OAuth] User data received:', data);
    return data;
  } catch (error) {
    console.error('Discord OAuth flow failed:', error);
    throw error;
  }
}

// Twitter OAuth complete flow
export async function handleTwitterOAuth(walletAddress?: string) {
  try {
    console.log('[Twitter OAuth] Starting Twitter OAuth flow');
    
    // Check if environment variables are configured
    if (!process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID) {
      throw new Error('Twitter OAuth not configured. Please set NEXT_PUBLIC_TWITTER_CLIENT_ID environment variable.');
    }
    
    const state = generateRandomString(32);
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    
    // Store code verifier for later use
    sessionStorage.setItem('twitter_code_verifier', codeVerifier);
    
    const authUrl = getTwitterOAuthURL(state, codeChallenge);
    console.log('[Twitter OAuth] Auth URL:', authUrl);
    
    const popup = openOAuthPopup(authUrl, 'twitter-oauth');
    console.log('[Twitter OAuth] Popup opened:', popup);
    
    const result = await handleOAuthFlow(popup, 'TWITTER_OAUTH_SUCCESS');
    console.log('[Twitter OAuth] Flow completed, result:', result);
    
    // Exchange code for user info
    console.log('[Twitter OAuth] Exchanging code for user info');
    const response = await fetch('/api/oauth/twitter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        code: result.code,
        codeVerifier: codeVerifier,
        walletAddress: walletAddress
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to connect Twitter account');
    }
    
    const data = await response.json();
    console.log('[Twitter OAuth] User data received:', data);
    
    // Clean up
    sessionStorage.removeItem('twitter_code_verifier');
    
    return data;
  } catch (error) {
    console.error('Twitter OAuth flow failed:', error);
    throw error;
  }
} 