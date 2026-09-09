import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { assertStorageCapacity, removeVerifiedOutput, StorageCapacityError } from './runtime-safety.js';
import { finalizeGeneratedCard, processOneCard, runCardWorker } from './worker.js';
import type { CardWorkerStoreLike } from './worker.js';
import type { CardWorkerConfig, ClaimedCuki, GenerationResult } from './types.js';

const config = (outputDir: string): CardWorkerConfig => ({
  mongoUrl: 'mongodb://unused', dbName: 'cukieshub-new-staging', assetsDir: '/tmp/unused', outputDir,
  pollIntervalMs: 5000, maxAttempts: 5, staleLockMs: 60_000, upload: true,
  publicBaseUrl: 'https://assets-staging.cukies.world', publicKeyPrefix: null,
  s3Bucket: 'cukies-cards-staging', s3Region: 'us-east-1', s3Prefix: 'cards', s3Endpoint: null,
  s3ForcePathStyle: false, s3Acl: null, verifyPublic: true, backfillConcurrency: 2,
  backfillManifestPath: null, sourceFormat: 'indexed', legacyStagingEnabled: false, sourceIdentity: null,
});
const heartbeat = () => ({checkedAt: Date.now() / 1000, freeBytes: 11 * 1024 ** 3,
  sourceFreeBytes: 11 * 1024 ** 3, minioPath: 'LXC2011:/opt/minio/data', sourcePath: 'VM1001:/srv'});

describe('guarda permanente de capacidad', () => {
  it('exige heartbeat en ambas fuentes Stage', async () => {
    for (const dbName of ['cukieshub-new-staging', 'cukies-legacy-staging']) {
      await assert.rejects(assertStorageCapacity({...config('/tmp/unused'), dbName}), /HEARTBEAT_REQUIRED/);
    }
  });

  it('rechaza ausente, JSON inválido, fecha inválida/futura/caducada, discos erróneos o bajo suelo antes de claim', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'card-capacity-'));
    const capacityFile = path.join(dir, 'capacity.json');
    let claims = 0;
    const store = {claimNextCuki: async () => {claims++; return null;}} as unknown as CardWorkerStoreLike;
    const cfg = {...config(dir), capacityFile};
    await assert.rejects(processOneCard(cfg, {store}), StorageCapacityError);
    const cases: unknown[] = ['{', null, [], {},
      {...heartbeat(), checkedAt: null}, {...heartbeat(), checkedAt: 'NaN'},
      {...heartbeat(), checkedAt: Date.now() / 1000 + 60},
      {...heartbeat(), checkedAt: Date.now() / 1000 - 46},
      {...heartbeat(), minioPath: 'other-disk'}, {...heartbeat(), sourcePath: 'other-host'},
      {...heartbeat(), freeBytes: 10 * 1024 ** 3 - 1},
      {...heartbeat(), sourceFreeBytes: 10 * 1024 ** 3 - 1},
      {...heartbeat(), freeBytes: '12000000000'}];
    for (const state of cases) {
      await writeFile(capacityFile, typeof state === 'string' ? state : JSON.stringify(state));
      await assert.rejects(processOneCard(cfg, {store}), StorageCapacityError);
    }
    assert.equal(claims, 0);
  });

  it('acepta ambos discos identificados, frescos y exactamente en el suelo', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'card-capacity-valid-'));
    const capacityFile = path.join(dir, 'capacity.json');
    await writeFile(capacityFile, JSON.stringify({...heartbeat(), freeBytes: 10 * 1024 ** 3, sourceFreeBytes: 10 * 1024 ** 3}));
    await assertStorageCapacity({...config(dir), capacityFile});
  });

  it('el daemon espera 30 segundos tras una guarda fallida sin claim ni bucle acelerado', async (t) => {
    const delays: number[] = [];
    let claims = 0;
    const store = {claimNextCuki: async () => {claims++; return null;}} as unknown as CardWorkerStoreLike;
    t.mock.method(console, 'error', () => undefined);
    t.mock.method(global, 'setTimeout', ((callback: () => void, delay: number) => {
      delays.push(delay);
      process.emit('SIGTERM');
      callback();
      return 0;
    }) as unknown as typeof setTimeout);
    await runCardWorker(config('/tmp/unused'), {store});
    assert.deepEqual(delays, [30_000]);
    assert.equal(claims, 0);
  });
});

