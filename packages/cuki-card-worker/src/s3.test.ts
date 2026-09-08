import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

import {
  buildCardObjectUpload,
  cardContentSha256FromUrl,
  cardContentSha256,
  cardS3Key,
  IMMUTABLE_CARD_CACHE_CONTROL,
  verifyPublishedCard,
} from './s3.js';
import type { CardWorkerConfig, RenderResult } from './types.js';

const config: CardWorkerConfig = {
  mongoUrl: 'mongodb://staging.invalid',
  dbName: 'cukieshub-new-staging',
  assetsDir: '/tmp/assets',
  outputDir: '/tmp/cards',
  pollIntervalMs: 5_000,
  maxAttempts: 5,
  staleLockMs: 900_000,
  upload: true,
  publicBaseUrl: 'https://cards.staging.invalid/staging-bucket',
  publicKeyPrefix: null,
  s3Bucket: 'staging-bucket',
  s3Region: 'us-east-1',
  s3Prefix: 'png/staging/tokens/v2/test-collection',
  s3Endpoint: 'http://minio.staging.invalid:9000',
  s3ForcePathStyle: true,
  s3Acl: 'private',
  verifyPublic: true,
  backfillConcurrency: 2,
  backfillManifestPath: null,
  sourceIdentity: null,
};

const renderResult: RenderResult = {
  tokenId: '42',
  outputPath: '/tmp/cards/42.png',
  width: 752,
  height: 1152,
};

const validPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('immutable card uploads', () => {
  it('uses a deterministic SHA-256 content address', () => {
    const firstBody = Buffer.from('first png');
    const secondBody = Buffer.from('second png');

    const first = buildCardObjectUpload(config, renderResult, firstBody);
    const firstReplay = buildCardObjectUpload(config, renderResult, firstBody);
    const second = buildCardObjectUpload(config, renderResult, secondBody);

    assert.equal(first.key, firstReplay.key);
    assert.equal(first.imageUrl, firstReplay.imageUrl);
    assert.notEqual(first.key, second.key);
    assert.equal(first.contentSha256, cardContentSha256(firstBody));
    assert.match(
      first.key,
      /^png\/staging\/tokens\/v2\/test-collection\/[A-Za-z0-9_-]+\/[a-f0-9]{64}\.png$/,
    );
  });

  it('encodes arbitrary token ids into a single safe path segment', () => {
    const unsafeTokenId = '../../Cukie 42/ñ';
    const hash = cardContentSha256(Buffer.from('png'));
    const key = cardS3Key(config, unsafeTokenId, hash);
    const tokenSegment = key.split('/').at(-2);

    assert.ok(tokenSegment);
    assert.match(tokenSegment, /^[A-Za-z0-9_-]+$/);
    assert.equal(Buffer.from(tokenSegment, 'base64url').toString('utf8'), unsafeTokenId);
    assert.equal(key.includes('../'), false);
  });

  it('publishes immutable PNG metadata and the exact versioned URL', () => {
    const body = Buffer.from('png bytes');
    const upload = buildCardObjectUpload(config, renderResult, body);

    assert.equal(upload.putObjectInput.Bucket, config.s3Bucket);
    assert.equal(upload.putObjectInput.Key, upload.key);
    assert.equal(upload.putObjectInput.Body, body);
    assert.equal(upload.putObjectInput.ContentType, 'image/png');
    assert.equal(upload.putObjectInput.CacheControl, IMMUTABLE_CARD_CACHE_CONTROL);
    assert.equal(upload.putObjectInput.ACL, 'private');
    assert.equal(upload.imageUrl, `${config.publicBaseUrl}/${upload.key}`);
  });

  it('omits the private gateway prefix from the public URL', () => {
    const body = Buffer.from('gateway png bytes');
    const upload = buildCardObjectUpload(
      { ...config, publicBaseUrl: 'https://assets-staging.cukies.world', publicKeyPrefix: config.s3Prefix },
      renderResult,
      body,
    );

    assert.equal(upload.imageUrl, `https://assets-staging.cukies.world/${upload.key.slice(config.s3Prefix.length + 1)}`);
    assert.match(upload.key, new RegExp(`^${config.s3Prefix}/`));
  });

  it('rejects empty token ids and malformed content hashes', () => {
    assert.throws(() => cardS3Key(config, '', '0'.repeat(64)), /tokenId/);
    assert.throws(() => cardS3Key(config, '42', 'ABC'), /SHA-256/);
  });

  it('verifies a valid public PNG and its content-addressed hash', async () => {
    const hash = cardContentSha256(validPng);
    const url = `https://assets-staging.cukies.world/${hash}.png`;
    mock.method(globalThis, 'fetch', async () => new Response(validPng, {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': String(validPng.length) },
    }));

    await assert.doesNotReject(() => verifyPublishedCard(url, {
      expectedContentSha256: hash,
      expectedContentLength: validPng.length,
      attempts: 1,
    }));
    assert.equal(cardContentSha256FromUrl(url), hash);
    mock.restoreAll();
  });

  it('rejects a different PNG, a placeholder and a truncated body', async () => {
    const hash = cardContentSha256(validPng);
    const url = `https://assets-staging.cukies.world/${hash}.png`;

    mock.method(globalThis, 'fetch', async () => new Response(validPng, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    await assert.rejects(
      () => verifyPublishedCard(url, { expectedContentSha256: cardContentSha256(Buffer.from('other')), attempts: 1 }),
      /SHA-256/,
    );
    mock.restoreAll();

    mock.method(globalThis, 'fetch', async () => new Response('placeholder', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    await assert.rejects(() => verifyPublishedCard(url, { attempts: 1 }), /PNG válido/);
    mock.restoreAll();

    mock.method(globalThis, 'fetch', async () => new Response(validPng, {
      status: 200,
      headers: { 'content-type': 'image/png' },
    }));
    await assert.rejects(
      () => verifyPublishedCard(url, { expectedContentLength: validPng.length + 1, attempts: 1 }),
      /longitud inesperada/,
    );
    mock.restoreAll();
  });

  it('aborts a public verification that exceeds its timeout', async () => {
    mock.method(globalThis, 'fetch', (_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    }));

    await assert.rejects(
      () => verifyPublishedCard('https://assets-staging.cukies.world/slow.png', { timeoutMs: 5, attempts: 1 }),
      /AbortError/,
    );
    mock.restoreAll();
  });
});
