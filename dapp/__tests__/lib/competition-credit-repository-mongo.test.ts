jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/indexer-db/mongodb', () => ({
  getEconomyDb: jest.fn(),
  withEconomyTransaction: jest.fn(),
}));

import type { ClientSession, Db } from 'mongodb';

import { withEconomyTransaction } from '@/lib/indexer-db/mongodb';
import {
  mongoCompetitionCreditTransactionRunner,
} from '@/lib/uki-economy/credits/repository';
import { currentCompetitionCreditPeriod } from '@/lib/uki-economy/credits/rules';
import { testCompetitionCreditRule } from '@/lib/uki-economy/credits/testing';
import type {
  CompetitionCreditRun,
  CreditLot,
  CreditPoolPeriod,
  CreditReservation,
} from '@/lib/uki-economy/credits/types';

type Row = Record<string, any>;

function clone<T>(value: T): T {
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (Array.isArray(value)) return value.map((item) => clone(item)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Row).map(([key, child]) => [key, clone(child)]),
    ) as T;
  }
  return value;
}

function pathValue(row: Row, path: string) {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Row)[key] : undefined
  ), row);
}

function sameValue(left: unknown, right: unknown) {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  return left === right;
}

function matches(row: Row, filter: Row): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return (expected as Row[]).some((child) => matches(row, child));
    if (key === '$and') return (expected as Row[]).every((child) => matches(row, child));
    const actual = pathValue(row, key);
    if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
      const operators = expected as Row;
      return Object.entries(operators).every(([operator, value]) => {
        switch (operator) {
          case '$in': return (value as unknown[]).some((candidate) => sameValue(actual, candidate));
          case '$gt': return actual instanceof Date && value instanceof Date
            ? actual.getTime() > value.getTime()
            : (actual as any) > value;
          case '$gte': return actual instanceof Date && value instanceof Date
            ? actual.getTime() >= value.getTime()
            : (actual as any) >= value;
          case '$lt': return actual instanceof Date && value instanceof Date
            ? actual.getTime() < value.getTime()
            : (actual as any) < value;
          case '$lte': return actual instanceof Date && value instanceof Date
            ? actual.getTime() <= value.getTime()
            : (actual as any) <= value;
          case '$exists': return Boolean(value) === (actual !== undefined);
          case '$ne': return !sameValue(actual, value);
          default: return false;
        }
      });
    }
    return sameValue(actual, expected);
  });
}

function project(row: Row, projection?: Row) {
  if (!projection) return row;
  const include = Object.entries(projection)
    .filter(([key, value]) => key !== '_id' && value === 1)
    .map(([key]) => key);
  if (include.length === 0) return row;
  return Object.fromEntries(include
    .map((key) => [key, pathValue(row, key)])
    .filter(([, value]) => value !== undefined));
}

class FakeCollection {
  constructor(readonly rows: Row[]) {}

  findOne = jest.fn(async (filter: Row, options?: { projection?: Row }) => {
    const row = this.rows.find((candidate) => matches(candidate, filter));
    return row ? clone(project(row, options?.projection)) : null;
  });

