import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRewardPublisherCanaryFixture } from './reward-batch-publisher-canary-fixture.mjs';
import { stableRewardPublicationHash } from './reward-batch-publication.mjs';
import { assertRewardPublicationPlanForwardEligible } from './reward-publication-forward-fence.mjs';
import {
  buildRewardPublicationCandidatePipeline,
  prepareNextRewardPublicationPlan,
} from './reward-publication-preparer.mjs';

const DISTRIBUTOR = '0x6666666666666666666666666666666666666666';
const TOKEN = '0x7777777777777777777777777777777777777777';
const PLAYER = '0x1111111111111111111111111111111111111111';
const NOW = new Date('2026-08-20T16:05:00.000Z');
const FORWARD_ACTIVATION_AT = new Date('2026-08-20T16:00:00.000Z');

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
    const activation = pipeline[0].$match.createdAt?.$gte;
    const limit = pipeline.at(-1).$limit;
    const eligible = this.rows
      .filter((row) => row.status === 'allocated_offchain'
        && row.availableAt <= cutoff
        && (activation === undefined || row.createdAt >= activation))
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
    return new MemoryCursor(limit === undefined ? grouped : grouped.slice(0, limit));
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

function prepare(input, options = {}) {
  return prepareNextRewardPublicationPlan({
    ...input,
    chainId: 97,
    tokenAddress: TOKEN,
    distributorAddress: DISTRIBUTOR,
    now: options.now ?? NOW,
  });
}

function addCanonicalDailyFixture(context, dayId, input = {}) {
  const createdAt = input.createdAt ?? NOW;
  const availableAt = input.availableAt ?? createdAt;
  const amountRaw = input.amountRaw ?? context.fixture.amountRaw;
  const accountingId = `reward-daily:${dayId}`;
  const allocationId = `allocation:${dayId}`;
  const allocationImmutable = {
    accountingId,
    accountingKind: 'daily',
    periodId: dayId,
    allocationId,
    walletNormalized: PLAYER,
    category: 'player',
    amountRaw,
    fundingMode: 'daily_emission',
    sourceIds: ['source-a'],
    availableAt,
    status: 'allocated_offchain',
    createdAt,
  };
  const allocation = {
    _id: allocationId,
    ...allocationImmutable,
    payloadHash: stableRewardPublicationHash({
      kind: 'reward-accounting-allocation-document',
      ...allocationImmutable,
    }),
  };
  const sealedAllocation = {
    allocationId,
    walletNormalized: PLAYER,
    category: 'player',
    amountRaw,
    fundingMode: 'daily_emission',
    sourceIds: ['source-a'],
  };
  const accountingPayload = {
    dayId,
    ruleVersion: context.fixture.rule.version,
    ruleConfigHash: context.fixture.rule.configHash,
    sourceIds: ['source-a'],
    sourceSetHash: 'a'.repeat(64),
    sourceReservedRaw: amountRaw,
    capacityMaterializedRaw: '0',
    priorReservedInflowRaw: '0',
    topupRaw: '0',
    emissionRaw: amountRaw,
    buckets: {
      playersRaw: amountRaw,
      creditPoolRaw: '0',
      cukiePoolRaw: '0',
      ambassadorOrdinaryRaw: '0',
      weeklyPrizeRaw: '0',
      ambassadorWeeklyRaw: '0',
    },
    undistributed: {
      totalRaw: '0',
      treasuryRaw: '0',
      marketingDevelopmentRaw: '0',
      supplyReductionRaw: '0',
    },
    priorReservedUndistributed: {
      totalRaw: '0',
      treasuryRaw: '0',
      marketingDevelopmentRaw: '0',
      supplyReductionRaw: '0',
    },
    destinations: context.fixture.accounting.destinations,
    allocations: [sealedAllocation],
    conservationRaw: amountRaw,
  };
  const accounting = {
    _id: accountingId,
    ...accountingPayload,
    payloadHash: stableRewardPublicationHash(accountingPayload),
    status: 'sealed',
    sealedAt: availableAt,
  };
  context.db.rows.get('reward_accounting_allocations').push(allocation);
  context.db.rows.get('reward_daily_accounting').push(accounting);
  return { accounting, allocation };
}

test('ordena los cierres despues de agrupar para publicar primero el mas antiguo', () => {
  const pipeline = buildRewardPublicationCandidatePipeline(NOW, 50);
  assert.deepEqual(pipeline, [
    { $match: { status: 'allocated_offchain', availableAt: { $lte: NOW } } },
    { $sort: { availableAt: 1, accountingId: 1, _id: 1 } },
    {
      $group: {
        _id: '$accountingId',
        accountingKind: { $first: '$accountingKind' },
        availableAt: { $first: '$availableAt' },
      },
    },
    { $sort: { availableAt: 1, _id: 1 } },
    { $limit: 50 },
  ]);
});

test('el pipeline de publicacion excluye allocations anteriores a la frontera', () => {
  const activation = new Date('2026-08-20T16:00:00.000Z');
  assert.deepEqual(buildRewardPublicationCandidatePipeline(NOW, 50, activation)[0], {
    $match: {
      status: 'allocated_offchain',
      availableAt: { $lte: NOW },
      createdAt: { $gte: activation },
    },
  });
});

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

test('el preparador no crea artefactos para una allocation historica', async () => {
  const context = setup();
  context.db.rows.get('reward_accounting_allocations')[0].createdAt = new Date(
    '2026-08-20T15:59:59.999Z',
  );
  const result = await prepare({
    ...context,
    forwardActivationAt: new Date('2026-08-20T16:00:00.000Z'),
  });
  assert.equal(result, null);
  assert.equal(context.db.rows.get('reward_publication_plans').length, 0);
  assert.equal(context.db.rows.get('reward_claim_batches').length, 0);
  assert.equal(context.db.rows.get('reward_claim_proofs').length, 0);
});

