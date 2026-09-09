import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ObjectId } from 'mongodb';
import { readFile } from 'node:fs/promises';

import { CardWorkerStore } from './storage/mongo.js';
import { getCardWorkerConfig } from './config/env.js';
import type { CardWorkerConfig, CukiDocument } from './types.js';

const config: CardWorkerConfig = {
  mongoUrl: 'mongodb://unused', dbName: 'unused', assetsDir: '/tmp/assets', outputDir: '/tmp/output',
  pollIntervalMs: 1, maxAttempts: 2, staleLockMs: 60_000, upload: false, publicBaseUrl: null,
  publicKeyPrefix: null, s3Bucket: null, s3Region: null, s3Prefix: 'cards', s3Endpoint: null,
  s3ForcePathStyle: false, s3Acl: null, verifyPublic: false, backfillConcurrency: 1,
  backfillManifestPath: null, sourceFormat: 'indexed', legacyStagingEnabled: false, sourceIdentity: null,
};

const legacyConfig: CardWorkerConfig = {
  ...config,
  dbName: 'cukies-legacy-staging',
  sourceFormat: 'legacy',
  legacyStagingEnabled: true,
};

class FakeCursor {
  private readonly documents: CukiDocument[];

  constructor(documents: CukiDocument[]) {
    this.documents = documents.slice();
  }

  sort(sort: Record<string, 1 | -1>) {
    this.documents.sort((a, b) => {
      for (const [field, direction] of Object.entries(sort)) {
        const left = a[field as keyof CukiDocument];
        const right = b[field as keyof CukiDocument];
        if (left === right) continue;
        return (left == null ? -1 : right == null ? 1 : left < right ? -1 : 1) * direction;
      }
      return 0;
    });
    return this;
  }

  batchSize() {
    return this;
  }

  project() {
    return this;
  }

  async toArray() {
    return this.documents;
  }

  async *[Symbol.asyncIterator]() {
    for (const document of this.documents) yield document;
  }
}

class FakeCukiCollection {
  readonly documents: CukiDocument[];
  updates = 0;
  lastFindFilter?: unknown;
  mutateBeforeUpdate?: (document: CukiDocument) => void;

  constructor(documents: CukiDocument[]) {
    this.documents = documents;
  }

  find(filter: unknown = {}) {
    this.lastFindFilter = filter;
    return new FakeCursor(this.documents);
  }

  async findOne(filter: { _id?: string | number }) {
    return this.documents.find((document) => document._id === filter._id) ?? null;
  }

  async findOneAndUpdate(filter: { _id?: string; $and?: Array<Record<string, unknown>> }) {
    const document = this.documents.find((candidate) => candidate._id === filter._id);
    if (!document) return null;

    this.mutateBeforeUpdate?.(document);
    const revision = filter.$and?.find((clause) =>
      'updatedAt' in clause
      || (Array.isArray(clause.$or) && clause.$or.some((branch) => branch && typeof branch === 'object' && 'updatedAt' in branch)),
    );
    if (revision && 'updatedAt' in revision) {
      const expected = revision.updatedAt;
      if (!(expected instanceof Date) || !(document.updatedAt instanceof Date) || expected.getTime() !== document.updatedAt.getTime()) return null;
    }
    if (revision && '$or' in revision && document.updatedAt !== undefined && document.updatedAt !== null) return null;

    this.updates += 1;
    const sourceRevision = document.updatedAt ?? null;
    const now = new Date();
    document.cardImageStatus = 'processing';
    document.cardImageLockedAt = now;
    document.cardImageLockId = `lock-${this.updates}`;
    document.cardImageLeaseVersion = (document.cardImageLeaseVersion ?? 0) + 1;
    document.cardImageLeaseSourceRevision = sourceRevision;
    document.cardImageAttempts = (document.cardImageAttempts ?? 0) + 1;
    document.updatedAt = now;
    return { ...document };
  }
}

function storeFor(documents: CukiDocument[], configOverride = config) {
  const collection = new FakeCukiCollection(documents);
  const store = Object.create(CardWorkerStore.prototype) as CardWorkerStore;
  Object.defineProperty(store, 'db', { value: { collection: () => collection } });
  Object.defineProperty(store, 'config', { value: configOverride });
  return { collection, store };
}