  find = jest.fn((filter: Row, options?: { projection?: Row }) => {
    const source = this.rows;
    let queryLimit = Number.POSITIVE_INFINITY;
    const query: {
      sort: jest.Mock;
      limit: jest.Mock;
      toArray: jest.Mock;
    } = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn((limit: number) => {
        queryLimit = limit;
        return query;
      }),
      toArray: jest.fn(async () => clone(source
        .filter((row) => matches(row, filter))
        .slice(0, queryLimit)
        .map((row) => project(row, options?.projection)))),
    };
    return query;
  });

  distinct = jest.fn(async (field: string, filter: Row) => [
    ...new Set(this.rows
      .filter((row) => matches(row, filter))
      .map((row) => pathValue(row, field))),
  ]);

  countDocuments = jest.fn(async (filter: Row) => this.rows.filter((row) => matches(row, filter)).length);

  insertOne = jest.fn(async (row: Row) => {
    this.rows.push(row);
    return { acknowledged: true, insertedId: row._id };
  });

  insertMany = jest.fn(async (rows: Row[]) => {
    this.rows.push(...rows);
    return { acknowledged: true, insertedCount: rows.length };
  });

  updateOne = jest.fn(async (filter: Row, update: Row, options?: { upsert?: boolean }) => {
    let row = this.rows.find((candidate) => matches(candidate, filter));
    const upserted = !row && options?.upsert;
    if (!row && upserted) {
      row = {
        ...clone(filter),
        ...(update.$setOnInsert ?? {}),
      };
      this.rows.push(row as Row);
    }
    if (!row) return { acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    for (const [key, amount] of Object.entries(update.$inc ?? {})) {
      row[key] = (row[key] ?? 0) + amount;
    }
    Object.assign(row, update.$set ?? {});
    for (const key of Object.keys(update.$unset ?? {})) delete row[key];
    return {
      acknowledged: true,
      matchedCount: upserted ? 0 : 1,
      modifiedCount: 1,
      upsertedCount: upserted ? 1 : 0,
    };
  });

  bulkWrite = jest.fn(async (operations: Row[]) => {
    let matchedCount = 0;
    let modifiedCount = 0;
    for (const operation of operations) {
      const result = await this.updateOne(
        operation.updateOne.filter,
        operation.updateOne.update,
      );
      matchedCount += result.matchedCount;
      modifiedCount += result.modifiedCount;
    }
    return { acknowledged: true, matchedCount, modifiedCount };
  });

  findOneAndUpdate = jest.fn(async (filter: Row, update: Row) => {
    const row = this.rows.find((candidate) => matches(candidate, filter));
    if (!row) return null;
    for (const [key, amount] of Object.entries(update.$inc ?? {})) {
      row[key] = (row[key] ?? 0) + amount;
    }
    Object.assign(row, update.$set ?? {});
    for (const key of Object.keys(update.$unset ?? {})) delete row[key];
    return clone(row);
  });

  updateMany = jest.fn(async (filter: Row, update: Row) => {
    const rows = this.rows.filter((candidate) => matches(candidate, filter));
    rows.forEach((row) => Object.assign(row, update.$set ?? {}));
    return { acknowledged: true, matchedCount: rows.length, modifiedCount: rows.length };
  });
}

class FakeDb {
  readonly databaseName = 'credits-test';
  private readonly collections = new Map<string, FakeCollection>();

  constructor(initial: Record<string, Row[]> = {}) {
    for (const [name, rows] of Object.entries(initial)) this.collections.set(name, new FakeCollection(rows));
  }

  collection = jest.fn((name: string) => {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection([]));
    return this.collections.get(name)!;
  });

  snapshot() {
    return Object.fromEntries([...this.collections.entries()].map(([name, collection]) => [name, clone(collection.rows)]));
  }

  restore(snapshot: Record<string, Row[]>) {
    for (const [name, collection] of this.collections.entries()) {
      if (!(name in snapshot)) collection.rows.splice(0, collection.rows.length);
    }
    for (const [name, rows] of Object.entries(snapshot)) {
      const collection = this.collection(name);
      collection.rows.splice(0, collection.rows.length, ...clone(rows));
    }
  }
}

const wallet = `0x${'1'.repeat(40)}`;
const now = new Date('2026-09-07T08:35:37.000Z');