test('el periodo diario canonico no entra aunque su allocation se cree despues de la frontera', async () => {
  const context = setup();
  context.db.rows.set('reward_accounting_allocations', []);
  context.db.rows.set('reward_daily_accounting', []);
  addCanonicalDailyFixture(context, '2026-08-19', {
    createdAt: new Date('2026-08-20T16:05:00.000Z'),
  });
  const result = await prepare(context, { now: NOW });
  const fenced = await prepare({
    ...context,
    forwardActivationAt: FORWARD_ACTIVATION_AT,
  }, { now: NOW });
  assert.equal(result.plan.accountingId, 'reward-daily:2026-08-19');
  assert.throws(() => assertRewardPublicationPlanForwardEligible({
    plan: result.plan,
    accounting: context.db.rows.get('reward_daily_accounting')[0],
    accountingKind: 'daily',
    rule: context.fixture.rule,
    forwardActivationAt: FORWARD_ACTIVATION_AT,
  }), /comienza antes/);
  assert.equal(fenced, null);
  assert.equal(context.db.rows.get('reward_publication_plans').length, 1);
  assert.equal(context.db.rows.get('reward_claim_batches').length, 1);
  assert.equal(context.db.rows.get('reward_claim_proofs').length, 1);
});

test('salta el periodo antiguo y prepara el primer diario completo posterior a la frontera', async () => {
  const context = setup();
  context.db.rows.set('reward_accounting_allocations', []);
  context.db.rows.set('reward_daily_accounting', []);
  addCanonicalDailyFixture(context, '2026-08-19', {
    createdAt: new Date('2026-08-20T16:05:00.000Z'),
    availableAt: new Date('2026-08-20T16:05:00.000Z'),
  });
  addCanonicalDailyFixture(context, '2026-08-21', {
    createdAt: new Date('2026-08-22T16:05:00.000Z'),
    availableAt: new Date('2026-08-22T16:05:00.000Z'),
  });
  const result = await prepare({
    ...context,
    forwardActivationAt: FORWARD_ACTIVATION_AT,
  }, { now: new Date('2026-08-22T16:05:00.000Z') });
  assert.equal(result.plan.accountingId, 'reward-daily:2026-08-21');
  assert.equal(context.db.rows.get('reward_publication_plans').length, 1);
  assert.equal(context.db.rows.get('reward_publication_plans')[0].accountingId, 'reward-daily:2026-08-21');
});

test('no repite un plan completed cuando existe otro cierre diario elegible', async () => {
  const context = setup();
  context.db.rows.set('reward_accounting_allocations', []);
  context.db.rows.set('reward_daily_accounting', []);
  addCanonicalDailyFixture(context, '2026-08-21', {
    createdAt: new Date('2026-08-22T16:05:00.000Z'),
    availableAt: new Date('2026-08-22T16:05:00.000Z'),
  });
  addCanonicalDailyFixture(context, '2026-08-22', {
    createdAt: new Date('2026-08-23T16:05:00.000Z'),
    availableAt: new Date('2026-08-23T16:05:00.000Z'),
  });
  const input = {
    ...context,
    forwardActivationAt: FORWARD_ACTIVATION_AT,
  };
  const first = await prepare(input, { now: new Date('2026-08-23T16:05:00.000Z') });
  assert.equal(first.plan.accountingId, 'reward-daily:2026-08-21');
  context.db.rows.get('reward_publication_plans')[0].status = 'completed';

  const second = await prepare(input, { now: new Date('2026-08-23T16:05:00.000Z') });
  assert.equal(second.plan.accountingId, 'reward-daily:2026-08-22');
  assert.equal(context.db.rows.get('reward_publication_plans').length, 2);
});

test('recorre todo el backlog candidateado antes de descartar historicos y alcanza un cierre nuevo', async () => {
  const context = setup();
  context.db.rows.set('reward_accounting_allocations', []);
  context.db.rows.set('reward_daily_accounting', []);
  for (let index = 0; index < 50; index += 1) {
    const dayId = new Date(Date.UTC(2026, 5, 1 + index)).toISOString().slice(0, 10);
    addCanonicalDailyFixture(context, dayId, {
      createdAt: new Date('2026-08-20T16:05:00.000Z'),
      availableAt: new Date('2026-08-20T16:05:00.000Z'),
    });
  }
  addCanonicalDailyFixture(context, '2026-08-21', {
    createdAt: new Date('2026-08-22T16:05:00.000Z'),
    availableAt: new Date('2026-08-22T16:05:00.000Z'),
  });
  const result = await prepare({
    ...context,
    forwardActivationAt: FORWARD_ACTIVATION_AT,
  }, { now: new Date('2026-08-22T16:05:00.000Z') });
  assert.equal(result.plan.accountingId, 'reward-daily:2026-08-21');
  assert.equal(context.db.rows.get('reward_publication_plans').length, 1);
});

test('ignora allocations intermedias mientras no exista un cierre contable final', async () => {
  const context = setup();
  context.db.rows.set('reward_accounting_allocations', []);
  context.db.rows.set('reward_allocations', [{
    _id: 'intermediate-allocation',
    allocationId: 'intermediate-allocation',
    walletNormalized: PLAYER,
    amountRaw: '1000000000000000000',
    status: 'allocated',
  }]);

  const result = await prepare(context);

  assert.equal(result, null);
  assert.equal(context.db.rows.get('reward_allocations').length, 1);
  assert.equal(context.db.rows.get('reward_publication_plans').length, 0);
  assert.equal(context.db.rows.get('reward_claim_batches').length, 0);
  assert.equal(context.db.rows.get('reward_claim_proofs').length, 0);
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
