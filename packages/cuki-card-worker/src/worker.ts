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
import { canonicalAssetIdentity, cukiInputFingerprint } from './identity.js';
import type { AssetIdentityContext } from './types.js';
import { resolveCukiMetadata } from './metadata.js';
export { canonicalAssetIdentity, cukiInputFingerprint } from './identity.js';

export type CardWorkerStoreLike = Pick<
  CardWorkerStore,
  | 'close'
  | 'ensureIndexes'
  | 'summary'
  | 'getCukiByTokenId'
  | 'recordJob'
  | 'claimCukiByTokenId'
  | 'claimNextCuki'
  | 'getCuki'
  | 'claimCukiByDocumentId'
  | 'markGenerated'
  | 'markFailed'
  | 'listBackfillCukies'
>;

export type CardWorkerDependencies = {
  store?: CardWorkerStoreLike;
  skipUploadAccess?: boolean;
  renderAndUpload?: (store: CardWorkerStoreLike, cuki: CukiDocument, config: CardWorkerConfig, identity?: AssetIdentityContext) => Promise<GenerationResult>;
  writeCheckpoint?: (manifestPath: string, content: string, runId: string) => Promise<void>;
};

type StoreTask<T> = (store: CardWorkerStoreLike, config: CardWorkerConfig) => Promise<T>;

