#!/usr/bin/env node

import { createHash, createHmac, randomBytes } from 'node:crypto';

import { MongoClient } from 'mongodb';

const PATH = '/api/economy/v1/internal/rewards/commands';
const DATABASE_NAME = 'cukieshub-new-staging';
const RULE_PREFIX = 'local-tokenomics-';
const DAILY_CAP_500K = '500000000000000000000000';
const DAILY_CAP_600K = '600000000000000000000000';
const LIFETIME_CAP_450M = '450000000000000000000000000';
const LIFETIME_CAP_451M = '451000000000000000000000000';
const DAY_MS = 86_400_000;
const BOUNDARY_HOUR_UTC = 14;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio.`);
  return value;
}

function assertLocalStageEnvironment() {
  if (required('APP_ENV') !== 'staging') {
    throw new Error('APP_ENV debe ser staging.');
  }
  if (required('NEXT_PUBLIC_UKI_CHAIN_ID') !== '97') {
    throw new Error('NEXT_PUBLIC_UKI_CHAIN_ID debe ser 97.');
  }

  const mongoUrl = new URL(required('CHAIN_INDEXER_MONGO_URL'));
  const databaseName = decodeURIComponent(mongoUrl.pathname.replace(/^\//, ''));
  if (
    mongoUrl.protocol !== 'mongodb:'
    || !['127.0.0.1', 'localhost'].includes(mongoUrl.hostname)
    || databaseName !== DATABASE_NAME
  ) {
    throw new Error(
      `CHAIN_INDEXER_MONGO_URL debe apuntar al Mongo local ${DATABASE_NAME}.`,
    );
  }

  const baseUrl = new URL(required('TOKENOMICS_LOCAL_BASE_URL'));
  if (
    baseUrl.protocol !== 'http:'
    || !['127.0.0.1', 'localhost'].includes(baseUrl.hostname)
    || baseUrl.username
    || baseUrl.password
    || baseUrl.pathname !== '/'
    || baseUrl.search
    || baseUrl.hash
  ) {
    throw new Error('TOKENOMICS_LOCAL_BASE_URL debe ser una URL HTTP local sin path.');
  }

  return {
    mongoUrl: mongoUrl.toString(),
    baseUrl: baseUrl.toString().replace(/\/$/, ''),
    keyId: required('ECONOMY_INTERNAL_HMAC_KEY_ID'),
    secret: required('ECONOMY_INTERNAL_HMAC_SECRET'),
  };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key.normalize('NFC'), stableValue(child)]),
    );
  }
  return typeof value === 'string' ? value.normalize('NFC') : value;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rewardRuleConfigHash(rule) {
  return sha256(JSON.stringify(stableValue({
    scope: rule.scope,
    version: rule.version,
    active: rule.active,
    activeFrom: rule.activeFrom,
    activeUntil: rule.activeUntil,
    tokenDecimals: rule.tokenDecimals,
    runCredits: rule.runCredits,
    settlementBps: rule.settlementBps,
    rankingPlayerBps: rule.rankingPlayerBps,
    creditPoolDaily: rule.creditPoolDaily,
    emissionBudget: rule.emissionBudget,
    cukiePool: rule.cukiePool,
    undistributedBps: rule.undistributedBps,
    destinations: rule.destinations,
  })));
}

function nextBoundary(now) {
  const candidate = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    BOUNDARY_HOUR_UTC,
  ));
  return candidate.getTime() > now.getTime()
    ? candidate
    : new Date(candidate.getTime() + DAY_MS);
}

function versionSuffix(boundary) {
  return boundary.toISOString().replace(/[-:.TZ]/g, '');
}

function buildRule({ version, activeFrom, programStartsAt, dailyCapRaw, lifetimeCapRaw }) {
  const rule = {
    _id: `reward_allocations:${version}`,
    scope: 'reward_allocations',
    version,
    active: true,
    activeFrom: activeFrom.toISOString(),
    tokenDecimals: 18,
    runCredits: {
      unitScale: 10,
      totalUnits: 100,
      weeklyReserveUnits: 20,
      ambassadorReserveUnits: 5,
      ambassadorOrdinaryUnits: 4,
      ambassadorWeeklyUnits: 1,
      convertibleUnits: 75,
    },
    settlementBps: {
      poolCredits: 5_000,
      poolCukieWithOwnCredits: 5_000,
      poolCukieWithPoolCredits: 2_500,
    },
    rankingPlayerBps: {
      1: 10_000,
      2: 9_000,
      3: 8_000,
      4: 7_000,
      5: 6_000,
      6: 5_000,
      7: 4_000,
      8: 3_000,
      9: 2_000,
    },
    creditPoolDaily: {
      sourceShareBps: 10_000,
      floorEnabled: true,
      floorCreditsStep: 10,
      floorAmountRaw: '750000000000000000',
    },
    emissionBudget: {
      programStartsAt: programStartsAt.toISOString(),
      dayBoundarySecondUtc: BOUNDARY_HOUR_UTC * 60 * 60,
      lateReservationGraceSeconds: 86_400,
      dailyCapRaw,
      lifetimeCapRaw,
      unusedDailyCapacity: 'materialize_undistributed',
      overflowPolicy: 'block',
    },
    cukiePool: {
      cumulativeTierCount: 6,
      cumulativeTierBps: [4_500, 2_000, 1_500, 1_200, 700, 100],
    },
    undistributedBps: {
      treasury: 8_000,
      marketing: 0,
      development: 0,
      marketingDevelopment: 1_000,
      supplyReduction: 1_000,
    },
    destinations: {
      creditPool: '0x9700000000000000000000000000000000000001',
      cukiePoolOriginal: '0x9700000000000000000000000000000000000002',
      cukiePoolSecondPlus: '0x9700000000000000000000000000000000000003',
      treasury: '0x9700000000000000000000000000000000000004',
      marketing: '0x9700000000000000000000000000000000000005',
      development: '0x9700000000000000000000000000000000000006',
      marketingDevelopment: '0x9700000000000000000000000000000000000005',
      supplyReduction: '0x9700000000000000000000000000000000000007',
    },
  };
  return { ...rule, configHash: rewardRuleConfigHash(rule) };
}

async function signedCommand(config, payload) {
  const body = JSON.stringify({ command: 'persist_rule', payload });
  const timestamp = String(Date.now());
  const nonce = randomBytes(16).toString('base64url');
  const canonical = [
    'cukies-economy-hmac-v1',
    config.keyId,
    'POST',
    PATH,
    timestamp,
    nonce,
    sha256(Buffer.from(body, 'utf8')),
  ].join('\n');
  const signature = createHmac('sha256', Buffer.from(config.secret, 'utf8'))
    .update(canonical, 'utf8')
    .digest('hex');
  const response = await fetch(`${config.baseUrl}${PATH}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-economy-key-id': config.keyId,
      'x-economy-timestamp': timestamp,
      'x-economy-nonce': nonce,
      'x-economy-signature': `v1=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json();
  return { httpStatus: response.status, result };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const config = assertLocalStageEnvironment();
  const client = new MongoClient(config.mongoUrl, { serverSelectionTimeoutMS: 5_000 });
  await client.connect();
  try {
    const db = client.db(DATABASE_NAME);
    const marker = await db.collection('__local_stage').findOne({ _id: 'stage-97-local' });
    assert(
      marker?.environment === 'staging' && marker?.chainId === 97 && marker?.synthetic === true,
      'El Mongo local no contiene el marcador sintético Stage/97.',
    );

    const rules = db.collection('economy_rule_versions');
    const foreignRules = await rules.countDocuments({
      scope: 'reward_allocations',
      version: { $not: new RegExp(`^${RULE_PREFIX}`) },
    });
    assert(foreignRules === 0, 'El Mongo local contiene reglas rewards ajenas al E2E.');
    await rules.deleteMany({ scope: 'reward_allocations', version: new RegExp(`^${RULE_PREFIX}`) });
    await db.collection('reward_rule_state').deleteOne({ _id: 'reward_allocations' });

    const now = new Date();
    const futureBoundary = nextBoundary(now);
    const previousBoundary = new Date(futureBoundary.getTime() - DAY_MS);
    const followingBoundary = new Date(futureBoundary.getTime() + DAY_MS);
    const suffix = versionSuffix(futureBoundary);
    const first = buildRule({
      version: `${RULE_PREFIX}500k-${suffix}`,
      activeFrom: previousBoundary,
      programStartsAt: previousBoundary,
      dailyCapRaw: DAILY_CAP_500K,
      lifetimeCapRaw: LIFETIME_CAP_450M,
    });
    const second = buildRule({
      version: `${RULE_PREFIX}600k-${suffix}`,
      activeFrom: futureBoundary,
      programStartsAt: previousBoundary,
      dailyCapRaw: DAILY_CAP_600K,
      lifetimeCapRaw: LIFETIME_CAP_450M,
    });
    const unsafe = buildRule({
      version: `${RULE_PREFIX}unsafe-lifetime-${suffix}`,
      activeFrom: followingBoundary,
      programStartsAt: previousBoundary,
      dailyCapRaw: DAILY_CAP_600K,
      lifetimeCapRaw: LIFETIME_CAP_451M,
    });

    const firstResponse = await signedCommand(config, first);
    const secondResponse = await signedCommand(config, second);
    const unsafeResponse = await signedCommand(config, unsafe);
    assert(firstResponse.httpStatus === 200, `La regla 500k falló: HTTP ${firstResponse.httpStatus}.`);
    assert(secondResponse.httpStatus === 200, `La regla 600k falló: HTTP ${secondResponse.httpStatus}.`);
    assert(
      unsafeResponse.httpStatus === 409 && unsafeResponse.result?.code === 'REWARD_CONFLICT',
      `El cambio inseguro del lifetime cap no fue rechazado: HTTP ${unsafeResponse.httpStatus}.`,
    );

    const [persistedFirst, persistedSecond, persistedUnsafe] = await Promise.all([
      rules.findOne({ scope: 'reward_allocations', version: first.version }),
      rules.findOne({ scope: 'reward_allocations', version: second.version }),
      rules.findOne({ scope: 'reward_allocations', version: unsafe.version }),
    ]);
    assert(persistedFirst?.configHash === first.configHash, 'El configHash histórico de 500k cambió.');
    assert(
      persistedFirst?.supersededAt?.getTime() === futureBoundary.getTime()
      && persistedFirst?.supersededByVersion === second.version,
      'La regla 500k no quedó cerrada exactamente en el corte futuro.',
    );
    assert(
      persistedSecond?.emissionBudget?.dailyCapRaw === DAILY_CAP_600K
      && persistedSecond?.emissionBudget?.lifetimeCapRaw === LIFETIME_CAP_450M,
      'La regla 600k no conservó el techo global de 450M.',
    );
    assert(!persistedUnsafe, 'La regla insegura llegó a persistirse.');

    process.stdout.write(`${JSON.stringify({
      status: 'ok',
      target: { environment: 'staging', chainId: 97, database: DATABASE_NAME },
      transition: {
        from: { version: first.version, dailyCapRaw: DAILY_CAP_500K },
        at: futureBoundary.toISOString(),
        to: { version: second.version, dailyCapRaw: DAILY_CAP_600K },
      },
      lifetimeCapRaw: LIFETIME_CAP_450M,
      historicalConfigHashPreserved: true,
      unsafeLifetimeChange: {
        attemptedRaw: LIFETIME_CAP_451M,
        httpStatus: unsafeResponse.httpStatus,
        code: unsafeResponse.result.code,
        persisted: false,
      },
    }, null, 2)}\n`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
