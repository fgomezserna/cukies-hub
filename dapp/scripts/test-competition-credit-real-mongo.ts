import assert from 'node:assert/strict';

import { MongoClient, type Db } from 'mongodb';

import type {
  CompetitionCreditRun,
  CreditLot,
  CreditPoolPeriod,
  CreditReservation,
} from '../src/lib/uki-economy/credits/types';

const mongoUri = process.env.CREDIT_REAL_MONGO_URI?.trim() ?? '';
const databaseName = process.env.CREDIT_REAL_MONGO_DB_NAME?.trim() ?? '';

let mongoCompetitionCreditTransactionRunner!: typeof import('../src/lib/uki-economy/credits/repository').mongoCompetitionCreditTransactionRunner;
let currentCompetitionCreditPeriod!: typeof import('../src/lib/uki-economy/credits/rules').currentCompetitionCreditPeriod;
let testCompetitionCreditRule!: typeof import('../src/lib/uki-economy/credits/testing').testCompetitionCreditRule;

const wallet = `0x${'1'.repeat(40)}`;
const now = new Date('2026-09-07T08:35:37.000Z');
let db: Db;

function fixture(options: {
  projection?: Partial<import('../src/lib/uki-economy/credits/types').CreditPoolPeriod>;
  blocked?: unknown;
} = {}) {
  const rule = testCompetitionCreditRule();
  const period = currentCompetitionCreditPeriod(now, rule);
  const run: CompetitionCreditRun = {
    _id: 'run-real-mongo',
    runId: 'run-real-mongo',
    route: 'uki',
    period,
    settlementPeriod: period,
    status: 'open',
    expectedItemCount: 1,
    expectedGrantCredits: 100,
    expectedOwnCredits: 0,
    expectedPoolCredits: 100,
    expectedHeldCount: 0,
    sourceWatermark: {} as CompetitionCreditRun['sourceWatermark'],
    cutoffBlock: {} as CompetitionCreditRun['cutoffBlock'],
    sourceSnapshotHash: 's'.repeat(64),
    snapshotHash: 'h'.repeat(64),
    fenceToken: 1,
    createdAt: now,
    updatedAt: now,
  };
  const lot: CreditLot = {
    _id: 'pool-lot-real-mongo',
    lotId: 'pool-lot-real-mongo',
    bucket: 'pool',
    route: 'uki',
    walletNormalized: null,
    periodId: period.periodId,
    runId: run.runId,
    runItemId: 'run-item-real-mongo',
    sourceSlotId: 'slot-real-mongo',
    eligibilityEpoch: 1,
    totalCredits: 100,
    poolDepositedCredits: 0,
    availableCredits: 100,
    reservedCredits: 0,
    spentCredits: 0,
    expiredCredits: 0,
    expiresAt: new Date('2026-09-07T09:00:00.000Z'),
    revision: 0,
    blocked: options.blocked as boolean ?? false,
    createdAt: now,
    updatedAt: now,
  };
  const reservation: CreditReservation = {
    _id: 'reservation-real-mongo',
    reservationId: 'reservation-real-mongo',
    sessionId: 'session-real-mongo',
    walletNormalized: wallet,
    periodId: period.periodId,
    costCode: 'treasure-hunt:start',
    expectedRuleVersion: rule.version,
    expectedRuleConfigHash: rule.configHash,
    ruleVersion: rule.version,
    ruleConfigHash: rule.configHash,
    amountCredits: 10,
    bucket: 'pool',
    allocations: [{
      lotId: lot.lotId,
      runId: run.runId,
      route: 'uki',
      amountCredits: 10,
      lotRevision: 0,
      lotExpiresAt: lot.expiresAt,
      reservedUntil: new Date('2026-09-07T09:10:00.000Z'),
    }],
    status: 'active',
    expiresAt: new Date('2026-09-07T09:10:00.000Z'),
    revision: 0,
    idempotencyKey: 'reservation-real-mongo-key',
    requestHash: 'r'.repeat(64),
    payloadHash: 'p'.repeat(64),
    createdAt: now,
    updatedAt: now,
  };
  const projection: CreditPoolPeriod = {
    _id: `pool:${period.periodId}:uki`,
    periodId: period.periodId,
    route: 'uki',
    contributedCredits: 100,
    availableCredits: 100,
    reservedCredits: 0,
    spentCredits: 0,
    expiredCredits: 0,
    blocked: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    ...options.projection,
  };
  return { period, run, lot, reservation, projection };
}

