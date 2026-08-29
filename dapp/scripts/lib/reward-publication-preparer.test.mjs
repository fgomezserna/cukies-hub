import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRewardPublisherCanaryFixture } from './reward-batch-publisher-canary-fixture.mjs';
import { prepareNextRewardPublicationPlan } from './reward-publication-preparer.mjs';

const DISTRIBUTOR = '0x6666666666666666666666666666666666666666';
const TOKEN = '0x7777777777777777777777777777777777777777';
const PLAYER = '0x1111111111111111111111111111111111111111';
const NOW = new Date('2026-08-20T16:05:00.000Z');

function matches(document, filter) {
  return Object.entries(filter).every(([key, expected]) => document[key] === expected);
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
}

class MemoryCollection {
  constructor(name, rows) {
    this.name = name;
    this.rows = rows;
  }

  async findOne(filter) {
    return this.rows.find((row) => matches(row, filter)) ?? null;
  }

  find(filter) {
    return new MemoryCursor(this.rows.filter((row) => matches(row, filter)));
  }

  aggregate(pipeline) {
    if (this.name !== 'reward_accounting_allocations') {
      throw new Error(`Aggregate inesperado sobre ${this.name}.`);
    }
    const cutoff = pipeline[0].$match.availableAt.$lte;
    const limit = pipeline.at(-1).$limit;
    const eligible = this.rows
      .filter((row) => row.status === 'allocated_offchain' && row.availableAt <= cutoff)
      .sort((left, right) => (
        left.availableAt.getTime() - right.availableAt.getTime()
        || left.accountingId.localeCompare(right.accountingId)
        || left._id.localeCompare(right._id)
      ));
    const grouped = [];
    const seen = new Set();
    for (const row of eligible) {
      if (seen.has(row.accountingId)) continue;
      seen.add(row.accountingId);
      grouped.push({ _id: row.accountingId, accountingKind: row.accountingKind });
    }
    return new MemoryCursor(grouped.slice(0, limit));
  }

  async insertOne(document) {
    if (this.rows.some((row) => row._id === document._id)) {
      const error = new Error('duplicate key');
      error.code = 11000;
      throw error;
    }
    this.rows.push(structuredClone(document));
    return { insertedId: document._id };
  }

  async insertMany(documents) {
    for (const document of documents) await this.insertOne(document);
    return { insertedCount: documents.length };
  }
}

class MemoryDb {
  constructor(fixture) {
    this.rows = new Map([
      ['reward_accounting_allocations', [structuredClone(fixture.allocation)]],
      ['reward_daily_accounting', [structuredClone(fixture.accounting)]],
      ['reward_weekly_prize_accounting', []],
      ['economy_rule_versions', [structuredClone(fixture.rule)]],
      ['reward_claim_proofs', []],
      ['reward_claim_batches', []],
      ['reward_publication_plans', []],
    ]);
  }

  collection(name) {
    if (!this.rows.has(name)) this.rows.set(name, []);
    return new MemoryCollection(name, this.rows.get(name));
  }
}

class MemoryMongoClient {
  startSession() {
    return {
      withTransaction: async (work) => work(),
      endSession: async () => undefined,
    };
  }
}

function setup() {
  const fixture = buildRewardPublisherCanaryFixture({
    now: NOW,
    distributorAddress: DISTRIBUTOR,
    accountAddress: PLAYER,
  });
  return {
    fixture,
    db: new MemoryDb(fixture),
    mongoClient: new MemoryMongoClient(),
  };
}

function prepare(input) {
  return prepareNextRewardPublicationPlan({
    ...input,
    chainId: 97,
    tokenAddress: TOKEN,
    distributorAddress: DISTRIBUTOR,
    now: NOW,
  });
}

test('persiste un draft preview-only y un plan sin autorizar ni firmar', async () => {
  const context = setup();
  const result = await prepare(context);
  assert.equal(result.replayed, false);
  assert.equal(result.plan.status, 'prepared');
  assert.equal(result.plan.accountingId, context.fixture.accountingId);
  assert.equal(result.plan.claimableTotalRaw, context.fixture.amountRaw);
  assert.equal(result.plan.operations.every((operation) => (
    operation.transactionHash === null
      && operation.signedRawTransaction === null
      && operation.confirmedAt === null
  )), true);

  const batches = context.db.rows.get('reward_claim_batches');
  const proofs = context.db.rows.get('reward_claim_proofs');
  assert.equal(batches.length, 1);
  assert.equal(proofs.length, 1);
  assert.equal(batches[0].previewOnly, true);
  assert.equal(batches[0].publishAuthorized, false);
  assert.equal(batches[0].signature, null);
  assert.equal(batches[0].transactionHash, null);
});

test('el replay no duplica plan, batch ni proofs', async () => {
  const context = setup();
  await prepare(context);
  const replay = await prepare(context);
  assert.equal(replay, null);
  assert.equal(context.db.rows.get('reward_publication_plans').length, 1);
  assert.equal(context.db.rows.get('reward_claim_batches').length, 1);
  assert.equal(context.db.rows.get('reward_claim_proofs').length, 1);
});

test('rechaza una allocation manipulada antes de persistir artifacts', async () => {
  const context = setup();
  context.db.rows.get('reward_accounting_allocations')[0].amountRaw = '11';
  await assert.rejects(() => prepare(context), /no es canonica/);
  assert.equal(context.db.rows.get('reward_publication_plans').length, 0);
  assert.equal(context.db.rows.get('reward_claim_batches').length, 0);
  assert.equal(context.db.rows.get('reward_claim_proofs').length, 0);
});

test('rechaza una clase contable desconocida de forma fail-closed', async () => {
  const context = setup();
  context.db.rows.get('reward_accounting_allocations')[0].accountingKind = 'future';
  await assert.rejects(() => prepare(context), /accountingKind invalido/);
  assert.equal(context.db.rows.get('reward_publication_plans').length, 0);
});
