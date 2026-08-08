import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  requireLocalAdminApiAccess,
  requirePrivateSecretConfigurationApiAccess,
  requirePrivateSecretApiAccess,
} from '@/lib/operational-access';

const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;

async function readBoundedJson(request: Request) {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength
    && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_WEBHOOK_BODY_BYTES)
  ) {
    throw new SyntaxError('Invalid webhook body');
  }

  if (!request.body) throw new SyntaxError('Invalid webhook body');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_WEBHOOK_BODY_BYTES) {
        await reader.cancel('Webhook body limit exceeded');
        throw new SyntaxError('Invalid webhook body');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8')) as unknown;
}

function unauthorizedWebhook() {
  return NextResponse.json(
    { error: 'Unauthorized' },
    { status: 401, headers: { 'Cache-Control': 'no-store' } },
  );
}

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
  const configurationDenied = requirePrivateSecretConfigurationApiAccess(
    'IFTTT_WEBHOOK_SECRET',
  );
  if (configurationDenied) return configurationDenied;

  let payload: unknown;
  try {
    payload = await readBoundedJson(request);
  } catch {
    return unauthorizedWebhook();
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return unauthorizedWebhook();
  }

  try {
    const { handle, displayName, secret, ...rawData } = payload as Record<string, unknown>;

    const accessDenied = requirePrivateSecretApiAccess(
      typeof secret === 'string' ? secret : undefined,
      'IFTTT_WEBHOOK_SECRET',
    );
    if (accessDenied) return accessDenied;

    if (!handle || typeof handle !== 'string') {
      return NextResponse.json({ error: 'handle is required' }, { status: 400 });
    }

    if (
      displayName !== undefined
      && (typeof displayName !== 'string' || displayName.length > 100)
    ) {
      return NextResponse.json({ error: 'displayName is invalid' }, { status: 400 });
    }

    const normalizedHandle = handle.trim().replace(/^@/, '').toLowerCase();
    if (!normalizedHandle || normalizedHandle.length > 50) {
      return NextResponse.json({ error: 'handle is invalid' }, { status: 400 });
    }
    const normalizedDisplayName = typeof displayName === 'string'
      ? displayName.trim() || null
      : null;
    const webhookData = rawData as Prisma.InputJsonObject;

    // Store the follower in the TwitterFollower collection
    const follower = await prisma.twitterFollower.upsert({
      where: {
        twitterUsername: normalizedHandle
      },
      update: {
        twitterName: normalizedDisplayName,
        followedAt: new Date(), // Update follow date if they re-follow
        webhookData,
      },
      create: {
        twitterUsername: normalizedHandle,
        twitterHandle: normalizedHandle,
        twitterName: normalizedDisplayName,
        webhookData,
      }
    });

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
  const accessDenied = await requireLocalAdminApiAccess();
  if (accessDenied) return accessDenied;

  return NextResponse.json({ 
    message: 'Twitter follow webhook endpoint is active',
    timestamp: new Date().toISOString()
  });
}
