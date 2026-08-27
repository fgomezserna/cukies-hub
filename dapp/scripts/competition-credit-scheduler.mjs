import { createHash, createHmac, randomBytes } from 'node:crypto';
import { hostname } from 'node:os';

import { MongoClient } from 'mongodb';

import { loadCompetitionCreditSchedulerConfig } from './competition-credit-scheduler-policy.mjs';

const path = '/api/economy/v1/internal/credits/tick';
const config = loadCompetitionCreditSchedulerConfig(process.env, hostname());
const heartbeatId = `scheduler-heartbeat:${config.schedulerId}`;
const mongoClient = config.enabled ? new MongoClient(config.mongoUrl) : null;
const heartbeatCollection = mongoClient
  ? mongoClient.db(config.dbName).collection('competition_credit_runtime_state')
  : null;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function schedulerErrorCode(error) {
  if (error instanceof Error && /^Tick credits fallo con HTTP \d+$/.test(error.message)) {
    return error.message.replace('Tick credits fallo con ', '').replace(' ', '_');
  }
  if (error instanceof Error && error.name === 'TimeoutError') return 'TICK_TIMEOUT';
  return 'TICK_FAILED';
}

async function recordHeartbeat(status, errorCode = null) {
  if (!heartbeatCollection) return;
  const now = new Date();
  if (status === 'attempt') {
    await heartbeatCollection.updateOne(
      { _id: heartbeatId },
      {
        $set: {
          schedulerId: config.schedulerId,
          status: 'running',
          lastAttemptAt: now,
          updatedAt: now,
        },
        $setOnInsert: { _id: heartbeatId, createdAt: now, consecutiveFailures: 0 },
      },
      { upsert: true },
    );
    return;
  }
  if (status === 'success') {
    await heartbeatCollection.updateOne(
      { _id: heartbeatId },
      {
        $set: {
          schedulerId: config.schedulerId,
          status: 'success',
          lastAttemptAt: now,
          lastSuccessAt: now,
          consecutiveFailures: 0,
          updatedAt: now,
        },
        $unset: { lastErrorCode: '' },
        $setOnInsert: { _id: heartbeatId, createdAt: now },
      },
      { upsert: true },
    );
    return;
  }
  await heartbeatCollection.updateOne(
    { _id: heartbeatId },
    {
      $set: {
        schedulerId: config.schedulerId,
        status: 'error',
        lastAttemptAt: now,
        lastErrorCode: errorCode,
        updatedAt: now,
      },
      $inc: { consecutiveFailures: 1 },
      $setOnInsert: { _id: heartbeatId, createdAt: now },
    },
    { upsert: true },
  );
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
  if (!response.ok) throw new Error(`Tick credits fallo con HTTP ${response.status}`);
}

if (mongoClient) await mongoClient.connect();

while (true) {
  if (config.enabled) {
    try {
      await recordHeartbeat('attempt');
      await tick();
      await recordHeartbeat('success');
    } catch (error) {
      const errorCode = schedulerErrorCode(error);
      try {
        await recordHeartbeat('error', errorCode);
      } catch {
        process.stderr.write(`${new Date().toISOString()} CREDIT_SCHEDULER_HEARTBEAT_WRITE_FAILED\n`);
      }
      process.stderr.write(`${new Date().toISOString()} ${errorCode}\n`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, config.intervalMs));
}
