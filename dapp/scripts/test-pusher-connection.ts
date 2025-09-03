/**
 * Simple test script to verify Pusher connection
 * Run with: node -r ts-node/register scripts/test-pusher-connection.ts
 */

import Pusher from 'pusher';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

async function testPusherConnection() {
  console.log('🧪 Testing Pusher connection...');
  
  if (!process.env.PUSHER_APP_ID) {
    console.error('❌ PUSHER_APP_ID not found in environment');
    process.exit(1);
  }
  
  try {
    // Test trigger event
    const result = await pusher.trigger('test-channel', 'test-event', {
      message: 'Hello from Pusher test!',
      timestamp: new Date().toISOString()
    });
    
    console.log('✅ Pusher connection successful!', result);
    console.log('📊 Event sent to: test-channel');
    console.log('🎯 You can test receiving on: https://dashboard.pusher.com/apps/your-app-id/console');
    
  } catch (error) {
    console.error('❌ Pusher connection failed:', error);
    process.exit(1);
  }
}

testPusherConnection();