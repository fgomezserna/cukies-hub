import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ObjectCannedACL, PutObjectCommandInput } from '@aws-sdk/client-s3';

import type { CardWorkerConfig, GenerationResult, PublicCardVerification, RenderResult } from './types.js';

export const IMMUTABLE_CARD_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export function assertS3UploadConfig(config: CardWorkerConfig) {
  if (!config.s3Bucket) {
    throw new Error('Falta CARD_WORKER_S3_BUCKET para subir cards.');
  }

  if (!config.s3Region) {
    throw new Error('Falta CARD_WORKER_S3_REGION para subir cards.');
  }

  if (!config.publicBaseUrl) {
    throw new Error('Falta CARD_WORKER_PUBLIC_BASE_URL o bucket/region para construir la URL publica.');
  }
}

function createS3Client(config: CardWorkerConfig) {
  return new S3Client({
    region: config.s3Region ?? undefined,
    endpoint: config.s3Endpoint ?? undefined,
    forcePathStyle: config.s3ForcePathStyle,
  });
}

export async function verifyS3UploadAccess(config: CardWorkerConfig) {
  assertS3UploadConfig(config);

  const client = createS3Client(config);
  await client.send(new HeadBucketCommand({ Bucket: config.s3Bucket ?? undefined }));
}

async function requestPublicCard(url: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'error' });
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 200 * 2 ** (attempt - 1))));
  }

  throw new Error(`La card no es legible desde la URL pública ${url}: ${String(lastError)}`);
}

export async function verifyPublishedCard(url: string): Promise<PublicCardVerification> {
  const response = await requestPublicCard(url);
  const contentType = response.headers.get('content-type');
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

  if (!contentType?.toLowerCase().startsWith('image/png')) {
    throw new Error(`La card publicada devuelve Content-Type inválido: ${contentType ?? 'ausente'}`);
  }

  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength <= 0)) {
    throw new Error(`La card publicada devuelve Content-Length inválido: ${contentLengthHeader}`);
  }

  return {
    status: response.status,
    contentType,
    contentLength,
    cacheControl: response.headers.get('cache-control'),
    etag: response.headers.get('etag'),
  };
}

export function cardContentSha256(body: Uint8Array) {
  return createHash('sha256').update(body).digest('hex');
}

function cardTokenPathSegment(tokenId: string) {
  if (!tokenId) {
    throw new Error('El tokenId de la card no puede estar vacio.');
  }

  return Buffer.from(tokenId, 'utf8').toString('base64url');
}

export function cardS3Key(config: CardWorkerConfig, tokenId: string, contentSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(contentSha256)) {
    throw new Error('El SHA-256 de la card debe ser hexadecimal en minusculas y tener 64 caracteres.');
  }

  return `${config.s3Prefix}/${cardTokenPathSegment(tokenId)}/${contentSha256}.png`;
}

function publicObjectPath(config: CardWorkerConfig, key: string) {
  if (!config.publicKeyPrefix) return key;
  const prefix = `${config.publicKeyPrefix}/`;
  if (!key.startsWith(prefix)) {
    throw new Error(`La clave ${key} no está dentro del prefijo público configurado.`);
  }

  return key.slice(prefix.length);
}

export function buildCardObjectUpload(
  config: CardWorkerConfig,
  renderResult: RenderResult,
  body: Uint8Array,
) {
  assertS3UploadConfig(config);

  const contentSha256 = cardContentSha256(body);
  const key = cardS3Key(config, renderResult.tokenId, contentSha256);
  const putObjectInput: PutObjectCommandInput = {
    Bucket: config.s3Bucket ?? undefined,
    Key: key,
    Body: body,
    ContentType: 'image/png',
    CacheControl: IMMUTABLE_CARD_CACHE_CONTROL,
    ACL: (config.s3Acl as ObjectCannedACL | null) ?? undefined,
  };

  return {
    contentSha256,
    imageUrl: `${config.publicBaseUrl}/${publicObjectPath(config, key)}`,
    key,
    putObjectInput,
  };
}

export async function uploadRenderedCard(
  config: CardWorkerConfig,
  renderResult: RenderResult,
): Promise<GenerationResult> {
  assertS3UploadConfig(config);

  const client = createS3Client(config);
  const body = await fs.readFile(renderResult.outputPath);
  const upload = buildCardObjectUpload(config, renderResult, body);

  await client.send(new PutObjectCommand(upload.putObjectInput));

  const publicVerification = config.verifyPublic
    ? await verifyPublishedCard(upload.imageUrl)
    : undefined;

  return {
    ...renderResult,
    imageUrl: upload.imageUrl,
    s3Key: upload.key,
    ...(publicVerification ? { publicVerification } : {}),
  };
}
