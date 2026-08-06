import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCardObjectUpload,
  cardContentSha256,
  cardS3Key,
  IMMUTABLE_CARD_CACHE_CONTROL,
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
  s3Bucket: 'staging-bucket',
  s3Region: 'us-east-1',
  s3Prefix: 'png/staging/tokens/v2/test-collection',
  s3Endpoint: 'http://minio.staging.invalid:9000',
  s3ForcePathStyle: true,
  s3Acl: 'private',
};

const renderResult: RenderResult = {
  tokenId: '42',
  outputPath: '/tmp/cards/42.png',
  width: 752,
  height: 1152,
};

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

  it('rejects empty token ids and malformed content hashes', () => {
    assert.throws(() => cardS3Key(config, '', '0'.repeat(64)), /tokenId/);
    assert.throws(() => cardS3Key(config, '42', 'ABC'), /SHA-256/);
  });
});
