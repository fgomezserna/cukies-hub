import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {
  BackfillCensusCategory,
  CardWorkerConfig,
  CukiDocument,
  GenerationResult,
  RenderResult,
} from './types.js';
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
    const cuki = await store.getCukiByTokenId(tokenId);

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
    const cuki = await store.claimCukiByTokenId(tokenId);

    if (!cuki) {
      throw new Error(`No existe el Cuki ${tokenId} o no tiene metadata renderizable.`);
    }

    try {
      const result = await renderAndUpload(store, cuki, resolvedConfig);
      await store.markGenerated(cuki, result);
      return result;
    } catch (error) {
      await store.markFailed(cuki, error);
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
      await store.markGenerated(cuki, result);
      return result;
    } catch (error) {
      await store.markFailed(cuki, error);
      throw error;
    }
  }, config);
}

type BackfillManifestItem = {
  documentId: string;
  tokenId: string;
  assetIdentity: string;
  legacyDocumentId: string;
  legacyTokenId: string;
  network?: string;
  chain?: string;
  chainId?: number;
  collectionAddressNormalized?: string;
  previousImageUrl: string | null;
  previousImageSha256: string | null;
  previousImageHost: string | null;
  sourceRevision: string | null;
  censusCategory: BackfillCensusCategory;
  status?: BackfillCensusCategory;
  lastError?: string;
  checkedAt?: string;
};

type BackfillManifest = {
  version: 2;
  runId: string;
  startedAt: string;
  cutoffAt: string;
  status: 'in_progress' | 'complete' | 'incomplete';
  initialItems: BackfillManifestItem[];
  deltaItems: BackfillManifestItem[];
};

const resumableStatuses = new Set<BackfillCensusCategory | undefined>([
  undefined,
  'locked_or_exhausted',
  'failed',
  'interrupted',
]);

export function backfillItemNeedsResume(item: Pick<BackfillManifestItem, 'status'>) {
  return resumableStatuses.has(item.status);
}

export function backfillRunStatus(items: Array<Pick<BackfillManifestItem, 'status'>>) {
  return items.some((item) => backfillItemNeedsResume(item)) ? 'incomplete' as const : 'complete' as const;
}

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

export function classifyCukiMetadata(cuki: CukiDocument): Extract<BackfillCensusCategory, 'invalid_identity' | 'renderable' | 'missing_metadata' | 'unsupported_metadata'> {
  if (cuki.sourceValidationError) return 'invalid_identity';
  const rawType = cuki.type ?? cuki.rarity;
  const rawGeneration = cuki.skills?.generation ?? cuki.generation;
  if (rawType === undefined || rawType === null || rawGeneration === undefined || rawGeneration === null) {
    return 'missing_metadata';
  }

  const type = Number(rawType);
  const generation = Number(rawGeneration);
  if (!Number.isInteger(type) || type < 1 || type > 6 || !Number.isInteger(generation) || generation < 1 || generation > 2) {
    return 'unsupported_metadata';
  }

  return 'renderable';
}

export function canonicalAssetIdentity(cuki: CukiDocument, sourceFormat: CardWorkerConfig['sourceFormat'] = 'indexed') {
  if (sourceFormat === 'legacy' && cuki.sourceValidationError) {
    return `invalid:document:${String(cuki._id)}`;
  }
  const tokenId = cuki.tokenId ?? cuki._id;
  const network = (cuki.network ?? cuki.chain ?? 'unknown').trim().toLowerCase() || 'unknown';
  const collection = (cuki.collectionAddressNormalized ?? 'unknown').trim().toLowerCase() || 'unknown';
  if (network === 'unknown' || collection === 'unknown') return `document:${cuki._id}`;
  return `${network}:${collection}:${tokenId}`;
}

function manifestItem(cuki: CukiDocument): BackfillManifestItem {
  const tokenId = cuki.tokenId ?? String(cuki._id);
  const censusCategory = classifyCukiMetadata(cuki);
  return {
    documentId: String(cuki._id),
    tokenId,
    assetIdentity: censusCategory === 'invalid_identity'
      ? `invalid:document:${String(cuki._id)}`
      : canonicalAssetIdentity(cuki),
    legacyDocumentId: String(cuki._id),
    legacyTokenId: tokenId,
    network: cuki.network,
    chain: cuki.chain,
    chainId: cuki.chainId,
    collectionAddressNormalized: cuki.collectionAddressNormalized,
    previousImageUrl: typeof cuki.img === 'string' && cuki.img.trim() ? cuki.img.trim() : null,
    previousImageSha256: typeof cuki.img === 'string' ? cardContentSha256FromUrl(cuki.img) : null,
    previousImageHost: imageHost(cuki.img),
    sourceRevision: cuki.updatedAt?.toISOString() ?? null,
    censusCategory,
    ...(censusCategory === 'renderable' ? {} : { status: censusCategory }),
  };
}

