import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { CardWorkerConfig, CukiDocument, GenerationResult, RenderResult } from './types.js';
import { getCardWorkerConfig } from './config/env.js';
import { renderCukiCard } from './renderer.js';
import {
  assertS3UploadConfig,
  cardContentSha256FromUrl,
  uploadRenderedCard,
  verifyPublishedCard,
  verifyS3UploadAccess,
} from './s3.js';
import { CardWorkerStore } from './storage/index.js';

type StoreTask<T> = (store: CardWorkerStore, config: CardWorkerConfig) => Promise<T>;

async function withStore<T>(task: StoreTask<T>, config = getCardWorkerConfig()) {
  const store = await new CardWorkerStore(config).connect();

  try {
    return await task(store, config);
  } finally {
    await store.close();
  }
}

function ensureUploadMode(config: CardWorkerConfig) {
  if (!config.upload) {
    throw new Error('CARD_WORKER_UPLOAD=true es obligatorio para process-once/run. Usa render-token para validar localmente.');
  }

  assertS3UploadConfig(config);
}

async function ensureUploadAccess(config: CardWorkerConfig) {
  ensureUploadMode(config);
  await verifyS3UploadAccess(config);
}

async function renderAndUpload(store: CardWorkerStore, cuki: CukiDocument, config: CardWorkerConfig) {
  const renderResult = await renderCukiCard(cuki, config);
  return uploadRenderedCard(config, renderResult);
}

export async function setupCardWorker(config = getCardWorkerConfig()) {
  return withStore(async (store) => {
    await store.ensureIndexes();
    return store.summary();
  }, config);
}

export async function getCardWorkerStatus(config = getCardWorkerConfig()) {
  return withStore(async (store) => store.summary(), config);
}

export async function renderTokenCard(tokenId: string, config = getCardWorkerConfig()): Promise<RenderResult> {
  return withStore(async (store, resolvedConfig) => {
    const cuki = await store.getCuki(tokenId);

    if (!cuki) {
      throw new Error(`No existe el Cuki ${tokenId} en la coleccion cukies.`);
    }

    const result = await renderCukiCard(cuki, resolvedConfig);
    await store.recordJob(tokenId, 'rendered_local', result);
    return result;
  }, config);
}

export async function generateTokenCard(tokenId: string, config = getCardWorkerConfig()): Promise<GenerationResult> {
  return withStore(async (store, resolvedConfig) => {
    await ensureUploadAccess(resolvedConfig);
    const cuki = await store.claimCukiById(tokenId);

    if (!cuki) {
      throw new Error(`No existe el Cuki ${tokenId} o no tiene metadata renderizable.`);
    }

    try {
      const result = await renderAndUpload(store, cuki, resolvedConfig);
      await store.markGenerated(tokenId, result);
      return result;
    } catch (error) {
      await store.markFailed(tokenId, error);
      throw error;
    }
  }, config);
}

export async function processOneCard(config = getCardWorkerConfig()): Promise<GenerationResult | null> {
  await ensureUploadAccess(config);

  return withStore(async (store, resolvedConfig) => {
    await store.ensureIndexes();

    const cuki = await store.claimNextCuki();

    if (!cuki) {
      return null;
    }

    try {
      const result = await renderAndUpload(store, cuki, resolvedConfig);
      await store.markGenerated(cuki._id, result);
      return result;
    } catch (error) {
      await store.markFailed(cuki._id, error);
      throw error;
    }
  }, config);
}

type BackfillManifestItem = {
  tokenId: string;
  network?: string;
  chainId?: number;
  collectionAddressNormalized?: string;
  previousImageHost: string | null;
};

function imageHost(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

function hasOwnedPublicImage(value: unknown, config: CardWorkerConfig) {
  return typeof value === 'string'
    && Boolean(config.publicBaseUrl)
    && value.startsWith(`${config.publicBaseUrl}/`);
}

async function processBackfillToken(
  store: CardWorkerStore,
  tokenId: string,
  config: CardWorkerConfig,
) {
  const existing = await store.getCuki(tokenId);
  if (!existing) return { status: 'missing' as const };

  if (hasOwnedPublicImage(existing.img, config)) {
    try {
      const expectedContentSha256 = cardContentSha256FromUrl(existing.img!);
      if (!expectedContentSha256) throw new Error('La URL pública no tiene SHA-256 content-addressed.');
      await verifyPublishedCard(existing.img!, { expectedContentSha256 });
      return { status: 'already_valid' as const };
    } catch {
      // A stale DB reference is repaired by the claim/upload path below.
    }
  }

  for (let attempt = 0; attempt < config.maxAttempts; attempt += 1) {
    const claimed = await store.claimCukiById(tokenId);
    if (!claimed) return { status: 'locked_or_exhausted' as const };

    try {
      const result = await renderAndUpload(store, claimed, config);
      await store.markGenerated(tokenId, result);
      return { status: 'generated' as const, result };
    } catch (error) {
      await store.markFailed(tokenId, error);
      if (attempt === config.maxAttempts - 1) {
        return {
          status: 'failed' as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return { status: 'failed' as const, error: 'Se agotaron los intentos de backfill.' };
}

export async function backfillCards(config = getCardWorkerConfig()) {
  await ensureUploadAccess(config);

  return withStore(async (store, resolvedConfig) => {
    await store.ensureIndexes();
    const runId = crypto.randomUUID();
    const cutoffAt = new Date();
    const candidates = await store.listBackfillCukies();
    const manifest = {
      runId,
      cutoffAt: cutoffAt.toISOString(),
      totalCandidates: candidates.length,
      items: candidates.map((cuki) => ({
        tokenId: cuki._id,
        network: cuki.network,
        chainId: cuki.chainId,
        collectionAddressNormalized: cuki.collectionAddressNormalized,
        previousImageHost: imageHost(cuki.img),
      } satisfies BackfillManifestItem)),
    };

    if (resolvedConfig.backfillManifestPath) {
      const directory = path.dirname(resolvedConfig.backfillManifestPath);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(resolvedConfig.backfillManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }

    const summary = {
      runId,
      cutoffAt: cutoffAt.toISOString(),
      totalCandidates: candidates.length,
      generated: 0,
      alreadyValid: 0,
      lockedOrExhausted: 0,
      missing: 0,
      failed: [] as Array<{ tokenId: string; error: string }>,
    };
    let cursor = 0;

    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        const candidate = candidates[index];
        if (!candidate) return;
        const result = await processBackfillToken(store, candidate._id, resolvedConfig);
        if (result.status === 'generated') summary.generated += 1;
        if (result.status === 'already_valid') summary.alreadyValid += 1;
        if (result.status === 'locked_or_exhausted') summary.lockedOrExhausted += 1;
        if (result.status === 'missing') summary.missing += 1;
        if (result.status === 'failed') summary.failed.push({ tokenId: candidate._id, error: result.error });
      }
    }

    await Promise.all(
      Array.from(
        { length: Math.min(resolvedConfig.backfillConcurrency, Math.max(1, candidates.length)) },
        () => worker(),
      ),
    );

    return summary;
  }, config);
}

export async function runCardWorker(config = getCardWorkerConfig()) {
  await ensureUploadAccess(config);

  let stopped = false;
  const stop = () => {
    stopped = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopped) {
    const result = await processOneCard(config);

    if (!result) {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }
}
