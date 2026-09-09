import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { CardWorkerConfig, GenerationResult } from './types.js';
import { cardContentSha256FromUrl } from './s3.js';

const MIN_FREE_BYTES = 10 * 1024 ** 3;
const MAX_HEARTBEAT_AGE_SECONDS = 45;

export class StorageCapacityError extends Error {}

export async function assertStorageCapacity(config: CardWorkerConfig) {
  if (!config.capacityFile) {
    if (['cukieshub-new-staging', 'cukies-legacy-staging'].includes(config.dbName)) {
      throw new StorageCapacityError('CARD_STORAGE_HEARTBEAT_REQUIRED');
    }
    return;
  }
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(await fs.readFile(config.capacityFile, 'utf8'));
    if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error();
  } catch {
    throw new StorageCapacityError('CARD_STORAGE_HEARTBEAT_UNAVAILABLE');
  }
  const age = typeof state.checkedAt === 'number' ? Date.now() / 1000 - state.checkedAt : NaN;
  if (!Number.isFinite(age) || age < 0 || age >= MAX_HEARTBEAT_AGE_SECONDS) {
    throw new StorageCapacityError('CARD_STORAGE_HEARTBEAT_STALE');
  }
  if (state.minioPath !== 'LXC2011:/opt/minio/data' || state.sourcePath !== 'VM1001:/srv') {
    throw new StorageCapacityError('CARD_STORAGE_IDENTITY_MISMATCH');
  }
  for (const field of ['freeBytes', 'sourceFreeBytes']) {
    const free = state[field];
    if (typeof free !== 'number' || !Number.isSafeInteger(free) || free < MIN_FREE_BYTES) {
      throw new StorageCapacityError('CARD_STORAGE_BELOW_FLOOR');
    }
  }
}

// Only called for an output created by this invocation, after Mongo confirms it.
export async function removeVerifiedOutput(result: GenerationResult, config: CardWorkerConfig) {
  if (result.publicVerification?.status !== 200 || !result.imageUrl) return false;
  if (!/^(0|[1-9][0-9]*)$/.test(result.tokenId)) throw new Error('CARD_OUTPUT_INVALID_TOKEN');
  const root = await fs.realpath(config.outputDir);
  const expected = path.resolve(config.outputDir, `${result.tokenId}.png`);
  if (path.resolve(result.outputPath) !== expected
    || await fs.realpath(result.outputPath) !== path.join(root, `${result.tokenId}.png`)) {
    throw new Error('CARD_OUTPUT_PATH_MISMATCH');
  }
  const stat = await fs.lstat(expected);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('CARD_OUTPUT_NOT_OWN_FILE');
  const hash = cardContentSha256FromUrl(result.imageUrl);
  const tokenSegment = Buffer.from(result.tokenId).toString('base64url');
  const body = await fs.readFile(expected);
  if (!hash || createHash('sha256').update(body).digest('hex') !== hash
    || result.publicVerification.contentLength !== body.length
    || !result.publicVerification.contentType?.startsWith('image/png')
    || !result.imageUrl.startsWith(`${config.publicBaseUrl}/`)
    || !result.imageUrl.endsWith(`/${tokenSegment}/${hash}.png`)
    || !result.s3Key?.endsWith(`/${tokenSegment}/${hash}.png`)) {
    throw new Error('CARD_OUTPUT_VERIFICATION_MISMATCH');
  }
  await fs.unlink(expected);
  return true;
}