async function withStore<T>(task: StoreTask<T>, config: CardWorkerConfig, dependencies: CardWorkerDependencies = {}) {
  const injected = dependencies.store;
  const store = injected ?? await new CardWorkerStore(config).connect();

  try {
    return await task(store, config);
  } finally {
    if (!injected) await store.close();
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

async function renderAndUpload(store: CardWorkerStoreLike, cuki: CukiDocument, config: CardWorkerConfig, identity?: AssetIdentityContext) {
  const renderResult = await renderCukiCard(cuki, config, identity);
  return uploadRenderedCard(config, renderResult);
}

export async function setupCardWorker(config = getCardWorkerConfig(), dependencies: CardWorkerDependencies = {}) {
  return withStore(async (store) => {
    await store.ensureIndexes();
    return store.summary();
  }, config, dependencies);
}

export async function getCardWorkerStatus(config = getCardWorkerConfig(), dependencies: CardWorkerDependencies = {}) {
  return withStore(async (store) => store.summary(), config, dependencies);
}

export async function renderTokenCard(
  tokenId: string,
  config = getCardWorkerConfig(),
  dependencies: CardWorkerDependencies = {},
  identity?: AssetIdentityContext,
): Promise<RenderResult> {
  return withStore(async (store, resolvedConfig) => {
    const sourceIdentity = identity ?? resolvedConfig.sourceIdentity ?? undefined;
    const cuki = await store.getCukiByTokenId(tokenId, sourceIdentity);

    if (!cuki) {
      throw new Error(`No existe el Cuki ${tokenId} en la coleccion cukies.`);
    }

    const result = await renderCukiCard(cuki, resolvedConfig, sourceIdentity);
    await store.recordJob(tokenId, 'rendered_local', result);
    return result;
  }, config, dependencies);
}

export async function generateTokenCard(
  tokenId: string,
  config = getCardWorkerConfig(),
  dependencies: CardWorkerDependencies = {},
  identity?: AssetIdentityContext,
): Promise<GenerationResult> {
  return withStore(async (store, resolvedConfig) => {
    if (!dependencies.skipUploadAccess) await ensureUploadAccess(resolvedConfig);
    const sourceIdentity = identity ?? resolvedConfig.sourceIdentity ?? undefined;
    const cuki = await store.claimCukiByTokenId(tokenId, sourceIdentity);

    if (!cuki) {
      throw new Error(`No existe el Cuki ${tokenId} o no tiene metadata renderizable.`);
    }

    try {
      const result = await (dependencies.renderAndUpload ?? renderAndUpload)(store, cuki, resolvedConfig, sourceIdentity);
      await store.markGenerated(cuki, result);
      return result;
    } catch (error) {
      try {
        await store.markFailed(cuki, error);
      } catch (fencingError) {
        console.error(fencingError instanceof Error ? fencingError.message : fencingError);
      }
      throw error;
    }
  }, config, dependencies);
}

export async function processOneCard(
  config = getCardWorkerConfig(),
  dependencies: CardWorkerDependencies = {},
): Promise<GenerationResult | null> {
  if (!dependencies.skipUploadAccess) await ensureUploadAccess(config);

  return withStore(async (store, resolvedConfig) => {
    await store.ensureIndexes();

    const sourceIdentity = resolvedConfig.sourceIdentity ?? undefined;
    const cuki = await store.claimNextCuki(sourceIdentity);

    if (!cuki) {
      return null;
    }

    try {
      const result = await (dependencies.renderAndUpload ?? renderAndUpload)(store, cuki, resolvedConfig, sourceIdentity);
      await store.markGenerated(cuki, result);
      return result;
    } catch (error) {
      try {
        await store.markFailed(cuki, error);
      } catch (fencingError) {
        console.error(fencingError instanceof Error ? fencingError.message : fencingError);
      }
      throw error;
    }
  }, config, dependencies);
}

type BackfillManifestItem = {
  documentId: string | number;
  documentKey?: string;
  tokenId: string;
  assetIdentity: string;
  legacyDocumentId: string | number;
  legacyTokenId: string;
  network?: string;
  chain?: string;
  chainId?: number;
  collectionAddressNormalized?: string;
  previousImageHost: string | null;
  previousImageUrl: string | null;
  previousImageSha256: string | null;
  sourceRevision: string | null;
  sourceFingerprint?: string;
  censusCategory: BackfillCensusCategory;
  status?: BackfillCensusCategory;
  sourceValidationError?: string;
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

export function classifyCukiMetadata(cuki: CukiDocument): Extract<BackfillCensusCategory, 'renderable' | 'missing_metadata' | 'unsupported_metadata'> {
  const metadata = resolveCukiMetadata(cuki);
  if (metadata.status === 'missing') return 'missing_metadata';
  if (metadata.status === 'invalid') return 'unsupported_metadata';
  return 'renderable';
}

function documentIdentityKey(value: unknown) {
  if (typeof value === 'string') return `string:${value}`;
  if (typeof value === 'number') return `number:${String(value)}`;
  if (value && typeof value === 'object' && 'toHexString' in value && typeof value.toHexString === 'function') {
    return `objectId:${value.toHexString()}`;
  }
  return `object:${JSON.stringify(value)}`;
}

function manifestDocumentKey(item: Pick<BackfillManifestItem, 'documentId' | 'documentKey'>) {
  return item.documentKey ?? documentIdentityKey(item.documentId);
}

function legacyManifestAlias(item: Pick<BackfillManifestItem, 'documentId' | 'documentKey'>) {
  if (item.documentKey || typeof item.documentId !== 'string' || !/^[0-9a-f]{24}$/i.test(item.documentId)) {
    return null;
  }
  // Old manifests serialized an ObjectId as its hex string before documentKey existed.
  return `objectId:${item.documentId.toLowerCase()}`;
}

function manifestItem(cuki: CukiDocument, identity?: AssetIdentityContext): BackfillManifestItem {
  const tokenId = cuki.tokenId ?? '';
  const assetIdentity = canonicalAssetIdentity(cuki, identity);
  const sourceValidationError = cuki.sourceValidationError
    ?? (assetIdentity ? undefined : 'No se pudo resolver la identidad canónica del documento.');
  const censusCategory = assetIdentity && !sourceValidationError ? classifyCukiMetadata(cuki) : 'missing_identity';
  return {
    documentId: cuki._id,
    documentKey: documentIdentityKey(cuki._id),
    tokenId,
    assetIdentity: assetIdentity ?? '',
    legacyDocumentId: cuki._id,
    legacyTokenId: tokenId,
    network: cuki.network,
    chain: cuki.chain,
    chainId: cuki.chainId,
    collectionAddressNormalized: cuki.collectionAddressNormalized,
    previousImageHost: imageHost(cuki.img),
    previousImageUrl: typeof cuki.img === 'string' && cuki.img.trim() ? cuki.img : null,
    previousImageSha256: typeof cuki.img === 'string' ? cardContentSha256FromUrl(cuki.img) : null,
    sourceRevision: cuki.updatedAt?.toISOString() ?? null,
    sourceFingerprint: cukiInputFingerprint(cuki, identity),
    censusCategory,
    ...(sourceValidationError ? { sourceValidationError } : {}),
    ...(censusCategory === 'renderable' ? {} : { status: censusCategory }),
  };
}

async function processBackfillToken(
  store: CardWorkerStoreLike,
  candidate: BackfillManifestItem,
  config: CardWorkerConfig,
  identity: AssetIdentityContext | undefined,
  upload: CardWorkerDependencies['renderAndUpload'] = renderAndUpload,
) {
  if (candidate.censusCategory !== 'renderable') return { status: candidate.censusCategory } as const;

  const existing = await store.getCuki(candidate.documentId);
  if (!existing) return { status: 'missing' as const };

  const currentIdentity = canonicalAssetIdentity(existing, identity);
  if (!currentIdentity) return { status: 'missing_identity' as const };
  const currentMetadata = classifyCukiMetadata(existing);
  if (currentMetadata !== 'renderable') return { status: currentMetadata };

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
    const claimed = await store.claimCukiByDocumentId(candidate.documentId, identity);
    if (!claimed) return { status: 'locked_or_exhausted' as const };

    try {
      const result = await upload(store, claimed, config, identity);
      await store.markGenerated(claimed, result);
      return { status: 'generated' as const, result };
    } catch (error) {
      try {
        await store.markFailed(claimed, error);
      } catch {
        return { status: 'locked_or_exhausted' as const };
      }
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

export async function backfillCards(
  config = getCardWorkerConfig(),
  dependencies: CardWorkerDependencies = {},
) {
  if (!dependencies.skipUploadAccess) await ensureUploadAccess(config);

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
        initialItems: candidates.map((cuki) => manifestItem(cuki, resolvedConfig.sourceIdentity ?? undefined)),
        deltaItems: [],
      };
    } else {
      manifest.status = 'in_progress';
    }

    let checkpoint = Promise.resolve();
    let checkpointError: Error | null = null;
    const saveManifest = async () => {
      checkpoint = checkpoint.then(async () => {
        const temporaryPath = `${manifestPath}.${manifest!.runId}.tmp`;
        const content = `${JSON.stringify(manifest, null, 2)}\n`;
        if (dependencies.writeCheckpoint) {
          await dependencies.writeCheckpoint(manifestPath, content, manifest!.runId);
        } else {
          await fs.writeFile(temporaryPath, content, 'utf8');
          await fs.rename(temporaryPath, manifestPath);
        }
      });
      await checkpoint;
    };
    await saveManifest();

    let cursor = 0;
    const candidates = [...manifest.initialItems, ...manifest.deltaItems];
    async function worker() {
      while (true) {
        const index = cursor;
        cursor += 1;
        const candidate = candidates[index];
        if (!candidate) return;
        if (!backfillItemNeedsResume(candidate)) {
          continue;
        }
        try {
          const result = await processBackfillToken(store, candidate, resolvedConfig, resolvedConfig.sourceIdentity ?? undefined, dependencies.renderAndUpload);
          candidate.status = result.status;
          candidate.lastError = 'error' in result ? result.error : undefined;
        } catch (error) {
          candidate.status = 'failed';
          candidate.lastError = error instanceof Error ? error.message : String(error);
        } finally {
          candidate.checkedAt = new Date().toISOString();
          try {
            await saveManifest();
          } catch (error) {
            checkpointError ??= error instanceof Error ? error : new Error(String(error));
          }
        }
      }
    }

    await Promise.allSettled(
      Array.from(
        { length: Math.min(resolvedConfig.backfillConcurrency, Math.max(1, candidates.length)) },
        () => worker(),
      ),
    );

    if (checkpointError) {
      const checkpointMessage = String(checkpointError);
      throw new Error(`No se pudo guardar el checkpoint del backfill; se conserva el último checkpoint válido: ${checkpointMessage}`);
    }

    const current = await store.listBackfillCukies();
    const knownDeltaIds = new Set(
      manifest.deltaItems.map((item) => `${manifestDocumentKey(item)}:${item.sourceFingerprint ?? item.sourceRevision ?? 'none'}`),
    );
    const initialByDocumentId = new Map(manifest.initialItems.map((item) => [manifestDocumentKey(item), item]));
    const legacyInitialAliases = new Map(
      manifest.initialItems.flatMap((item) => {
        const alias = legacyManifestAlias(item);
        return alias ? [[alias, item] as const] : [];
      }),
    );
    for (const cuki of current) {
      const changedAfterCutoff = cuki.updatedAt && cuki.updatedAt > new Date(manifest.cutoffAt);
      const item = manifestItem(cuki, resolvedConfig.sourceIdentity ?? undefined);
      const currentDocumentKey = documentIdentityKey(cuki._id);
      const baseline = initialByDocumentId.get(currentDocumentKey)
        ?? legacyInitialAliases.get(currentDocumentKey);
      const sourceChanged = baseline
        ? baseline.sourceFingerprint
          ? baseline.sourceFingerprint !== item.sourceFingerprint
          : Boolean(changedAfterCutoff)
        : true;
      if ((!baseline || sourceChanged) && !knownDeltaIds.has(`${currentDocumentKey}:${item.sourceFingerprint ?? item.sourceRevision ?? 'none'}`)) {
        const key = `${currentDocumentKey}:${item.sourceFingerprint ?? item.sourceRevision ?? 'none'}`;
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
  }, config, dependencies);
}

export async function runCardWorker(config = getCardWorkerConfig(), dependencies: CardWorkerDependencies = {}) {
  if (!dependencies.skipUploadAccess) await ensureUploadAccess(config);

  let stopped = false;
  const stop = () => {
    stopped = true;
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopped) {
    let result: GenerationResult | null = null;
    try {
      result = await processOneCard(config, dependencies);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }

    if (!result) {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }
}
