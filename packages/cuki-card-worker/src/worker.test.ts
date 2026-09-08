import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { ObjectId } from 'mongodb';

import { buildCardImageLeaseFilter, buildRenderableMetadataFilter } from './storage/mongo.js';
import { parseIdentityArgs } from './cli-options.js';
import {
  backfillCards,
  backfillItemNeedsResume,
  backfillRunStatus,
  canonicalAssetIdentity,
  classifyCukiMetadata,
  processOneCard,
} from './worker.js';
import type { CardWorkerDependencies, CardWorkerStoreLike } from './worker.js';
import type { CardImageLease, CardWorkerConfig, ClaimedCuki, CukiDocument, GenerationResult } from './types.js';

const baseCuki: CukiDocument = {
  _id: 'mongo-document-1',
  tokenId: '42',
  network: 'BSC',
  chainId: 97,
  collectionAddressNormalized: '0xABC',
  rarity: 3,
  generation: 2,
};

const config = (manifestPath: string, sourceIdentity: CardWorkerConfig['sourceIdentity'] = null): CardWorkerConfig => ({
  mongoUrl: 'mongodb://unused', dbName: 'unused', assetsDir: '/tmp/assets', outputDir: '/tmp/output',
  pollIntervalMs: 1, maxAttempts: 2, staleLockMs: 60_000, upload: false, publicBaseUrl: null,
  publicKeyPrefix: null, s3Bucket: null, s3Region: null, s3Prefix: 'cards', s3Endpoint: null,
  s3ForcePathStyle: false, s3Acl: null, verifyPublic: false, backfillConcurrency: 1, backfillManifestPath: manifestPath,
  sourceFormat: 'indexed', legacyStagingEnabled: false, sourceIdentity,
});

const legacyConfig = (manifestPath: string): CardWorkerConfig => ({
  ...config(manifestPath),
  dbName: 'cukies-legacy-staging',
  sourceFormat: 'legacy',
  legacyStagingEnabled: true,
});

function fakeStore(overrides: Partial<CardWorkerStoreLike> = {}) {
  return {
    close: async () => undefined,
    ensureIndexes: async () => undefined,
    summary: async () => ({}),
    getCukiByTokenId: async () => null,
    recordJob: async () => undefined,
    claimCukiByTokenId: async () => null,
    claimNextCuki: async () => null,
    getCuki: async () => null,
    claimCukiByDocumentId: async () => null,
    markGenerated: async () => undefined,
    markFailed: async () => undefined,
    listBackfillCukies: async () => [],
    ...overrides,
  } as CardWorkerStoreLike;
}

function claimed(cuki: CukiDocument): ClaimedCuki {
  return { ...cuki, lease: { lockId: 'lease-a', leaseVersion: 1, claimedAt: new Date('2026-09-08T15:00:00.000Z'), sourceRevision: cuki.updatedAt ?? null } };
}

function generated(cuki: CukiDocument, identity?: CardWorkerConfig['sourceIdentity']): GenerationResult {
  return { tokenId: cuki.tokenId!, documentId: cuki._id, assetIdentity: canonicalAssetIdentity(cuki, identity ?? undefined)!, outputPath: '/tmp/card.png', width: 1, height: 1, imageUrl: 'https://assets.example/card.png', s3Key: 'cards/card.png' };
}

function uploadStub(): NonNullable<CardWorkerDependencies['renderAndUpload']> {
  return async (_store, cuki, _config, identity) => generated(cuki, identity);
}

