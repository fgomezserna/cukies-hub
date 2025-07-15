import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/*
Webhook endpoint called by IFTTT when a user follows the official X/Twitter account.
Now stores followers in TwitterFollower collection instead of auto-completing tasks.
Expected JSON payload:
{
  "handle": "username",     // Twitter handle without @
  "displayName": "Name",    // Display name (optional)
  "secret": "shared_secret" // Pre-shared secret for validation
}
*/
export async function POST(request: Request) {
  try {
    const { handle, displayName, secret, ...rawData } = await request.json();

    // Basic validation
    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    if (secret !== process.env.IFTTT_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 401 });
    }

    const normalizedHandle = handle.trim().replace(/^@/, '').toLowerCase();

    console.log('Processing Twitter follow webhook:', {
      handle: normalizedHandle,
      displayName,
      rawData
    });

    // Store the follower in the TwitterFollower collection
    const follower = await prisma.twitterFollower.upsert({
      where: {
        twitterUsername: normalizedHandle
      },
      update: {
        twitterName: displayName || null,
        followedAt: new Date(), // Update follow date if they re-follow
        webhookData: rawData
      },
      create: {
        twitterUsername: normalizedHandle,
        twitterHandle: normalizedHandle,
        twitterName: displayName || null,
        webhookData: rawData
      }
    });

    console.log('Twitter follower stored:', follower);

    return NextResponse.json({ 
      success: true, 
      message: 'Follower recorded successfully',
      follower: {
        username: follower.twitterUsername,
        name: follower.twitterName,
        followedAt: follower.followedAt
      }
    });

  } catch (error) {
    console.error('Twitter follow webhook error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Optional: Handle GET requests for webhook verification
export async function GET() {
  const webhookSecret = process.env.IFTTT_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  return NextResponse.json({ 
    message: 'Twitter follow webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
} 