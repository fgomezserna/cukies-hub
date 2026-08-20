import assert from 'node:assert/strict';
import test from 'node:test';

import { IndexerStore } from '../src/storage/mongo.js';

function storeWithCutoffState() {
  let ruleQuery: Record<string, unknown> | null = null;
  const migratedAt = new Date('2026-07-02T15:00:00.000Z');
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
              toArray: async () => [{
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
      find: () => ({ toArray: async () => [] }),
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