describe('contexto Compose indexed hasta la reclamación real', () => {
  it('transmite contexto completo, reclama metadata sin chain/colección y mantiene el fencing de conflictos', async (t) => {
    const compose = await readFile(new URL('../../../docker-compose.coolify.yml', import.meta.url), 'utf8');
    const indexed = compose.split('  cuki-card-worker:\n')[1].split('  cuki-card-worker-legacy:\n')[0];
    const values: Record<string, string> = {
      CARD_WORKER_MONGO_URL: 'mongodb://unused/cukieshub-new-staging', CARD_WORKER_DB_NAME: 'cukieshub-new-staging',
      CARD_WORKER_SOURCE_FORMAT: 'indexed', CARD_WORKER_LEGACY_STAGING_ENABLED: 'false',
      CARD_WORKER_SOURCE_NETWORK: 'BSC', CARD_WORKER_SOURCE_CHAIN_ID: '97',
      CARD_WORKER_SOURCE_COLLECTION: '0xd4c7b16db234d7f62ba6a8f30153faf85feabec8',
    };
    const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
    t.after(() => {for (const [key, value] of Object.entries(before)) {if (value === undefined) delete process.env[key]; else process.env[key] = value;}});
    for (const key of ['CARD_WORKER_SOURCE_NETWORK', 'CARD_WORKER_SOURCE_CHAIN_ID', 'CARD_WORKER_SOURCE_COLLECTION']) {
      const line = indexed.match(new RegExp(`^      ${key}: (.+)$`, 'm'))?.[1];
      assert.equal(line, '${' + key + ':-}', `${key} must be wired, optional while profile is off`);
      process.env[key] = line.replace(/\$\{([^:}]+):-\}/g, (_all, variable: string) => values[variable] ?? '');
    }
    for (const [key, value] of Object.entries(values)) if (!key.startsWith('CARD_WORKER_SOURCE_')) process.env[key] = value;
    process.env.CARD_WORKER_SOURCE_FORMAT = 'indexed';
    const resolved = getCardWorkerConfig();
    assert.deepEqual(resolved.sourceIdentity, {network: 'BSC', chainId: 97, collectionAddressNormalized: values.CARD_WORKER_SOURCE_COLLECTION});
    const doc: CukiDocument = {_id: '97:collection:98000001', tokenId: '98000001', network: 'BSC', rarity: 1, generation: 1, needsImage: true};
    const {store, collection} = storeFor([{...doc, _id: 'conflict', chainId: 56}, doc], resolved);
    assert.equal((await store.claimNextCuki(resolved.sourceIdentity!))?._id, doc._id);
    assert.equal(collection.updates, 1);
    assert.equal(doc.chainId, undefined);
    assert.equal(doc.collectionAddressNormalized, undefined);

    for (const key of ['CARD_WORKER_SOURCE_NETWORK', 'CARD_WORKER_SOURCE_CHAIN_ID', 'CARD_WORKER_SOURCE_COLLECTION']) process.env[key] = '';
    assert.throws(() => getCardWorkerConfig(), /contexto explícito/);
    process.env.CARD_WORKER_SOURCE_NETWORK = 'BSC';
    assert.throws(() => getCardWorkerConfig(), /requiere/);
    process.env.CARD_WORKER_SOURCE_FORMAT = 'legacy';
    process.env.CARD_WORKER_LEGACY_STAGING_ENABLED = 'true';
    process.env.CARD_WORKER_DB_NAME = 'cukies-legacy-staging';
    assert.equal(getCardWorkerConfig().sourceIdentity, null, 'RAWlegacy never inherits indexed context');
    process.env.CARD_WORKER_SOURCE_FORMAT = 'indexed';
    process.env.CARD_WORKER_DB_NAME = 'cukieshub-new';
    process.env.CARD_WORKER_SOURCE_NETWORK = '';
    assert.equal(getCardWorkerConfig().sourceIdentity, null, 'fully identified production documents need no Stage context');
    process.env.CARD_WORKER_SOURCE_NETWORK = 'BSC';
    process.env.CARD_WORKER_SOURCE_CHAIN_ID = '56';
    process.env.CARD_WORKER_SOURCE_COLLECTION = values.CARD_WORKER_SOURCE_COLLECTION;
    assert.equal(getCardWorkerConfig().sourceIdentity?.chainId, 56);
  });
});

function candidate(_id: string | number, identity: Partial<CukiDocument>): CukiDocument {
  return {
    _id,
    rarity: 3,
    generation: 2,
    needsImage: true,
    updatedAt: new Date('2026-09-08T15:00:00.000Z'),
    ...identity,
  };
}