async function seed(input: ReturnType<typeof fixture>, includeProjection = true) {
  await db.dropDatabase();
  await db.collection<{ _id: string; schemaVersion: number; dbName: string; initializedAt: Date; updatedAt: Date; transactionVerifiedAt: Date }>('economy_schema_metadata').insertOne({
    _id: 'uki-economy',
    schemaVersion: 3,
    dbName: databaseName,
    initializedAt: now,
    updatedAt: now,
    transactionVerifiedAt: now,
  });
  await db.collection<CompetitionCreditRun>('competition_credit_runs').insertOne(input.run);
  await db.collection<CreditLot>('competition_credit_pool_lots').insertOne(input.lot);
  if (includeProjection) {
    await db.collection<CreditPoolPeriod>('competition_credit_pool_periods').insertOne(input.projection);
  }
}

async function runTransaction<T>(
  work: Parameters<typeof mongoCompetitionCreditTransactionRunner>[0],
) {
  return mongoCompetitionCreditTransactionRunner(work) as Promise<T>;
}

async function assertConflict(work: () => Promise<unknown>, reason: string) {
  await assert.rejects(work, (error: unknown) => (
    Boolean(error && typeof error === 'object' && 'details' in error)
      && (error as { details?: { reason?: string } }).details?.reason === reason
  ));
}

async function reserveReleaseAndReplay() {
  const input = fixture();
  await seed(input);
  assert.equal(
    await db.collection<CreditLot>('competition_credit_pool_lots').countDocuments({ walletNormalized: wallet }),
    0,
  );
  await runTransaction<void>((repository) => repository.reserveLots({ reservation: input.reservation, now }));
  assertMatches(
    await db.collection<CreditLot>('competition_credit_pool_lots').findOne({ _id: input.lot._id }),
    { availableCredits: 90, reservedCredits: 10, revision: 1 },
  );
  assertMatches(
    await db.collection<CreditPoolPeriod>('competition_credit_pool_periods').findOne({ _id: input.projection._id }),
    { availableCredits: 90, reservedCredits: 10, revision: 1 },
  );
  const stored = await db.collection<CreditReservation>('competition_credit_reservations').findOne({ _id: input.reservation._id });
  assert.ok(stored);

  const releaseAt = new Date(now.getTime() + 1_000);
  await runTransaction((repository) => repository.finishReservation({
    reservation: stored as CreditReservation,
    operation: 'release',
    idempotencyKey: 'release-real-mongo-key',
    payloadHash: 'release'.repeat(10),
    now: releaseAt,
  }));
  assertMatches(
    await db.collection<CreditLot>('competition_credit_pool_lots').findOne({ _id: input.lot._id }),
    { availableCredits: 100, reservedCredits: 0, revision: 2 },
  );
  assertMatches(
    await db.collection<CreditPoolPeriod>('competition_credit_pool_periods').findOne({ _id: input.projection._id }),
    { availableCredits: 100, reservedCredits: 0, revision: 2 },
  );
  assertMatches(
    await db.collection<CreditReservation>('competition_credit_reservations').findOne({ _id: input.reservation._id }),
    { status: 'released', revision: 1 },
  );
  const replay = await runTransaction((repository) => repository.finishReservation({
    reservation: stored as CreditReservation,
    operation: 'release',
    idempotencyKey: 'release-real-mongo-key',
    payloadHash: 'release'.repeat(10),
    now: releaseAt,
  }));
  assert.equal(replay, null);
  assertMatches(
    await db.collection<CreditLot>('competition_credit_pool_lots').findOne({ _id: input.lot._id }),
    { availableCredits: 100, reservedCredits: 0, revision: 2 },
  );
}

function assertMatches(actual: unknown, expected: Record<string, unknown>) {
  assert.ok(actual && typeof actual === 'object');
  for (const [key, value] of Object.entries(expected)) {
    assert.equal((actual as Record<string, unknown>)[key], value, key);
  }
}

