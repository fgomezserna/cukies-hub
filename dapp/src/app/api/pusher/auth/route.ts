import { NextRequest, NextResponse } from 'next/server';
import { pusherServer } from '@/lib/pusher-server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/auth';

// Helper function to add CORS headers
function addCorsHeaders(response: NextResponse, request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.NODE_ENV === 'development' 
    ? ['http://localhost:9002', 'http://localhost:9001', 'http://localhost:9003']
    : []; // Add production origins here

  const isAllowed = !origin || allowedOrigins.includes(origin);
  
  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin || '*');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  
  return response;
}

// Handle CORS preflight requests
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = process.env.NODE_ENV === 'development' 
    ? ['http://localhost:9002', 'http://localhost:9001', 'http://localhost:9003']
    : []; // Add production origins here

  const isAllowed = !origin || allowedOrigins.includes(origin);
  
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : 'null',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Parse form data from Pusher with better error handling
    let data: FormData;
    let socketId: string;
    let channelName: string;
    let sessionToken: string;

    // Check Content-Type and parse accordingly
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      // Handle URLSearchParams
      try {
        const body = await request.text();
        const params = new URLSearchParams(body);
        socketId = params.get('socket_id') || '';
        channelName = params.get('channel_name') || '';
        sessionToken = params.get('session_token') || '';
        console.log('🔄 [PUSHER AUTH] Parsed URLSearchParams successfully');
      } catch (urlError) {
        console.error('❌ [PUSHER AUTH] URLSearchParams parsing error:', urlError);
        const response = NextResponse.json({ error: 'Invalid URL-encoded data' }, { status: 400 });
        return addCorsHeaders(response, request);
      }
    } else {
      // Try FormData first (legacy)
      try {
        data = await request.formData();
        socketId = data.get('socket_id') as string;
        channelName = data.get('channel_name') as string;
        sessionToken = data.get('session_token') as string;
        console.log('🔄 [PUSHER AUTH] Parsed FormData successfully');
      } catch (formDataError) {
        console.error('❌ [PUSHER AUTH] FormData parsing error:', formDataError);
        
        // Fallback to URLSearchParams parsing
        try {
          const body = await request.text();
          const params = new URLSearchParams(body);
          socketId = params.get('socket_id') || '';
          channelName = params.get('channel_name') || '';
          sessionToken = params.get('session_token') || '';
          console.log('🔄 [PUSHER AUTH] Fallback URLSearchParams parsing successful');
        } catch (textError) {
          console.error('❌ [PUSHER AUTH] All parsing methods failed:', textError);
          const response = NextResponse.json({ error: 'Invalid request format' }, { status: 400 });
          return addCorsHeaders(response, request);
        }
      }
    }

    console.log('🔍 [PUSHER AUTH] Received data:', {
      socketId: socketId ? socketId.substring(0, 12) + '...' : 'missing',
      channelName,
      sessionToken: sessionToken ? sessionToken.substring(0, 12) + '...' : 'missing'
    });

    if (!socketId || !channelName) {
      console.log('❌ [PUSHER AUTH] Missing socketId or channelName');
      const response = NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
      return addCorsHeaders(response, request);
    }

    let userId: string;
    let userName: string = 'Anonymous';

    // Try to get user from session first (for dapp)
    const session = await auth();
    
    if (session?.user?.id) {
      // User authenticated via session (dapp)
      userId = session.user.id;
      userName = session.user.name || 'Anonymous';
      console.log('🔐 [PUSHER AUTH] Using session auth:', { userId, channelName });
    } else if (sessionToken) {
      // User authenticated via game session token (iframe)
      const gameSession = await prisma.gameSession.findUnique({
        where: { sessionToken },
        include: { user: { select: { id: true, username: true } } }
      });

      if (!gameSession) {
        console.log('❌ [PUSHER AUTH] Invalid session token:', sessionToken);
        const response = NextResponse.json({ error: 'Invalid session token' }, { status: 401 });
        return addCorsHeaders(response, request);
      }

      userId = gameSession.userId;
      userName = gameSession.user.username || 'Anonymous';
      console.log('🔐 [PUSHER AUTH] Using token auth:', { userId, sessionToken: sessionToken.substring(0, 12) + '...' });
    } else {
      console.log('❌ [PUSHER AUTH] No authentication method available');
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      return addCorsHeaders(response, request);
    }

    // Track active connections to prevent duplicates
    const sessionId = channelName.replace('private-game-session-', '');
    
    console.log('🔐 [PUSHER AUTH] Authorization request:', {
      userId,
      socketId,
      channelName,
      sessionId
    });

    // Validate channel access based on channel type
    if (channelName.startsWith('private-game-session-')) {
      
      // Verify user has access to this game session
      const gameSession = await prisma.gameSession.findUnique({
        where: { sessionId },
        select: { userId: true, gameId: true, isActive: true }
      });

      if (!gameSession) {
        console.log('❌ [PUSHER AUTH] Game session not found:', sessionId);
        const response = NextResponse.json({ error: 'Session not found' }, { status: 404 });
        return addCorsHeaders(response, request);
      }

      if (gameSession.userId !== userId) {
        console.log('❌ [PUSHER AUTH] User does not own session:', {
          sessionUserId: gameSession.userId,
          requestUserId: userId
        });
        const response = NextResponse.json({ error: 'Access denied' }, { status: 403 });
        return addCorsHeaders(response, request);
      }

      console.log('✅ [PUSHER AUTH] Session access granted:', {
        sessionId,
        gameId: gameSession.gameId,
        isActive: gameSession.isActive
      });
    }

    // Generate auth response
    const authResponse = pusherServer.authorizeChannel(
      socketId,
      channelName,
      {
        user_id: userId,
        user_info: {
          name: userName,
          email: session?.user?.email || '',
        }
      }
    );

    console.log('📝 [PUSHER AUTH] Authorization successful for:', channelName);

    const response = NextResponse.json(authResponse);
    return addCorsHeaders(response, request);

  } catch (error) {
    console.error('❌ [PUSHER AUTH] Authorization failed:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    const response = NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
    
    return addCorsHeaders(response, request);
  }
}