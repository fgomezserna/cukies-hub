import Pusher from 'pusher';

export const pusherServer = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// Helper function to trigger events safely
export async function triggerPusherEvent(
  channel: string,
  event: string,
  data: any
): Promise<boolean> {
  try {
    await pusherServer.trigger(channel, event, data);
    console.log(`📤 [PUSHER] Event sent: ${event} to channel: ${channel}`);
    return true;
  } catch (error) {
    console.error('❌ [PUSHER] Failed to trigger event:', {
      channel,
      event,
      error: error instanceof Error ? error.message : error
    });
    return false;
  }
}