async function missingProjection() {
  const input = fixture();
  await seed(input, false);
  await runTransaction<void>((repository) => repository.reserveLots({ reservation: input.reservation, now }));
  assertMatches(
    await db.collection<CreditPoolPeriod>('competition_credit_pool_periods').findOne({ _id: input.projection._id }),
    { contributedCredits: 100, availableCredits: 90, reservedCredits: 10, revision: 0 },
  );
}

async function staleProjection() {
  const input = fixture({ projection: { availableCredits: 0 } });
  await seed(input);
  await assertConflict(
    () => runTransaction<void>((repository) => repository.reserveLots({ reservation: input.reservation, now })),
    'CREDIT_PROJECTION_NEGATIVE',
  );
  assertMatches(
    await db.collection<CreditLot>('competition_credit_pool_lots').findOne({ _id: input.lot._id }),
    { availableCredits: 100, reservedCredits: 0, revision: 0 },
  );
  assert.equal(await db.collection('competition_credit_reservations').countDocuments({}), 0);
  assert.equal(await db.collection('competition_credit_ledger').countDocuments({}), 0);
}

async function blockedHistoricalLots() {
  for (const scenario of [
    { blocked: true, reason: 'CREDIT_LOTS_BLOCKED' },
    { blocked: undefined, reason: 'CREDIT_LOT_MATERIALIZATION_UNKNOWN' },
  ]) {
    const input = fixture();
    await seed(input);
    const historical: Record<string, unknown> = {
      ...input.lot,
      _id: `historical-real-mongo-${String(scenario.blocked)}`,
      lotId: `historical-real-mongo-${String(scenario.blocked)}`,
      runId: 'run-closed-historical',
      availableCredits: 0,
      totalCredits: 20,
    };
    if (scenario.blocked === undefined) delete historical.blocked;
    else historical.blocked = scenario.blocked;
    await db.collection<CreditLot>('competition_credit_pool_lots').insertOne(historical as CreditLot);
    await assertConflict(
      () => runTransaction<void>((repository) => repository.reserveLots({ reservation: input.reservation, now })),
      scenario.reason,
    );
    assertMatches(
      await db.collection<CreditLot>('competition_credit_pool_lots').findOne({ _id: input.lot._id }),
      { availableCredits: 100, reservedCredits: 0, revision: 0 },
    );
    assertMatches(
      await db.collection<CreditPoolPeriod>('competition_credit_pool_periods').findOne({ _id: input.projection._id }),
      { availableCredits: 100, reservedCredits: 0, revision: 0 },
    );
    assert.equal(await db.collection('competition_credit_reservations').countDocuments({}), 0);
    assert.equal(await db.collection('competition_credit_ledger').countDocuments({}), 0);
  }
}

async function main() {
  if (!mongoUri || !databaseName) {
    throw new Error(
      'CREDIT_REAL_MONGO_URI y CREDIT_REAL_MONGO_DB_NAME son obligatorios; usa el harness de mongod local.',
    );
  }
  if (!['127.0.0.1', 'localhost'].some((host) => mongoUri.includes(`://${host}:`))) {
    throw new Error('La validacion Mongo real solo admite una URI local (127.0.0.1/localhost).');
  }
  const [repositoryModule, rulesModule, testingModule] = await Promise.all([
    import('../src/lib/uki-economy/credits/repository'),
    import('../src/lib/uki-economy/credits/rules'),
    import('../src/lib/uki-economy/credits/testing'),
  ]);
  mongoCompetitionCreditTransactionRunner = repositoryModule.mongoCompetitionCreditTransactionRunner;
  currentCompetitionCreditPeriod = rulesModule.currentCompetitionCreditPeriod;
  testCompetitionCreditRule = testingModule.testCompetitionCreditRule;

  const client = new MongoClient(mongoUri, { maxPoolSize: 4 });
  try {
    await client.connect();
    db = client.db(databaseName);
    await reserveReleaseAndReplay();
    await missingProjection();
    await staleProjection();
    await blockedHistoricalLots();
    console.log('Mongo real competition credits: 4 escenarios OK.');
  } finally {
    await db?.dropDatabase();
    await client.close();
    const globalState = globalThis as typeof globalThis & {
      mongoIndexerClient?: MongoClient;
      mongoIndexerDb?: Db;
    };
    await globalState.mongoIndexerClient?.close();
    delete globalState.mongoIndexerClient;
    delete globalState.mongoIndexerDb;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
