import { ingestBscOnce, ingestTronOnce } from './chains/index.js';
import { getIndexerConfig, getLegacyImportConfig } from './config/env.js';
import { importLegacyCukiesMetadata, importLegacyProcessedEvents } from './legacy/importer.js';
import { projectOnce } from './projectors/index.js';
import { IndexerStore } from './storage/index.js';
import { now } from './utils/json.js';

function log(message: string, context?: Record<string, unknown>) {
  const suffix = context ? ` ${JSON.stringify(context)}` : '';
  console.log(`[chain-indexer] ${message}${suffix}`);
}

async function withStore<T>(callback: (store: IndexerStore) => Promise<T>) {
  const config = getIndexerConfig();
  const store = await new IndexerStore(config).connect();

  try {
    return await callback(store);
  } finally {
    await store.close();
  }
}

async function setup() {
  await withStore(async (store) => {
    await store.ensureIndexes();
    log('setup ok');
  });
}

async function ingestOnce() {
  const config = getIndexerConfig();
  const store = await new IndexerStore(config).connect();
  const startedAt = now();

  try {
    await store.ensureIndexes();
    const bsc = await ingestBscOnce(store, config);
    const tron = await ingestTronOnce(store, config);
    const endedAt = now();

    await store.recordRun({
      type: 'ingest-once',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      bsc,
      tron,
    });

    log('ingest once ok', { bsc, tron });
    return { bsc, tron };
  } finally {
    await store.close();
  }
}

async function projectOneBatch() {
  const config = getIndexerConfig();
  const store = await new IndexerStore(config).connect();
  const startedAt = now();

  try {
    await store.ensureIndexes();
    const result = await projectOnce(store, config.projectBatchSize);
    const endedAt = now();

    await store.recordRun({
      type: 'project-once',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      ...result,
    });

    log('project once ok', result);
    return result;
  } finally {
    await store.close();
  }
}

async function importLegacy() {
  const config = getIndexerConfig();
  const legacyConfig = getLegacyImportConfig();
  const store = await new IndexerStore(config).connect();
  const startedAt = now();

  try {
    await store.ensureIndexes();
    const result = await importLegacyProcessedEvents(
      store,
      legacyConfig.legacyMongoUrl,
      legacyConfig.limit,
      legacyConfig.networks,
    );
    const endedAt = now();

    await store.recordRun({
      type: 'import-legacy',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      ...result,
    });

    log('import legacy ok', result);
    return result;
  } finally {
    await store.close();
  }
}

async function importLegacyMetadata() {
  const config = getIndexerConfig();
  const legacyConfig = getLegacyImportConfig();
  const store = await new IndexerStore(config).connect();
  const startedAt = now();

  try {
    await store.ensureIndexes();
    const result = await importLegacyCukiesMetadata(
      store,
      legacyConfig.legacyMongoUrl,
      legacyConfig.limit,
    );
    const endedAt = now();

    await store.recordRun({
      type: 'import-legacy-metadata',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      ...result,
    });

    log('import legacy metadata ok', result);
    return result;
  } finally {
    await store.close();
  }
}

async function status() {
  await withStore(async (store) => {
    const summary = await store.summary();
    log('status', summary);
  });
}

async function runForever() {
  const config = getIndexerConfig();
  const store = await new IndexerStore(config).connect();

  log('run started', {
    dbName: config.dbName,
    chains: config.chains,
    pollIntervalMs: config.pollIntervalMs,
  });

  const shutdown = async () => {
    log('shutdown');
    await store.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await store.ensureIndexes();

  while (true) {
    const startedAt = now();

    try {
      const bsc = await ingestBscOnce(store, config);
      const tron = await ingestTronOnce(store, config);
      const projected = await projectOnce(store, config.projectBatchSize);
      const endedAt = now();

      await store.recordRun({
        type: 'loop',
        startedAt,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime(),
        bsc,
        tron,
        projected,
      });

      log('loop ok', { bsc, tron, projected });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log('loop error', { error: message });

      await store.recordRun({
        type: 'loop-error',
        startedAt,
        endedAt: now(),
        error: message,
      });
    }

    await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
  }
}

const command = process.argv[2] ?? 'status';

if (command === 'setup') {
  await setup();
} else if (command === 'ingest-once') {
  await ingestOnce();
} else if (command === 'import-legacy') {
  await importLegacy();
} else if (command === 'import-legacy-metadata') {
  await importLegacyMetadata();
} else if (command === 'project-once') {
  await projectOneBatch();
} else if (command === 'run') {
  await runForever();
} else if (command === 'status') {
  await status();
} else {
  console.error(`Comando no reconocido: ${command}`);
  process.exit(1);
}
