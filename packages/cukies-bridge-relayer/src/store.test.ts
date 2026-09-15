import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveLegacyTypeId,
  isIndexCompatible,
  MongoBridgeRelayerStore,
  sameIndexKey,
} from './store.js';

describe('deriveLegacyTypeId', () => {
  it('recovers the type slot from the deployed mainnet token ids', () => {
    assert.equal(deriveLegacyTypeId('1000000002279'), 1n);
    assert.equal(deriveLegacyTypeId('3000000013013'), 3n);
  });

  it('does not confuse a non-zero chain prefix with the type id', () => {
    assert.equal(deriveLegacyTypeId('205000000002279'), 5n);
  });

  it('rejects a token id without a legacy type slot', () => {
    assert.throws(
      () => deriveLegacyTypeId('7000000002279'),
      /typeId legacy no derivable/,
    );
  });
});

describe('legacy relayer index migration compatibility', () => {
  it('reuses the Stage source unique index by key even when the desired name differs', () => {
    const existing = {
      name: 'legacy_source_event_unique',
      key: { sourceTxHash: 1, sourceEventIndex: 1 },
      unique: true,
    };
    const desired = {
      keys: { sourceTxHash: 1, sourceEventIndex: 1 },
      options: {
        name: 'legacy_source_event_unique_v2',
        unique: true,
        sparse: false,
        partialFilterExpression: {
          sourceTxHash: { $type: 'string' },
          sourceEventIndex: { $type: 'number' },
        },
      },
    };

    assert.equal(sameIndexKey(existing.key, desired.keys), true);
    assert.equal(isIndexCompatible(existing, desired), true);
  });

  it('does not treat a non-unique legacy source index as safe for idempotency', () => {
    const existing = {
      name: 'sourceTxHash_1_sourceEventIndex_1',
      key: { sourceTxHash: 1, sourceEventIndex: 1 },
      unique: false,
    };
    assert.equal(isIndexCompatible(existing, {
      keys: existing.key,
      options: { name: 'legacy_source_event_unique', unique: true, sparse: false },
    }), false);
  });

  it('rejects a sparse source unique index because missing legacy fields could collide', () => {
    const existing = {
      name: 'legacy_source_event_unique_sparse',
      key: { sourceTxHash: 1, sourceEventIndex: 1 },
      unique: true,
      sparse: true,
    };
    assert.equal(isIndexCompatible(existing, {
      keys: existing.key,
      options: { name: 'legacy_source_event_unique', unique: true, sparse: false },
    }), false);
  });

  it('rejects a non-sparse destination index because it would block multiple pending jobs', () => {
    const existing = {
      name: 'legacy_destination_tx_unique',
      key: { destinationTxHash: 1 },
      unique: true,
    };
    assert.equal(isIndexCompatible(existing, {
      keys: existing.key,
      options: { name: existing.name, unique: true, sparse: true },
    }), false);
  });

  class FakeCollection {
    created: Array<{ keys: Record<string, number>; options: Record<string, unknown> }> = [];
    dropped: string[] = [];

    constructor(
      readonly indexes: Array<Record<string, unknown>> = [],
      private readonly audit = { incomplete: 0, duplicates: false },
    ) {}

    listIndexes() {
      return { toArray: async () => this.indexes };
    }

    countDocuments() {
      return Promise.resolve(this.audit.incomplete);
    }

    aggregate() {
      return { toArray: async () => (this.audit.duplicates ? [{ _id: 'duplicate', count: 2 }] : []) };
    }

    async dropIndex(name: string) {
      this.dropped.push(name);
      const index = this.indexes.findIndex((candidate) => candidate.name === name);
      if (index >= 0) this.indexes.splice(index, 1);
    }

    async createIndex(keys: Record<string, number>, options: Record<string, unknown>) {
      this.created.push({ keys, options });
      this.indexes.push({ key: keys, ...options });
      return String(options.name);
    }
  }

  class MissingCollection extends FakeCollection {
    override listIndexes() {
      const error = new Error('ns does not exist') as Error & { code: number; codeName: string };
      error.code = 26;
      error.codeName = 'NamespaceNotFound';
      return { toArray: async () => Promise.reject(error) };
    }
  }

  function fakeStore(jobs: FakeCollection) {
    const collections = new Map<string, FakeCollection>();
    return {
      jobs: () => jobs,
      db: {
        collection(name: string) {
          const existing = collections.get(name);
          if (existing) return existing;
          const created = new FakeCollection();
          collections.set(name, created);
          return created;
        },
      },
    };
  }

  it('reuses the existing Stage index set without attempting conflicting creates', async () => {
    const jobs = new FakeCollection([
      { name: '_id_', key: { _id: 1 } },
      { name: 'legacy_source_event_unique', key: { sourceTxHash: 1, sourceEventIndex: 1 }, unique: true },
      { name: 'legacy_claim_ready', key: { status: 1, nextAttemptAt: 1, lockedUntil: 1 } },
      { name: 'legacy_destination_tx_unique', key: { destinationTxHash: 1 }, unique: true, sparse: true },
    ]);
    await MongoBridgeRelayerStore.prototype.ensureIndexes.call(fakeStore(jobs) as never);
    assert.deepEqual(jobs.created, []);
  });

  it('creates indexes on a pristine database where listIndexes reports NamespaceNotFound', async () => {
    const jobs = new MissingCollection();
    await MongoBridgeRelayerStore.prototype.ensureIndexes.call(fakeStore(jobs) as never);
    assert.ok(jobs.created.some((item) => item.keys.sourceTxHash === 1));
    assert.ok(jobs.created.some((item) => item.keys.destinationTxHash === 1));
  });

  it('fails closed on duplicate source identities instead of creating a unique index', async () => {
    const jobs = new FakeCollection([
      { name: 'legacy_source_event_lookup', key: { sourceTxHash: 1, sourceEventIndex: 1 } },
    ], { incomplete: 0, duplicates: true });
    await assert.rejects(
      MongoBridgeRelayerStore.prototype.ensureIndexes.call(fakeStore(jobs) as never),
      /sourceTxHash\/sourceEventIndex duplicadas/,
    );
    assert.equal(jobs.created.length, 0);
    assert.deepEqual(jobs.dropped, []);
  });

  it('migrates an old lookup index to a partial unique index when only incomplete rows exist', async () => {
    const jobs = new FakeCollection([
      { name: 'legacy_source_event_lookup', key: { sourceTxHash: 1, sourceEventIndex: 1 } },
      { name: 'legacy_destination_tx_unique', key: { destinationTxHash: 1 }, unique: true, sparse: true },
    ], { incomplete: 2, duplicates: false });
    await MongoBridgeRelayerStore.prototype.ensureIndexes.call(fakeStore(jobs) as never);
    assert.deepEqual(jobs.dropped, ['legacy_source_event_lookup']);
    const sourceCreate = jobs.created.find((item) => item.keys.sourceTxHash === 1);
    assert.equal(sourceCreate?.options.unique, true);
    assert.deepEqual(sourceCreate?.options.partialFilterExpression, {
      sourceTxHash: { $type: 'string' },
      sourceEventIndex: { $type: 'number' },
    });
  });
});
