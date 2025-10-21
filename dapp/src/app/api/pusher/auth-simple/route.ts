import { NextRequest, NextResponse } from 'next/server';
import Pusher from 'pusher';

// Simple Pusher auth for development
const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
});

export async function POST(request: NextRequest) {
  try {
    console.log('🔐 [SIMPLE AUTH] Starting auth request');
    
    const body = await request.text();
    console.log('🔐 [SIMPLE AUTH] Body:', body);
    
    const params = new URLSearchParams(body);
    
    const socketId = params.get('socket_id');
    const channelName = params.get('channel_name');
    
    console.log('🔐 [SIMPLE AUTH] Request:', { socketId, channelName });
    
    if (!socketId || !channelName) {
      console.log('❌ [SIMPLE AUTH] Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    console.log('🔐 [SIMPLE AUTH] Creating Pusher instance with:', {
      appId: process.env.PUSHER_APP_ID ? 'SET' : 'MISSING',
      key: process.env.PUSHER_KEY ? 'SET' : 'MISSING',
      secret: process.env.PUSHER_SECRET ? 'SET' : 'MISSING',
      cluster: process.env.PUSHER_CLUSTER ? 'SET' : 'MISSING'
    });
    
    // Simple auth for development
    const authResponse = pusher.authorizeChannel(socketId, channelName, {
      user_id: 'dev-user-' + Date.now(),
      user_info: {
        name: 'Dev User'
      }
    });
    
    console.log('✅ [SIMPLE AUTH] Success, response:', authResponse);
    
    return NextResponse.json(authResponse);
    
  } catch (error) {
    console.error('❌ [SIMPLE AUTH] Error:', error);
    console.error('❌ [SIMPLE AUTH] Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json({ error: 'Auth failed' }, { status: 500 });
  }
}
