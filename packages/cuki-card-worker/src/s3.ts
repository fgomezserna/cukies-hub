import fs from 'node:fs/promises';

import { HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ObjectCannedACL } from '@aws-sdk/client-s3';

import type { CardWorkerConfig, GenerationResult, RenderResult } from './types.js';

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

export function cardS3Key(config: CardWorkerConfig, tokenId: string) {
  return `${config.s3Prefix}/${tokenId}.png`;
}

export async function uploadRenderedCard(
  config: CardWorkerConfig,
  renderResult: RenderResult,
): Promise<GenerationResult> {
  assertS3UploadConfig(config);

  const client = createS3Client(config);
  const key = cardS3Key(config, renderResult.tokenId);
  const body = await fs.readFile(renderResult.outputPath);

  await client.send(
    new PutObjectCommand({
      Bucket: config.s3Bucket ?? undefined,
      Key: key,
      Body: body,
      ContentType: 'image/png',
      ACL: (config.s3Acl as ObjectCannedACL | null) ?? undefined,
    }),
  );

  return {
    ...renderResult,
    imageUrl: `${config.publicBaseUrl}/${key}`,
    s3Key: key,
  };
}
