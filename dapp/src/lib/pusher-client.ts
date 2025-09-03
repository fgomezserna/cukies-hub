import Pusher from 'pusher-js';

// Enable pusher logging for development (remove in production)
if (process.env.NODE_ENV === 'development') {
  Pusher.logToConsole = true;
}

export const pusherClient = new Pusher(
  process.env.NEXT_PUBLIC_PUSHER_KEY!,
  {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    authEndpoint: '/api/pusher/auth',
    forceTLS: true,
  }
);

// Log connection events for debugging
pusherClient.connection.bind('connected', () => {
  console.log('🔗 [PUSHER] Connected to Pusher');
});

pusherClient.connection.bind('disconnected', () => {
  console.log('🔌 [PUSHER] Disconnected from Pusher');
});

pusherClient.connection.bind('error', (error: any) => {
  console.error('❌ [PUSHER] Connection error:', error);
});