async function processBackfillToken(
  store: CardWorkerStore,
  candidate: BackfillManifestItem,
  config: CardWorkerConfig,
) {
  if (candidate.censusCategory !== 'renderable') return { status: candidate.censusCategory } as const;

  const existing = await store.getCuki(candidate.documentId);
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
    const claimed = await store.claimCukiByDocumentId(candidate.documentId);
    if (!claimed) return { status: 'locked_or_exhausted' as const };

    try {
      const result = await renderAndUpload(store, claimed, config);
      await store.markGenerated(claimed, result);
      return { status: 'generated' as const, result };
    } catch (error) {
      await store.markFailed(claimed, error);
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
    if (!resolvedConfig.backfillManifestPath) {
      throw new Error('CARD_WORKER_BACKFILL_MANIFEST_PATH es obligatorio para un backfill durable y reanudable.');
    }

    const manifestPath = resolvedConfig.backfillManifestPath;
    const directory = path.dirname(manifestPath);
    await fs.mkdir(directory, { recursive: true });
    let manifest: BackfillManifest | null = null;
    try {
      const existing = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as BackfillManifest;
      if (existing.version === 2 && existing.status !== 'complete') manifest = existing;
    } catch {
      // No durable run exists yet; create the initial inventory below.
    }

    if (!manifest) {
      const cutoffAt = new Date();
      const candidates = await store.listBackfillCukies();
      manifest = {
        version: 2,
        runId: crypto.randomUUID(),
        startedAt: new Date().toISOString(),
        cutoffAt: cutoffAt.toISOString(),
        status: 'in_progress',
        initialItems: candidates.map((candidate) => manifestItem(candidate)),
        deltaItems: [],
      };
    } else {
      manifest.status = 'in_progress';
    }

    let checkpoint = Promise.resolve();
    const saveManifest = async () => {
      checkpoint = checkpoint.then(async () => {
        const temporaryPath = `${manifestPath}.${manifest!.runId}.tmp`;
        await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
        await fs.rename(temporaryPath, manifestPath);
      });
      await checkpoint;
    };
    await saveManifest();

    let cursor = 0;
    const candidates = [...manifest.initialItems, ...manifest.deltaItems];
    const processedDocumentIds = new Set<string>();

    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        const candidate = candidates[index];
        if (!candidate) return;
        if (!backfillItemNeedsResume(candidate)) {
          processedDocumentIds.add(candidate.documentId);
          continue;
        }
        try {
          const result = await processBackfillToken(store, candidate, resolvedConfig);
          candidate.status = result.status;
          candidate.lastError = 'error' in result ? result.error : undefined;
        } catch (error) {
          candidate.status = 'failed';
          candidate.lastError = error instanceof Error ? error.message : String(error);
        } finally {
          processedDocumentIds.add(candidate.documentId);
          candidate.checkedAt = new Date().toISOString();
          await saveManifest();
        }
      }
    }

    await Promise.allSettled(
      Array.from(
        { length: Math.min(resolvedConfig.backfillConcurrency, Math.max(1, candidates.length)) },
        () => worker(),
      ),
    );

    const current = await store.listBackfillCukies();
    const initialIds = new Set(manifest.initialItems.map((item) => item.documentId));
    const knownDeltaIds = new Set(manifest.deltaItems.map((item) => `${item.documentId}:${item.sourceRevision ?? 'none'}`));
    for (const cuki of current) {
      const changedAfterCutoff = cuki.updatedAt && cuki.updatedAt > new Date(manifest.cutoffAt);
      const documentId = String(cuki._id);
      if ((!initialIds.has(documentId) || changedAfterCutoff) && !processedDocumentIds.has(documentId)) {
        const item = manifestItem(cuki);
        const key = `${item.documentId}:${item.sourceRevision ?? 'none'}`;
        if (!knownDeltaIds.has(key)) manifest.deltaItems.push(item);
      }
    }

    manifest.status = backfillRunStatus([...manifest.initialItems, ...manifest.deltaItems]);
    await saveManifest();

    const counts = [...manifest.initialItems, ...manifest.deltaItems].reduce<Record<string, number>>((acc, item) => {
      const category = item.status ?? item.censusCategory;
      acc[category] = (acc[category] ?? 0) + 1;
      return acc;
    }, {});

    return {
      runId: manifest.runId,
      cutoffAt: manifest.cutoffAt,
      status: manifest.status,
      totalCandidates: manifest.initialItems.length,
      deltaCandidates: manifest.deltaItems.length,
      counts,
      manifestPath,
    };
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
