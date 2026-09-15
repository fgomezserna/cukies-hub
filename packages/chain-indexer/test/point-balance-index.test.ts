import assert from 'node:assert/strict';
import test from 'node:test';
import type { Db, Document, IndexDescriptionInfo } from 'mongodb';

import {
  ensurePointBalanceAddressIndex,
  LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME,
  POINT_BALANCE_ADDRESS_INDEX_KEY,
  POINT_BALANCE_ADDRESS_INDEX_NAME,
  POINT_BALANCE_ADDRESS_INDEX_OPTIONS,
  pointBalanceAddressIndexState,
} from '../src/storage/point-balance-index.js';

const legacyIndex: IndexDescriptionInfo = {
  name: LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME,
  key: POINT_BALANCE_ADDRESS_INDEX_KEY,
  unique: true,
};
const currentIndex: IndexDescriptionInfo = {
  name: POINT_BALANCE_ADDRESS_INDEX_NAME,
  key: POINT_BALANCE_ADDRESS_INDEX_KEY,
  unique: true,
  partialFilterExpression: POINT_BALANCE_ADDRESS_INDEX_OPTIONS.partialFilterExpression,
};

function indexNotFound() {
  return Object.assign(new Error('index not found'), { code: 27, codeName: 'IndexNotFound' });
}

test('classifies only the historical, transition and current balance indexes', () => {
  assert.equal(pointBalanceAddressIndexState([]), 'absent');
  assert.equal(pointBalanceAddressIndexState([legacyIndex]), 'legacy');
  assert.equal(pointBalanceAddressIndexState([legacyIndex, currentIndex]), 'transitioning');
  assert.equal(pointBalanceAddressIndexState([currentIndex]), 'current');
  assert.equal(pointBalanceAddressIndexState([{
    ...legacyIndex,
    unique: false,
  }]), 'incompatible');
  assert.equal(pointBalanceAddressIndexState([{
    ...currentIndex,
    partialFilterExpression: { addressNormalized: { $exists: true } },
  }]), 'incompatible');
});

test('builds the partial index before removing the historical constraint and stays idempotent', async () => {
  let indexes: IndexDescriptionInfo[] = [legacyIndex];
  const calls: string[] = [];
  const collection = {
    listIndexes: () => ({ toArray: async () => indexes }),
    aggregate: () => ({ next: async () => null }),
    dropIndex: async (name: string) => {
      assert.ok(indexes.some((index) => index.name === POINT_BALANCE_ADDRESS_INDEX_NAME));
      calls.push(`drop:${name}`);
      indexes = indexes.filter((index) => index.name !== name);
    },
    createIndex: async (key: Document, options: Document) => {
      calls.push(`create:${options.name}`);
      if (!indexes.some((index) => index.name === options.name)) {
        indexes.push({
          name: String(options.name),
          key,
          unique: options.unique === true,
          partialFilterExpression: options.partialFilterExpression,
        });
      }
      return String(options.name);
    },
  };
  const db = { collection: () => collection } as unknown as Db;

  assert.deepEqual(await ensurePointBalanceAddressIndex(db), { action: 'migrated' });
  assert.deepEqual(await ensurePointBalanceAddressIndex(db), { action: 'unchanged' });
  assert.deepEqual(calls, [
    `create:${POINT_BALANCE_ADDRESS_INDEX_NAME}`,
    `drop:${LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME}`,
    `create:${POINT_BALANCE_ADDRESS_INDEX_NAME}`,
  ]);
});

test('rejects duplicates before changing the historical index', async () => {
  const calls: string[] = [];
  const collection = {
    listIndexes: () => ({ toArray: async () => [legacyIndex] }),
    aggregate: () => ({ next: async () => ({ _id: 'redacted', count: 2 }) }),
    dropIndex: async () => calls.push('drop'),
    createIndex: async () => calls.push('create'),
  };
  const db = { collection: () => collection } as unknown as Db;

  await assert.rejects(
    () => ensurePointBalanceAddressIndex(db),
    /balances historicos duplicados/,
  );
  assert.deepEqual(calls, []);
});

