import type { CardWorkerConfig, GenerationResult, RenderResult } from './types.js';
import { getCardWorkerConfig } from './config/env.js';
import { renderCukiCard } from './renderer.js';
import { assertS3UploadConfig, uploadRenderedCard, verifyS3UploadAccess } from './s3.js';
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
    const cuki = await store.getCuki(tokenId);

    if (!cuki) {
      throw new Error(`No existe el Cuki ${tokenId} en la coleccion cukies.`);
    }

    const renderResult = await renderCukiCard(cuki, resolvedConfig);

    if (!resolvedConfig.upload) {
      const localResult = { ...renderResult, imageUrl: null, s3Key: null };
      await store.recordJob(tokenId, 'rendered_local', localResult);
      return localResult;
    }

    const result = await uploadRenderedCard(resolvedConfig, renderResult);
    await store.markGenerated(tokenId, result);
    return result;
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
      const renderResult = await renderCukiCard(cuki, resolvedConfig);
      const result = await uploadRenderedCard(resolvedConfig, renderResult);
      await store.markGenerated(cuki._id, result);
      return result;
    } catch (error) {
      await store.markFailed(cuki._id, error);
      throw error;
    }
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
