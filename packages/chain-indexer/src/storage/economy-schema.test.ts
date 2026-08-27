import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ClientSession, Db } from 'mongodb';

import {
  ECONOMY_SCHEMA_METADATA_ID,
  ECONOMY_SCHEMA_VERSION,
  ECONOMY_V2_MIGRATION_ID,
  ECONOMY_V3_MIGRATION_ID,
  ECONOMY_V3_LEGACY_CREDIT_COLLECTIONS,
  EconomyTransactionSupportError,
  assertEconomyV3LegacyCreditCollectionsEmpty,
  assertEconomySchema,
  ensureEconomySchema,
  migrateEconomySchemaV1ToV2,
  migrateEconomySchemaV2ToV3,
  verifyEconomyTransactionSupport,
  type EconomySchemaMetadata,
} from './economy-schema.js';

function metadata(overrides: Partial<EconomySchemaMetadata> = {}): EconomySchemaMetadata {
  const timestamp = new Date('2026-07-10T10:00:00.000Z');
  return {
    _id: ECONOMY_SCHEMA_METADATA_ID,
    schemaVersion: ECONOMY_SCHEMA_VERSION,
    dbName: 'cukieshub-new',
    initializedAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function fakeDb(initial?: EconomySchemaMetadata) {
  let current = initial;
  let atomicUpdates = 0;
  const operations: string[] = [];

  const collection = {
    findOne: async (_filter: unknown, options?: { session?: ClientSession }) => {
      operations.push(`findOne:${options?.session ? 'session' : 'plain'}`);
      return current ?? null;
    },
    findOneAndUpdate: async (
      filter: Record<string, unknown>,
      update: {
        $setOnInsert?: Partial<EconomySchemaMetadata>;
        $set?: Partial<EconomySchemaMetadata>;
      },
      options: { upsert?: boolean; session?: ClientSession },
    ) => {
      atomicUpdates += 1;
      operations.push(`findOneAndUpdate:${options.session ? 'session' : 'plain'}`);
      const compatible = current
        && current._id === filter._id
        && current.schemaVersion === filter.schemaVersion
        && current.dbName === filter.dbName;

      if (current && !compatible) {
        if (options.upsert) throw { code: 11000 };
        return null;
      }

      if (!current) {
        if (!options.upsert) return null;
        current = {
          ...filter,
          ...update.$setOnInsert,
          ...update.$set,
        } as EconomySchemaMetadata;
      } else {
        current = { ...current, ...update.$set };
      }

      return current;
    },
  };

  const db = {
    databaseName: 'cukieshub-new',
    collection: () => collection,
  } as unknown as Db;

  return {
    db,
    setMetadata: (value: EconomySchemaMetadata) => {
      current = value;
    },
    state: () => ({ metadata: current, atomicUpdates, operations }),
  };
}

describe('economy schema sentinel', () => {
  it('preflights every legacy credit collection and reports all non-empty sources', async () => {
    const seen: string[] = [];
    const db = {
      collection: (name: string) => ({
        countDocuments: async () => {
          seen.push(name);
          return name === 'competition_credit_ledger' || name === 'credit_pool_positions' ? 2 : 0;
        },
      }),
    } as unknown as Db;

    await assert.rejects(
      assertEconomyV3LegacyCreditCollectionsEmpty(db),
      /competition_credit_ledger=2.*credit_pool_positions=2/,
    );
    assert.deepEqual(seen, [...ECONOMY_V3_LEGACY_CREDIT_COLLECTIONS]);
  });

  it('accepts the v3 preflight only when every legacy credit collection is empty', async () => {
    const db = {
      collection: () => ({ countDocuments: async () => 0 }),
    } as unknown as Db;
    await assert.doesNotReject(assertEconomyV3LegacyCreditCollectionsEmpty(db));
  });

  it('initializes and refreshes atomically with the document returned by Mongo', async () => {
    const store = fakeDb();

    const first = await ensureEconomySchema(store.db, 'cukieshub-new');
    const second = await ensureEconomySchema(store.db, 'cukieshub-new');

    assert.equal(first._id, ECONOMY_SCHEMA_METADATA_ID);
    assert.equal(first.schemaVersion, ECONOMY_SCHEMA_VERSION);
    assert.equal(second, store.state().metadata);
    assert.equal(store.state().atomicUpdates, 2);
  });

  it('asserts without creating a missing sentinel', async () => {
    const store = fakeDb();

    await assert.rejects(
      assertEconomySchema(store.db, 'cukieshub-new'),
      /no tiene inicializado/,
    );
    assert.equal(store.state().atomicUpdates, 0);
  });

  it('re-reads and rejects an incompatible document after an upsert duplicate race', async () => {
    const wrongVersion = fakeDb(metadata({
      schemaVersion: 1 as typeof ECONOMY_SCHEMA_VERSION,
    }));
    const wrongName = fakeDb(metadata({ dbName: 'cukieshub-typo' }));

    await assert.rejects(ensureEconomySchema(wrongVersion.db, 'cukieshub-new'), /incompatible/);
    await assert.rejects(ensureEconomySchema(wrongName.db, 'cukieshub-new'), /incompatible/);
    assert.ok(wrongVersion.state().operations.includes('findOne:plain'));
  });

  it('returns the compatible winner document after a concurrent upsert', async () => {
    const winnerUpdatedAt = new Date('2026-07-10T10:05:00.000Z');
    let winner: EconomySchemaMetadata | undefined;
    const store = fakeDb();
    const baseCollection = store.db.collection.bind(store.db);
    Object.defineProperty(store.db, 'collection', {
      value: () => {
        const collection = baseCollection('economy_schema_metadata');
        return {
          ...collection,
          findOneAndUpdate: async () => {
            winner = metadata({ updatedAt: winnerUpdatedAt });
            store.setMetadata(winner);
            throw { code: 11000 };
          },
        };
      },
    });

    const result = await ensureEconomySchema(store.db, 'cukieshub-new');

    assert.equal(result, winner);
    assert.equal(result.updatedAt, winnerUpdatedAt);
  });

  it('rejects a connection to a different physical database before reading metadata', async () => {
    const store = fakeDb();
    Object.defineProperty(store.db, 'databaseName', { value: 'cukieshub-typo' });

    await assert.rejects(
      assertEconomySchema(store.db, 'cukieshub-new'),
      /no a la base esperada/,
    );
  });

  it('runs the sentinel read and verification update through the injected transaction runner', async () => {
    const store = fakeDb(metadata());
    const session = { id: 'fake-session' } as unknown as ClientSession;
    let runnerCalls = 0;

    const result = await verifyEconomyTransactionSupport(
      store.db,
      'cukieshub-new',
      async (work) => {
        runnerCalls += 1;
        return work(session);
      },
    );

    assert.equal(runnerCalls, 1);
    assert.ok(result.transactionVerifiedAt instanceof Date);
    assert.deepEqual(store.state().operations.slice(-2), [
      'findOne:session',
      'findOneAndUpdate:session',
    ]);
    assert.equal(result, store.state().metadata);
  });

  it('maps a transaction probe failure to a typed setup error', async () => {
    const store = fakeDb(metadata());

    await assert.rejects(
      verifyEconomyTransactionSupport(
        store.db,
        'cukieshub-new',
        async () => {
          throw new Error('Transaction numbers are only allowed on a replica set member');
        },
      ),
      (error: unknown) => (
        error instanceof EconomyTransactionSupportError
        && error.code === 'ECONOMY_TRANSACTIONS_UNSUPPORTED'
      ),
    );
  });

  it('migrates a compatible v1 sentinel to v2 inside the injected transaction', async () => {
    const store = fakeDb(metadata({ schemaVersion: 1 as typeof ECONOMY_SCHEMA_VERSION }));
    const session = { id: 'migration-session' } as unknown as ClientSession;

    const result = await migrateEconomySchemaV1ToV2(
      store.db,
      'cukieshub-new',
      async (work) => work(session),
    );

    assert.equal(result.schemaVersion, 2);
    assert.equal(result.migratedFromVersion, 1);
    assert.equal(result.migrationId, ECONOMY_V2_MIGRATION_ID);
    assert.ok(result.migratedAt instanceof Date);
    assert.equal(store.state().metadata, result);
    assert.ok(store.state().operations.includes('findOneAndUpdate:session'));
  });

  it('keeps an existing v2 sentinel idempotent and rejects a missing migration source', async () => {
    const current = fakeDb(metadata());
    const missing = fakeDb();
    const session = { id: 'migration-session' } as unknown as ClientSession;

    assert.equal(
      await migrateEconomySchemaV1ToV2(current.db, 'cukieshub-new', async (work) => work(session)),
      current.state().metadata,
    );
    await assert.rejects(
      migrateEconomySchemaV1ToV2(missing.db, 'cukieshub-new', async (work) => work(session)),
      /no contiene un sentinel v1 migrable/,
    );
  });

  it('backfills v2 slots without inventing historical block coverage', async () => {
    const timestamp = new Date('2026-07-10T10:00:00.000Z');
    let current: Record<string, unknown> = {
      _id: ECONOMY_SCHEMA_METADATA_ID,
      schemaVersion: 2,
      dbName: 'cukieshub-new',
      initializedAt: timestamp,
      updatedAt: timestamp,
    };
    const versions: Array<Record<string, unknown>> = [];
    const historyStates: Array<Record<string, unknown>> = [];
    const db = {
      databaseName: 'cukieshub-new',
      collection: (name: string) => ({
        findOne: async () => name === 'economy_schema_metadata' ? current : null,
        findOneAndUpdate: async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
          current = { ...current, ...update.$set };
          return current;
        },
        countDocuments: async () => 0,
        find: () => ({
          toArray: async () => name === 'cukie_master_slots'
            ? [{
                _id: '0xabc:uki:1',
                route: 'uki',
                revision: 7,
                sourceHash: 'legacy-source',
              }]
            : [],
        }),
        updateOne: async (_filter: unknown, update: { $setOnInsert?: Record<string, unknown>; $set?: Record<string, unknown> }) => {
          const document = { ...update.$setOnInsert, ...update.$set };
          if (name === 'cukie_master_slot_versions') versions.push(document);
          if (name === 'cukie_master_slot_history_state') historyStates.push(document);
          return { matchedCount: 1, upsertedCount: 1 };
        },
        listIndexes: () => ({ toArray: async () => [] }),
        dropIndex: async () => undefined,
        createIndex: async () => 'test-index',
      }),
    } as unknown as Db;

    const result = await migrateEconomySchemaV2ToV3(
      db,
      'cukieshub-new',
      async (work) => work({ id: 'v3-migration' } as unknown as ClientSession),
    );

    assert.equal(result.schemaVersion, 3);
    assert.equal(result.migrationId, ECONOMY_V3_MIGRATION_ID);
    assert.equal(versions.length, 1);
    assert.equal(versions[0].historicalEvidenceStatus, 'unverified_backfill');
    assert.equal('effectiveBlockNumber' in versions[0], false);
    assert.equal(historyStates.length, 2);
    for (const state of historyStates) {
      assert.equal(state.historicalBlockCoverage, 'unverified');
      assert.equal('completeFromBlockNumber' in state, false);
    }
  });
});