test('keeps the historical constraint when partial index creation fails', async () => {
  const calls: string[] = [];
  const collection = {
    listIndexes: () => ({ toArray: async () => [legacyIndex] }),
    aggregate: () => ({ next: async () => null }),
    dropIndex: async () => calls.push('drop'),
    createIndex: async () => {
      calls.push('create');
      throw new Error('partial creation failed');
    },
  };
  const db = { collection: () => collection } as unknown as Db;

  await assert.rejects(
    () => ensurePointBalanceAddressIndex(db),
    /partial creation failed/,
  );
  assert.deepEqual(calls, ['create']);
});

test('waits for an exposed but unfinished partial index before removing the historical one', async () => {
  let indexes: IndexDescriptionInfo[] = [legacyIndex, currentIndex];
  const calls: string[] = [];
  let releaseBuild!: () => void;
  const buildReady = new Promise<void>((resolve) => { releaseBuild = resolve; });
  const collection = {
    listIndexes: () => ({ toArray: async () => indexes }),
    aggregate: () => ({ next: async () => null }),
    createIndex: async () => {
      calls.push('create:start');
      await buildReady;
      calls.push('create:ready');
      return POINT_BALANCE_ADDRESS_INDEX_NAME;
    },
    dropIndex: async (name: string) => {
      calls.push(`drop:${name}`);
      indexes = indexes.filter((index) => index.name !== name);
    },
  };
  const db = { collection: () => collection } as unknown as Db;

  const migration = ensurePointBalanceAddressIndex(db);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['create:start']);
  releaseBuild();
  assert.deepEqual(await migration, { action: 'migrated' });
  assert.deepEqual(calls, [
    'create:start',
    'create:ready',
    `drop:${LEGACY_POINT_BALANCE_ADDRESS_INDEX_NAME}`,
  ]);
});

test('two indexer runtimes converge without a gap or deleting the replacement', async () => {
  let indexes: IndexDescriptionInfo[] = [legacyIndex];
  let initialReads = 0;
  let releaseInitialReads!: () => void;
  const bothRead = new Promise<void>((resolve) => { releaseInitialReads = resolve; });
  let partialCreates = 0;
  let drops = 0;
  const collection = {
    listIndexes: () => ({
      toArray: async () => {
        if (initialReads < 2) {
          const snapshot = indexes.map((index) => ({ ...index }));
          initialReads += 1;
          if (initialReads === 2) releaseInitialReads();
          await bothRead;
          return snapshot;
        }
        return indexes.map((index) => ({ ...index }));
      },
    }),
    aggregate: () => ({ next: async () => null }),
    createIndex: async () => {
      partialCreates += 1;
      if (!indexes.some((index) => index.name === POINT_BALANCE_ADDRESS_INDEX_NAME)) {
        indexes.push(currentIndex);
      }
      return POINT_BALANCE_ADDRESS_INDEX_NAME;
    },
    dropIndex: async (name: string) => {
      assert.ok(indexes.some((index) => index.name === POINT_BALANCE_ADDRESS_INDEX_NAME));
      if (!indexes.some((index) => index.name === name)) throw indexNotFound();
      drops += 1;
      indexes = indexes.filter((index) => index.name !== name);
    },
  };
  const db = { collection: () => collection } as unknown as Db;

  const results = await Promise.all([
    ensurePointBalanceAddressIndex(db),
    ensurePointBalanceAddressIndex(db),
  ]);

  assert.deepEqual(results, [{ action: 'migrated' }, { action: 'migrated' }]);
  assert.equal(partialCreates, 2);
  assert.equal(drops, 1);
  assert.equal(pointBalanceAddressIndexState(indexes), 'current');
});
