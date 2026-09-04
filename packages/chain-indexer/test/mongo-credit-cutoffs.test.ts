import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexerStore } from '../src/storage/mongo.js';

function storeWithCutoffState(options: { migratedAt?: Date; rules?: Record<string, unknown>[]; resolvedIds?: string[] } = {}) {
  let ruleQuery: Record<string, unknown> | null = null;
  const migratedAt = options.migratedAt ?? new Date('2026-07-02T15:00:00.000Z');
  const collections: Record<string, Record<string, unknown>> = {
    economy_schema_metadata: {
      findOne: async () => ({
        _id: 'uki-economy',
        schemaVersion: 3,
        migratedAt,
      }),
    },
    cukie_master_slot_history_state: {
      find: () => ({
        limit: () => ({
          toArray: async () => [
            { _id: 'uki', completeFrom: migratedAt },
            { _id: 'nft', completeFrom: migratedAt },
          ],
        }),
      }),
    },
    economy_rule_versions: {
      find: (query: Record<string, unknown>) => {
        ruleQuery = query;
        return {
          sort: () => ({
            limit: () => ({
              toArray: async () => options.rules ?? [{
                _id: 'retired-rule',
                active: false,
                scope: 'competition_credits',
                activeFrom: new Date('2026-07-01T00:00:00.000Z'),
                activeUntil: new Date('2026-07-05T00:00:00.000Z'),
                cutoffHourUtc: 14,
                cutoffMinuteUtc: 0,
              }],
            }),
          }),
        };
      },
    },
    competition_credit_cutoff_blocks: {
      find: () => ({ toArray: async () => (options.resolvedIds ?? []).map((_id) => ({ _id })) }),
    },
  };
  const store = Object.create(IndexerStore.prototype) as IndexerStore;
  Object.defineProperty(store, 'db', {
    value: {
      collection: (name: string) => collections[name],
    },
  });
  return { store, migratedAt, readRuleQuery: () => ruleQuery };
}

test('enumerates retired historical credit rules only from the verified schema/history boundary', async () => {
  const { store, migratedAt, readRuleQuery } = storeWithCutoffState();

  const cutoffs = await store.listUnresolvedCompetitionCreditCutoffs(
    new Date('2026-07-04T18:00:00.000Z'),
    10,
  );

  assert.equal('active' in (readRuleQuery() ?? {}), false);
  assert.deepEqual(cutoffs.map((cutoff) => cutoff.toISOString()), [
    '2026-07-03T14:00:00.000Z',
    '2026-07-04T14:00:00.000Z',
  ]);
  assert.ok(cutoffs.every((cutoff) => cutoff > migratedAt));
});

const fastAnchor = new Date('2026-09-04T12:00:00.000Z');
const fastAt = (seconds: number) => new Date(fastAnchor.getTime() + seconds * 1000);
const fastCalendar = { version: 'cycle-v1', chainId: 97, cycleSeconds: 1800, anchorAt: fastAnchor.toISOString() };
const fastRule = { _id: 'fast-credits', scope: 'competition_credits', active: true, activeFrom: fastAnchor, cutoffHourUtc: 14, cutoffMinuteUtc: 0, calendar: fastCalendar };

test('enumerates seven real 30-minute intervals including both exact weekly boundaries', async () => {
  const { store } = storeWithCutoffState({ migratedAt: fastAnchor, rules: [fastRule] });
  const exact = await store.listUnresolvedCompetitionCreditCutoffs(fastAt(12600), 20);
  assert.deepEqual(exact.map((cutoff) => cutoff.toISOString()), Array.from({ length: 8 }, (_, index) => fastAt(index * 1800).toISOString()));
  for (let index = 1; index < exact.length; index += 1) assert.equal(exact[index].getTime() - exact[index - 1].getTime(), 1800000);
  const before = await store.listUnresolvedCompetitionCreditCutoffs(fastAt(12599), 20);
  assert.equal(before.length, 7);
  assert.equal(before.at(-1)?.toISOString(), fastAt(10800).toISOString());
});

test('rounds incomplete coverage forward, deduplicates rules and skips resolved cutoffs before limiting', async () => {
  const { store } = storeWithCutoffState({ migratedAt: fastAt(900), rules: [fastRule, { ...fastRule, _id: 'duplicate-history' }], resolvedIds: [fastAt(1800).toISOString()] });
  const cutoffs = await store.listUnresolvedCompetitionCreditCutoffs(fastAt(7200), 2);
  assert.deepEqual(cutoffs.map((cutoff) => cutoff.toISOString()), [fastAt(3600).toISOString(), fastAt(5400).toISOString()]);
});

test('refuses accelerated calendars from chain 56, unsupported durations and unaligned anchors', async () => {
  for (const calendar of [
    { ...fastCalendar, chainId: 56 },
    { ...fastCalendar, cycleSeconds: 60 },
    { ...fastCalendar, anchorAt: fastAt(1).toISOString() },
    { ...fastCalendar, anchorAt: 'invalid' },
  ]) {
    const { store } = storeWithCutoffState({ migratedAt: fastAnchor, rules: [{ ...fastRule, calendar }] });
    await assert.rejects(store.listUnresolvedCompetitionCreditCutoffs(fastAt(1800), 10), /Calendario de creditos invalido/);
  }
});
