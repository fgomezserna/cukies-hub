/**
 * Simple test script to verify Pusher connection
 * Run with: node scripts/test-pusher-connection.js
 */

const Pusher = require('pusher');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: '.env.local' });

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

async function testPusherConnection() {
  console.log('🧪 Testing Pusher connection...');
  
  if (!process.env.PUSHER_APP_ID) {
    console.error('❌ PUSHER_APP_ID not found in environment');
    console.log('📝 Make sure you have .env.local with Pusher credentials');
    process.exit(1);
  }
  
  console.log('🔑 Using credentials:', {
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY?.substring(0, 8) + '...',
    cluster: process.env.PUSHER_CLUSTER
  });
  
  try {
    // Test trigger event
    console.log('📤 Sending test event...');
    const result = await pusher.trigger('test-channel', 'test-event', {
      message: 'Hello from Pusher test!',
      timestamp: new Date().toISOString(),
      source: 'server-test'
    });
    
    console.log('✅ Pusher connection successful!');
    console.log('📊 Event sent to: test-channel');
    console.log('🎯 Check your Pusher Dashboard Debug Console to see the event');
    console.log('🔗 Dashboard: https://dashboard.pusher.com/apps/' + process.env.PUSHER_APP_ID + '/console');
    
  } catch (error) {
    console.error('❌ Pusher connection failed:', error.message);
    console.log('🔍 Check your credentials and network connection');
    process.exit(1);
  }
}

testPusherConnection();