describe('identidad y censo de metadata', () => {
  it('incluye network, chainId, colección y token, con normalización por red', () => {
    assert.equal(canonicalAssetIdentity(baseCuki), 'bsc:97:0xabc:42');
    assert.notEqual(canonicalAssetIdentity(baseCuki), canonicalAssetIdentity({ ...baseCuki, collectionAddressNormalized: '0xDEF' }));
    assert.equal(canonicalAssetIdentity({ _id: 'legacy', tokenId: '42' }, { network: 'TRON', collectionAddressNormalized: 'TAbCxyz' }), 'tron:mainnet:TAbCxyz:42');
    assert.equal(canonicalAssetIdentity({ _id: 'legacy', tokenId: '42', chain: 'TRON', collectionAddressNormalized: 'TAbCxyz' }), 'tron:mainnet:TAbCxyz:42');
    assert.equal(canonicalAssetIdentity({ ...baseCuki, chainId: 56 }, { network: 'BSC', chainId: 97, collectionAddressNormalized: '0xABC' }), null);
    assert.equal(canonicalAssetIdentity({ ...baseCuki, network: 'TRON', chain: 'BSC' }), null);
    assert.equal(canonicalAssetIdentity({ ...baseCuki, collectionAddressNormalized: undefined }), null);
    assert.equal(canonicalAssetIdentity({ ...baseCuki, tokenId: undefined }), null);
  });

  it('clasifica metadata ausente o fuera de rango sin convertirla en candidata', () => {
    assert.equal(classifyCukiMetadata(baseCuki), 'renderable');
    assert.equal(classifyCukiMetadata({ ...baseCuki, generation: undefined }), 'missing_metadata');
    assert.equal(classifyCukiMetadata({ ...baseCuki, rarity: 7 }), 'unsupported_metadata');
    assert.equal(classifyCukiMetadata({ ...baseCuki, type: 7, rarity: 3 }), 'unsupported_metadata');
    assert.equal(classifyCukiMetadata({ ...baseCuki, skills: { generation: 0 }, generation: 2 }), 'unsupported_metadata');
    assert.equal(classifyCukiMetadata({ ...baseCuki, type: undefined, skills: { generation: undefined }, rarity: 3, generation: 2 }), 'renderable');
    const typeBranches = (buildRenderableMetadataFilter().$and?.[0] as { $or: unknown[] }).$or;
    const generationBranches = (buildRenderableMetadataFilter().$and?.[1] as { $or: unknown[] }).$or;
    assert.deepEqual(typeBranches?.[1], { type: { $exists: false }, rarity: { $in: [1, 2, 3, 4, 5, 6, '1', '2', '3', '4', '5', '6'] } });
    assert.deepEqual(generationBranches?.[1], { 'skills.generation': { $exists: false }, generation: { $in: [1, 2, '1', '2'] } });
    assert.deepEqual(parseIdentityArgs(['backfill', '--source-network', 'TRON', '--source-collection', 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe']), {
      positional: ['backfill'],
      identity: { network: 'TRON', collectionAddressNormalized: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe' },
    });
    assert.throws(() => parseIdentityArgs(['run', '--source-network', 'TRON']), /requiere --source-network y --source-collection/);
  });
});

describe('card image lease fencing', () => {
  it('requiere propietario, versión y revisión de origen actuales', () => {
    const lease: CardImageLease = { lockId: 'lease-a', leaseVersion: 4, claimedAt: new Date('2026-09-08T15:00:00.000Z'), sourceRevision: new Date('2026-09-08T14:59:00.000Z') };
    const filter = buildCardImageLeaseFilter('doc-1', lease);
    assert.deepEqual(filter, { _id: 'doc-1', cardImageStatus: 'processing', cardImageLockId: 'lease-a', cardImageLeaseVersion: 4, updatedAt: lease.claimedAt, cardImageLeaseSourceRevision: lease.sourceRevision });
    assert.notDeepEqual(filter, buildCardImageLeaseFilter('doc-1', { ...lease, lockId: 'lease-b' }));
    assert.notDeepEqual(filter, buildCardImageLeaseFilter('doc-1', { ...lease, leaseVersion: 5 }));
  });
});

describe('entrypoints de backfill y proceso normal', () => {
  it('propaga el contexto TRON explícito a censo, claim y renderer', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cuki-worker-tron-context-'));
    const sourceIdentity = { network: 'TRON', collectionAddressNormalized: 'TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe' } as const;
    const legacy = { _id: 'legacy-document', tokenId: '42', rarity: 3, generation: 2 };
    let observedContext: CardWorkerConfig['sourceIdentity'] = null;
    const store = fakeStore({
      listBackfillCukies: async () => [legacy],
      getCuki: async () => legacy,
      claimCukiByDocumentId: async (_id, context) => { observedContext = context ?? null; return claimed(legacy); },
    });
    const result = await backfillCards(config(path.join(dir, 'manifest.json'), sourceIdentity), { store, skipUploadAccess: true, renderAndUpload: async (_store, cuki, _config, identity) => { observedContext = identity ?? null; return generated(cuki, identity); } });
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as { initialItems: Array<{ assetIdentity: string; censusCategory: string }> };
    assert.equal(result.status, 'complete');
    assert.equal(manifest.initialItems[0]?.assetIdentity, 'tron:mainnet:TVkQDrxQgX7ZQmeeXj2RbPQa93qJrYQYGe:42');
    assert.equal(manifest.initialItems[0]?.censusCategory, 'renderable');
    assert.deepEqual(observedContext, sourceIdentity);
  });

  it('no consume intentos para metadata inválida', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cuki-worker-invalid-'));
    const invalid = { ...baseCuki, rarity: 7 };
    let claims = 0;
    const store = fakeStore({ listBackfillCukies: async () => [invalid], claimCukiByDocumentId: async () => { claims += 1; return null; } });
    const result = await backfillCards(config(path.join(dir, 'manifest.json')), { store, skipUploadAccess: true, renderAndUpload: uploadStub() });
    assert.equal(claims, 0);
    assert.equal(result.status, 'complete');
    assert.equal(result.counts.unsupported_metadata, 1);
  });

  it('incluye ids inválidos/ObjectId en manifest y counts como missing_identity sin claims', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cuki-worker-invalid-ids-'));
    const objectId = new ObjectId();
    const invalidString = { _id: 'not-a-token', network: 'BSC', rarity: 3, generation: 2 } as CukiDocument;
    let listCalls = 0;
    let claims = 0;
    const store = fakeStore({
      listBackfillCukies: async () => {
        listCalls += 1;
        return [
          { _id: new ObjectId(objectId.toHexString()), network: 'BSC', rarity: 3, generation: 2 } as unknown as CukiDocument,
          invalidString,
        ];
      },
      claimCukiByDocumentId: async () => { claims += 1; return null; },
    });

    const result = await backfillCards(legacyConfig(path.join(dir, 'manifest.json')), {
      store,
      skipUploadAccess: true,
      renderAndUpload: uploadStub(),
    });
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as {
      initialItems: Array<{ censusCategory: string; sourceValidationError?: string }>;
    };

    assert.equal(claims, 0);
    assert.equal(listCalls, 2);
    assert.equal(result.totalCandidates, 2);
    assert.equal(result.deltaCandidates, 0);
    assert.equal(result.counts.missing_identity, 2);
    assert.equal(manifest.initialItems.length, 2);
    assert.ok(manifest.initialItems.every((item) => item.censusCategory === 'missing_identity' && item.sourceValidationError));
  });

  it('pasa el contexto configurado al proceso normal antes de reclamar', async () => {
    const sourceIdentity = { network: 'BSC', chainId: 97, collectionAddressNormalized: '0xABC' } as const;
    const legacy = { _id: 'legacy-document', tokenId: '42', rarity: 3, generation: 2 };
    let observedContext: CardWorkerConfig['sourceIdentity'] = null;
    const store = fakeStore({
      claimNextCuki: async (context) => { observedContext = context ?? null; return claimed(legacy); },
    });
    await processOneCard(config('/tmp/unused-manifest.json', sourceIdentity), { store, skipUploadAccess: true, renderAndUpload: uploadStub() });
    assert.deepEqual(observedContext, sourceIdentity);
  });

  it('detecta un documento inicial modificado después del snapshot mediante fingerprint', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cuki-worker-delta-'));
    const initial = { ...baseCuki, updatedAt: new Date('2026-09-08T14:00:00.000Z') };
    const changed = { ...initial, rarity: 4, updatedAt: new Date('2026-09-08T16:00:00.000Z') };
    let listCalls = 0;
    const store = fakeStore({
      listBackfillCukies: async () => { listCalls += 1; return [listCalls === 1 ? initial : changed]; },
      getCuki: async () => initial,
      claimCukiByDocumentId: async () => claimed(initial),
    });
    const result = await backfillCards(config(path.join(dir, 'manifest.json')), { store, skipUploadAccess: true, renderAndUpload: uploadStub() });
    const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8')) as { deltaItems: Array<{ sourceFingerprint?: string; previousImageUrl: string | null }> };
    assert.equal(result.deltaCandidates, 1);
    assert.equal(manifest.deltaItems.length, 1);
    assert.ok(manifest.deltaItems[0]?.sourceFingerprint);
    assert.equal(manifest.deltaItems[0]?.previousImageUrl, null);
  });

  it('reanuda un candidato bloqueado en la siguiente ejecución', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cuki-worker-resume-'));
    const manifestPath = path.join(dir, 'manifest.json');
    const firstStore = fakeStore({ listBackfillCukies: async () => [baseCuki], getCuki: async () => baseCuki });
    const first = await backfillCards(config(manifestPath), { store: firstStore, skipUploadAccess: true, renderAndUpload: uploadStub() });
    assert.equal(first.status, 'incomplete');
    const secondStore = fakeStore({ listBackfillCukies: async () => [baseCuki], getCuki: async () => baseCuki, claimCukiByDocumentId: async () => claimed(baseCuki) });
    const second = await backfillCards(config(manifestPath), { store: secondStore, skipUploadAccess: true, renderAndUpload: uploadStub() });
    assert.equal(second.status, 'complete');
  });

  it('conserva el último checkpoint si la escritura siguiente falla', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cuki-worker-checkpoint-'));
    const manifestPath = path.join(dir, 'manifest.json');
    let writes = 0;
    const store = fakeStore({ listBackfillCukies: async () => [baseCuki], getCuki: async () => baseCuki, claimCukiByDocumentId: async () => claimed(baseCuki) });
    await assert.rejects(backfillCards(config(manifestPath), {
      store, skipUploadAccess: true, renderAndUpload: uploadStub(),
      writeCheckpoint: async (target, content) => { writes += 1; if (writes > 1) throw new Error('disk full'); await writeFile(target, content, 'utf8'); },
    }), /último checkpoint válido: Error: disk full/);
    const checkpoint = JSON.parse(await readFile(manifestPath, 'utf8')) as { initialItems: Array<{ status?: string }> };
    assert.equal(checkpoint.initialItems[0]?.status, undefined);
  });

  it('preserva el error de render aunque el lease ya sea obsoleto', async () => {
    const cuki = claimed(baseCuki);
    const store = fakeStore({ ensureIndexes: async () => undefined, claimNextCuki: async () => cuki, markFailed: async () => { throw new Error('lease ya no es válido'); } });
    await assert.rejects(processOneCard(config('/tmp/unused-manifest.json'), { store, skipUploadAccess: true, renderAndUpload: async () => { throw new Error('renderer failed'); } }), /renderer failed/);
  });
});

describe('estado durable', () => {
  it('reanuda estados incompletos y no confunde fallo parcial con completo', () => {
    assert.equal(backfillItemNeedsResume({ status: 'interrupted' }), true);
    assert.equal(backfillItemNeedsResume({ status: 'locked_or_exhausted' }), true);
    assert.equal(backfillItemNeedsResume({ status: 'failed' }), true);
    assert.equal(backfillRunStatus([{ status: 'generated' }, { status: 'already_valid' }]), 'complete');
    assert.equal(backfillRunStatus([{ status: 'generated' }, { status: 'failed' }]), 'incomplete');
  });
});
