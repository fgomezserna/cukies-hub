import assert from 'node:assert/strict';
import test from 'node:test';

import { acquireRewardPublicationPlan } from './reward-publication-plan-acquirer.mjs';

const ACTIVATION_AT = new Date('2026-08-20T16:00:00.000Z');
const NOW = new Date('2026-08-22T16:05:00.000Z');

function matchesFilter(row, filter) {
  if (filter._id !== undefined && row._id !== filter._id) return false;
  if (filter.accountingId !== undefined && row.accountingId !== filter.accountingId) return false;
  if (filter.status?.$nin?.includes(row.status)) return false;
  if (filter.createdAt?.$gte && row.createdAt < filter.createdAt.$gte) return false;
  if (filter.$or && !filter.$or.some((condition) => {
    if (condition.leaseExpiresAt === null) return row.leaseExpiresAt === null;
    if (condition.leaseExpiresAt?.$exists) {
      return condition.leaseExpiresAt.$exists === true && row.leaseExpiresAt === undefined;
    }
    if (condition.leaseExpiresAt?.$lte) return row.leaseExpiresAt <= condition.leaseExpiresAt.$lte;
    if (condition.leaseOwner !== undefined) return row.leaseOwner === condition.leaseOwner;
    return false;
  })) return false;
  return true;
}

class MemoryCursor {
  constructor(rows) {
    this.rows = rows;
  }

  sort(specification) {
    const fields = Object.entries(specification);
    this.rows.sort((left, right) => {
      for (const [field, direction] of fields) {
        const leftValue = left[field] instanceof Date ? left[field].getTime() : left[field];
        const rightValue = right[field] instanceof Date ? right[field].getTime() : right[field];
        if (leftValue < rightValue) return -1 * direction;
        if (leftValue > rightValue) return direction;
      }
      return 0;
    });
    return this;
  }

  async toArray() {
    return [...this.rows];
  }

  async *[Symbol.asyncIterator]() {
    for (const row of this.rows) yield row;
  }
}

class MemoryCollection {
  constructor(rows) {
    this.rows = rows;
  }

  find(filter) {
    return new MemoryCursor(this.rows.filter((row) => matchesFilter(row, filter)));
  }

  async findOne(filter) {
    return this.rows.find((row) => matchesFilter(row, filter)) ?? null;
  }

  async findOneAndUpdate(filter, update) {
    const row = this.rows.find((candidate) => matchesFilter(candidate, filter));
    if (!row) return null;
    Object.assign(row, update.$set ?? {});
    for (const [field, amount] of Object.entries(update.$inc ?? {})) {
      row[field] = Number(row[field] ?? 0) + amount;
    }
    return row;
  }
}

class MemoryDb {
  constructor({ plans, accountings, allocations, rules }) {
    this.rows = new Map([
      ['reward_publication_plans', plans],
      ['reward_daily_accounting', accountings],
      ['reward_accounting_allocations', allocations],
      ['economy_rule_versions', rules],
    ]);
  }

  collection(name) {
    if (!this.rows.has(name)) this.rows.set(name, []);
    return new MemoryCollection(this.rows.get(name));
  }
}

function oldDayId(index) {
  const value = new Date(Date.UTC(2023, 0, 1 + index));
  return value.toISOString().slice(0, 10);
}

function buildFixture() {
  const plans = [];
  const accountings = [];
  const allocations = [];
  const ruleVersion = 'rewards-staging-test-v3';
  const rule = {
    scope: 'reward_allocations',
    version: ruleVersion,
    emissionBudget: { dayBoundarySecondUtc: 14 * 60 * 60 },
  };
  for (let index = 0; index < 1_000; index += 1) {
    const dayId = oldDayId(index);
    const accountingId = `reward-daily:${dayId}`;
    plans.push({
      _id: `plan-${String(index).padStart(4, '0')}`,
      planId: `plan-${String(index).padStart(4, '0')}`,
      accountingId,
      accountingKind: 'daily',
      periodId: `reward-accounting:${accountingId}`,
      status: 'prepared',
      createdAt: new Date('2026-08-20T16:05:00.000Z'),
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    accountings.push({ _id: accountingId, dayId, ruleVersion });
    allocations.push({
      accountingId,
      accountingKind: 'daily',
      periodId: dayId,
    });
  }
  const accountingId = 'reward-daily:2026-08-21';
  plans.push({
    _id: 'plan-new',
    planId: 'plan-new',
    accountingId,
    accountingKind: 'daily',
    periodId: `reward-accounting:${accountingId}`,
    status: 'prepared',
    createdAt: new Date('2026-08-20T16:06:00.000Z'),
    leaseOwner: null,
    leaseExpiresAt: null,
  });
  accountings.push({ _id: accountingId, dayId: '2026-08-21', ruleVersion });
  allocations.push({ accountingId, accountingKind: 'daily', periodId: '2026-08-21' });
  return { db: new MemoryDb({ plans, accountings, allocations, rules: [rule] }), plans };
}

test('adquiere el nuevo plan despues de recorrer mil planes historicos completos', async () => {
  const fixture = buildFixture();
  const result = await acquireRewardPublicationPlan(
    fixture.db,
    {
      schedulerId: 'publisher',
      leaseMs: 300_000,
      forwardActivationAt: ACTIVATION_AT.toISOString(),
    },
    NOW,
  );
  assert.equal(result.accountingId, 'reward-daily:2026-08-21');
  assert.equal(result.leaseOwner, 'publisher');
  assert.equal(fixture.plans.filter((plan) => plan.leaseOwner === 'publisher').length, 1);
  assert.equal(fixture.plans.filter((plan) => plan.accountingId.startsWith('reward-daily:2023-')).some(
    (plan) => plan.leaseOwner !== null,
  ), false);
});
