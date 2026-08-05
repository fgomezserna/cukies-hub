import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

import { MongoClient } from 'mongodb';

import { loadWeeklyRankingSchedulerConfig } from './weekly-ranking-scheduler-policy.mjs';

const path = '/api/economy/v1/internal/ranking/tick';
const config = loadWeeklyRankingSchedulerConfig(process.env, hostname());
const heartbeatId = `scheduler-heartbeat:${config.schedulerId}`;
const client = config.enabled ? new MongoClient(config.mongoUrl) : null;
const heartbeats = client
  ? client.db(config.dbName).collection('weekly_ranking_runtime_state')
  : null;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function heartbeat(status, errorCode = null) {
  if (!heartbeats) return;
  const now = new Date();
  const base = { schedulerId: config.schedulerId, status, lastAttemptAt: now, updatedAt: now };
  if (status === 'success') {
    await heartbeats.updateOne(
      { _id: heartbeatId },
      {
        $set: { ...base, lastSuccessAt: now, consecutiveFailures: 0 },
        $unset: { lastErrorCode: '' },
        $setOnInsert: { _id: heartbeatId, createdAt: now },
      },
      { upsert: true },
    );
  } else if (status === 'error') {
    await heartbeats.updateOne(
      { _id: heartbeatId },
      {
        $set: { ...base, lastFailureAt: now, lastErrorCode: errorCode },
        $inc: { consecutiveFailures: 1 },
        $setOnInsert: { _id: heartbeatId, createdAt: now },
      },
      { upsert: true },
    );
  } else {
    await heartbeats.updateOne(
      { _id: heartbeatId },
      { $set: base, $setOnInsert: { _id: heartbeatId, createdAt: now, consecutiveFailures: 0 } },
      { upsert: true },
    );
  }
}

async function tick() {
  const body = JSON.stringify({ workerId: `scheduler:${config.schedulerId}` });
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('base64url');
  const canonical = [
    'cukies-economy-hmac-v1',
    config.keyId,
    'POST',
    path,
    timestamp,
    nonce,
    sha256(Buffer.from(body, 'utf8')),
  ].join('\n');
  const signature = createHmac('sha256', Buffer.from(config.secret, 'utf8'))
    .update(canonical, 'utf8')
    .digest('hex');
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-economy-key-id': config.keyId,
      'x-economy-timestamp': timestamp,
      'x-economy-nonce': nonce,
      'x-economy-signature': `v1=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(config.tickTimeoutMs),
  });
  if (!response.ok) throw new Error(`WEEKLY_RANKING_TICK_HTTP_${response.status}`);
}

if (client) await client.connect();

while (true) {
  if (config.enabled) {
    try {
      await heartbeat('running');
      await tick();
      await heartbeat('success');
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 120) : 'WEEKLY_RANKING_TICK_FAILED';
      try {
        await heartbeat('error', code);
      } catch {
        process.stderr.write(`${new Date().toISOString()} WEEKLY_RANKING_HEARTBEAT_FAILED\n`);
      }
      process.stderr.write(`${new Date().toISOString()} ${code}\n`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
}