describe('reclamación con identidad canónica', () => {
  it('salta identidad inválida y reclama el siguiente candidato válido sin consumir intentos', async () => {
    const invalid = [
      candidate('zero', { tokenId: '0', network: 'BSC', chainId: 0, collectionAddressNormalized: '0xabc' }),
      candidate('fraction', { tokenId: '1', network: 'BSC', chainId: 97.5, collectionAddressNormalized: '0xabc' }),
      candidate('conflict', { tokenId: '2', network: 'TRON', chain: 'BSC', collectionAddressNormalized: 'TVk' }),
      candidate('blank', { tokenId: '   ', network: 'BSC', chainId: 97, collectionAddressNormalized: '0xabc' }),
    ];
    const valid = candidate('valid', { tokenId: '42', network: 'BSC', chainId: 97, collectionAddressNormalized: '0xabc' });
    const { collection, store } = storeFor([...invalid, valid]);

    const claimed = await store.claimNextCuki();

    assert.equal(claimed?._id, 'valid');
    assert.equal(collection.updates, 1);
    assert.equal(invalid.some((document) => document.cardImageAttempts !== undefined), false);
  });

  it('valida identidad también al reclamar por documentId sin contexto', async () => {
    const invalid = candidate('invalid', { tokenId: '7', network: 'BSC', chainId: 0, collectionAddressNormalized: '0xabc' });
    const { collection, store } = storeFor([invalid]);

    const claimed = await store.claimCukiByDocumentId(invalid._id);

    assert.equal(claimed, null);
    assert.equal(collection.updates, 0);
    assert.equal(invalid.cardImageAttempts, undefined);
  });

  it('no reclama una fuente cuya revisión cambia entre lectura y claim', async () => {
    const stale = candidate('stale', { tokenId: '7', network: 'BSC', chainId: 97, collectionAddressNormalized: '0xabc' });
    const valid = candidate('valid', { tokenId: '42', network: 'BSC', chainId: 97, collectionAddressNormalized: '0xabc' });
    const { collection, store } = storeFor([stale, valid]);
    collection.mutateBeforeUpdate = (document) => {
      if (document._id === 'stale') document.updatedAt = new Date('2026-09-08T16:00:00.000Z');
    };

    const claimed = await store.claimNextCuki();

    assert.equal(claimed?._id, 'valid');
    assert.equal(collection.updates, 1);
    assert.equal(stale.cardImageAttempts, undefined);
  });

  it('rechaza network BSC/chain TRON sin consumir intentos y reclama el siguiente válido', async () => {
    const conflict = candidate(123, { network: 'BSC', chain: 'TRON' });
    const valid = candidate(124, { network: 'BSC' });
    const { collection, store } = storeFor([conflict, valid], legacyConfig);

    const claimed = await store.claimNextCuki();

    assert.equal(claimed?._id, 124);
    assert.equal(collection.updates, 1);
    assert.equal(conflict.cardImageAttempts, undefined);
  });

  it('resuelve un documentId con tipo exacto sin cruzar el lease entre 123 y "123"', async () => {
    for (const id of [0, 123]) {
      const numeric = candidate(id, { network: 'BSC' });
      const string = candidate(String(id), { network: 'BSC' });
      const { collection, store } = storeFor([numeric, string], legacyConfig);

      const claimed = await store.claimCukiByDocumentId(id);

      assert.equal(claimed?._id, id);
      assert.equal(numeric.cardImageAttempts, 1);
      assert.equal(string.cardImageAttempts, undefined);
      assert.equal(collection.updates, 1);
    }
  });

  it('permite que el CLI busque ambos tipos de id pero rechaza la ambigüedad', async () => {
    const numeric = candidate(123, { network: 'BSC' });
    const string = candidate('123', { network: 'BSC' });
    const { store } = storeFor([numeric, string], legacyConfig);

    await assert.rejects(() => store.getCukiByTokenId('123'), /ambig/);
  });

  it('censa todos los documentos legacy, incluidos ids inválidos y ObjectId, sin filtrarlos', async () => {
    const invalidObjectId = candidate(new ObjectId() as unknown as string, { network: 'BSC' });
    const invalidString = candidate('not-a-token', { network: 'BSC' });
    const { collection, store } = storeFor([invalidObjectId, invalidString], legacyConfig);

    const documents = await store.listBackfillCukies();

    assert.deepEqual(collection.lastFindFilter, {});
    assert.equal(documents.length, 2);
    assert.ok(documents.every((document) => document.sourceValidationError));
  });
});