function fixture(options: { projection?: Partial<CreditPoolPeriod>; blocked?: unknown } = {}) {
  const rule = testCompetitionCreditRule();
  const period = currentCompetitionCreditPeriod(now, rule);
  const run: CompetitionCreditRun = {
    _id: 'run-open-mongo',
    runId: 'run-open-mongo',
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
    _id: 'pool-lot-mongo',
    lotId: 'pool-lot-mongo',
    bucket: 'pool',
    route: 'uki',
    walletNormalized: null,
    periodId: period.periodId,
    runId: run.runId,
    runItemId: 'run-item-mongo',
    sourceSlotId: 'slot-mongo',
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
    _id: 'reservation-mongo',
    reservationId: 'reservation-mongo',
    sessionId: 'session-mongo',
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
    idempotencyKey: 'reservation-mongo-key',
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
  const db = new FakeDb({
    economy_schema_metadata: [{ _id: 'uki-economy', schemaVersion: 3, dbName: 'credits-test' }],
    competition_credit_runs: [run],
    competition_credit_pool_lots: [lot],
    competition_credit_pool_periods: [projection],
  });
  return { db, rule, period, run, lot, reservation, projection };
}

async function runInTransaction<T>(db: FakeDb, work: Parameters<typeof mongoCompetitionCreditTransactionRunner>[0]) {
  const before = db.snapshot();
  (withEconomyTransaction as jest.Mock).mockImplementationOnce(async (callback: (db: Db, session: ClientSession) => Promise<T>) => {
    try {
      return await callback(db as unknown as Db, {} as ClientSession);
    } catch (error) {
      db.restore(before);
      throw error;
    }
  });
  return mongoCompetitionCreditTransactionRunner(work);
}

describe('Mongo competition credit projection reconciliation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rolls back the lot CAS when an existing pool projection would go negative', async () => {
    const { db, reservation, lot, projection } = fixture({ projection: { availableCredits: 0 } });
    const before = db.snapshot();

    await expect(runInTransaction(db, (repository) => repository.reserveLots({ reservation, now })))
      .rejects.toMatchObject({ code: 'CONFLICT', details: { reason: 'CREDIT_PROJECTION_NEGATIVE' } });

    expect(db.collection('competition_credit_pool_lots').rows).toEqual(before.competition_credit_pool_lots);
    expect(db.collection('competition_credit_pool_periods').rows).toEqual([projection]);
    expect(db.collection('competition_credit_reservations').rows).toHaveLength(0);
  });

  it('reserves and releases against a coherent Mongo projection without drifting totals', async () => {
    const { db, reservation, period } = fixture();
    await runInTransaction(db, (repository) => repository.reserveLots({ reservation, now }));

    const poolLots = db.collection('competition_credit_pool_lots').rows;
    const poolPeriods = db.collection('competition_credit_pool_periods').rows;
    expect(poolLots[0]).toMatchObject({ availableCredits: 90, reservedCredits: 10, revision: 1 });
    expect(poolPeriods[0]).toMatchObject({ availableCredits: 90, reservedCredits: 10, revision: 1 });
    const storedReservation = db.collection('competition_credit_reservations').rows[0] as CreditReservation;
    expect(storedReservation.idempotencyKey).toBe(reservation.idempotencyKey);

    const releaseAt = new Date(now.getTime() + 1_000);
    await runInTransaction(db, (repository) => repository.finishReservation({
      reservation: storedReservation,
      operation: 'release',
      idempotencyKey: 'release-mongo-key',
      payloadHash: 'release'.repeat(10),
      now: releaseAt,
    }));
    expect(poolLots[0]).toMatchObject({ availableCredits: 100, reservedCredits: 0, revision: 2 });
    expect(poolPeriods[0]).toMatchObject({ availableCredits: 100, reservedCredits: 0, revision: 2 });
    expect(db.collection('competition_credit_reservations').rows[0]).toMatchObject({ status: 'released', revision: 1 });

    const replay = await runInTransaction(db, (repository) => repository.finishReservation({
      reservation: storedReservation,
      operation: 'release',
      idempotencyKey: 'release-mongo-key',
      payloadHash: 'release'.repeat(10),
      now: releaseAt,
    }));
    expect(replay).toBeNull();
    expect(db.collection('competition_credit_pool_periods').rows[0]).toMatchObject({
      periodId: period.periodId,
      availableCredits: 100,
      reservedCredits: 0,
    });
  });

  it('materializes an absent pool projection from the post-CAS lots exactly once', async () => {
    const { db, reservation } = fixture();
    db.collection('competition_credit_pool_periods').rows.splice(0, 1);

    await runInTransaction(db, (repository) => repository.reserveLots({ reservation, now }));

    expect(db.collection('competition_credit_pool_periods').rows).toHaveLength(1);
    expect(db.collection('competition_credit_pool_periods').rows[0]).toMatchObject({
      contributedCredits: 100,
      availableCredits: 90,
      reservedCredits: 10,
      revision: 0,
    });
  });

  it.each([
    { label: 'blocked', blocked: true, reason: 'CREDIT_LOTS_BLOCKED' },
    { label: 'unknown', blocked: undefined, reason: 'CREDIT_LOT_MATERIALIZATION_UNKNOWN' },
  ])('rolls back when a $label historical pool lot makes materialization unsafe', async ({ blocked, reason }) => {
    const { db, reservation, lot } = fixture();
    const historical = clone(lot);
    historical._id = `historical-${String(blocked)}`;
    historical.lotId = historical._id;
    historical.runId = 'run-closed-historical';
    historical.availableCredits = 0;
    historical.totalCredits = 20;
    if (blocked === undefined) {
      delete (historical as Partial<CreditLot>).blocked;
    } else {
      historical.blocked = blocked;
    }
    db.collection('competition_credit_pool_lots').rows.push(historical);
    const before = db.snapshot();

    await expect(runInTransaction(db, (repository) => repository.reserveLots({ reservation, now })))
      .rejects.toMatchObject({ code: 'CONFLICT', details: { reason } });

    expect(db.collection('competition_credit_pool_lots').rows).toEqual(before.competition_credit_pool_lots);
    expect(db.collection('competition_credit_pool_periods').rows).toEqual(before.competition_credit_pool_periods);
    expect(db.collection('competition_credit_reservations').rows).toHaveLength(0);
  });
});
