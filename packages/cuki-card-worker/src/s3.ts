import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';

import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ObjectCannedACL, PutObjectCommandInput } from '@aws-sdk/client-s3';
import Jimp from 'jimp';

import type { CardWorkerConfig, GenerationResult, PublicCardVerification, RenderResult } from './types.js';

export const IMMUTABLE_CARD_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const LEGACY_STAGING_S3_BUCKET = 'cukies-cards-staging';
const LEGACY_STAGING_PUBLIC_BASE_URL = 'https://assets-staging.cukies.world';

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

  if (config.sourceFormat === 'legacy') {
    if (config.s3Bucket !== LEGACY_STAGING_S3_BUCKET) {
      throw new Error(`La fuente legacy sólo permite el bucket ${LEGACY_STAGING_S3_BUCKET}.`);
    }
    if (config.publicBaseUrl !== LEGACY_STAGING_PUBLIC_BASE_URL) {
      throw new Error(`La fuente legacy sólo permite el origen ${LEGACY_STAGING_PUBLIC_BASE_URL}.`);
    }
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

const PUBLIC_CARD_TIMEOUT_MS = 10_000;
const PUBLIC_CARD_MAX_BYTES = 8 * 1024 * 1024;

export type PublicCardVerificationOptions = {
  expectedContentSha256?: string;
  expectedContentLength?: number;
  timeoutMs?: number;
  maxBytes?: number;
  attempts?: number;
};

async function readResponseBody(response: Response, maxBytes: number) {
  if (!response.body) {
    throw new Error('La card publicada no devuelve cuerpo.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;

      if (total > maxBytes) {
        throw new Error(`La card publicada supera el limite de ${maxBytes} bytes.`);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

async function requestPublicCard(url: string, options: PublicCardVerificationOptions) {
  let lastError: unknown;
  const attempts = options.attempts ?? 5;
  const timeoutMs = options.timeoutMs ?? PUBLIC_CARD_TIMEOUT_MS;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, { method: 'GET', redirect: 'error', signal: controller.signal });
      if (response.ok) {
        const body = await readResponseBody(response, options.maxBytes ?? PUBLIC_CARD_MAX_BYTES);
        return { body, response };
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, 200 * 2 ** (attempt - 1))));
    }
  }

  throw new Error(`La card no es legible desde la URL pública ${url}: ${String(lastError)}`);
}

export async function verifyPublishedCard(
  url: string,
  options: PublicCardVerificationOptions = {},
): Promise<PublicCardVerification> {
  const { body, response } = await requestPublicCard(url, options);
  const contentType = response.headers.get('content-type');
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;

  if (!contentType?.toLowerCase().startsWith('image/png')) {
    throw new Error(`La card publicada devuelve Content-Type inválido: ${contentType ?? 'ausente'}`);
  }

  if (contentLength !== null && (!Number.isSafeInteger(contentLength) || contentLength <= 0)) {
    throw new Error(`La card publicada devuelve Content-Length inválido: ${contentLengthHeader}`);
  }

  if (contentLength !== null && contentLength !== body.length) {
    throw new Error(`La card publicada está truncada: header=${contentLength} bytes, body=${body.length} bytes.`);
  }

  if (options.expectedContentLength !== undefined && body.length !== options.expectedContentLength) {
    throw new Error(
      `La card publicada tiene longitud inesperada: esperado=${options.expectedContentLength}, recibido=${body.length}.`,
    );
  }

  try {
    const image = await Jimp.read(body);
    if (image.bitmap.width <= 0 || image.bitmap.height <= 0) {
      throw new Error('dimensiones vacías');
    }
  } catch (error) {
    throw new Error(`La card publicada no es un PNG válido: ${String(error)}`);
  }

  if (options.expectedContentSha256 && cardContentSha256(body) !== options.expectedContentSha256) {
    throw new Error('La card publicada no coincide con el SHA-256 content-addressed esperado.');
  }

  return {
    status: response.status,
    contentType,
    contentLength: body.length,
    cacheControl: response.headers.get('cache-control'),
    etag: response.headers.get('etag'),
  };
}

export function cardContentSha256FromUrl(url: string) {
  try {
    const match = new URL(url).pathname.match(/\/([a-f0-9]{64})\.png$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
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
    ? await verifyPublishedCard(upload.imageUrl, {
        expectedContentSha256: upload.contentSha256,
        expectedContentLength: body.length,
      })
    : undefined;

  return {
    ...renderResult,
    imageUrl: upload.imageUrl,
    s3Key: upload.key,
    ...(publicVerification ? { publicVerification } : {}),
  };
}