async function fixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'card-owned-output-'));
  const body = Buffer.from('owned-card-bytes');
  const hash = createHash('sha256').update(body).digest('hex');
  const outputPath = path.join(dir, '42.png');
  await writeFile(outputPath, body);
  const result: GenerationResult = {tokenId: '42', documentId: 'doc42', outputPath, width: 1, height: 1,
    imageUrl: `https://assets-staging.cukies.world/NDI/${hash}.png`, s3Key: `cards/NDI/${hash}.png`,
    publicVerification: {status: 200, contentType: 'image/png', contentLength: body.length, cacheControl: 'immutable', etag: null}};
  const cuki = {_id: 'doc42', tokenId: '42'} as ClaimedCuki;
  return {dir, body, result, cuki, cfg: config(dir)};
}

describe('cleanup exclusivo posterior a publicación y Mongo', () => {
  it('conserva el PNG durante markGenerated y lo retira sólo después del éxito', async () => {
    const f = await fixture();
    const store = {markGenerated: async () => {await access(f.result.outputPath);}} as unknown as CardWorkerStoreLike;
    await finalizeGeneratedCard(store, f.cuki, f.result, f.cfg, true);
    await assert.rejects(access(f.result.outputPath), {code: 'ENOENT'});
  });

  it('conserva PNG ante fencing/fracaso Mongo y ante verificación pública ausente', async () => {
    const f = await fixture();
    const store = {markGenerated: async () => {throw new Error('lease-rejected');}} as unknown as CardWorkerStoreLike;
    await assert.rejects(finalizeGeneratedCard(store, f.cuki, f.result, f.cfg, true), /lease-rejected/);
    assert.deepEqual(await readFile(f.result.outputPath), f.body);
    assert.equal(await removeVerifiedOutput({...f.result, publicVerification: undefined}, f.cfg), false);
    await access(f.result.outputPath);
  });

  it('no borra renders inyectados ni otra identidad, ni marca como fallida una publicación confirmada', async (t) => {
    const f = await fixture();
    let generated = 0;
    let failed = 0;
    const store = {markGenerated: async () => {generated++;}, markFailed: async () => {failed++;}} as unknown as CardWorkerStoreLike;
    t.mock.method(console, 'error', () => undefined);
    await finalizeGeneratedCard(store, f.cuki, f.result, f.cfg, false);
    await finalizeGeneratedCard(store, f.cuki, {...f.result, documentId: 'another'}, f.cfg, true);
    assert.equal(generated, 2); assert.equal(failed, 0);
    await access(f.result.outputPath);
  });

  it('rechaza token, hash, longitud, raíz ajena y symlinks conservando los archivos', async () => {
    const f = await fixture();
    await assert.rejects(removeVerifiedOutput({...f.result, tokenId: '../42'}, f.cfg), /INVALID_TOKEN/);
    await assert.rejects(removeVerifiedOutput({...f.result, tokenId: '43'}, f.cfg), /PATH_MISMATCH/);
    await assert.rejects(removeVerifiedOutput({...f.result, imageUrl: f.result.imageUrl!.replace(/[a-f0-9]{64}/, '0'.repeat(64))}, f.cfg), /VERIFICATION_MISMATCH/);
    await assert.rejects(removeVerifiedOutput({...f.result, publicVerification: {...f.result.publicVerification!, contentLength: 1}}, f.cfg), /VERIFICATION_MISMATCH/);
    const other = await fixture();
    await assert.rejects(removeVerifiedOutput({...f.result, outputPath: other.result.outputPath}, f.cfg), /PATH_MISMATCH/);
    const link = path.join(f.dir, '99.png');
    await symlink(other.result.outputPath, link);
    await assert.rejects(removeVerifiedOutput({...f.result, tokenId: '99', outputPath: link}, f.cfg), /PATH_MISMATCH/);
    assert.deepEqual(await readFile(f.result.outputPath), f.body);
    assert.deepEqual(await readFile(other.result.outputPath), other.body);
  });
});
