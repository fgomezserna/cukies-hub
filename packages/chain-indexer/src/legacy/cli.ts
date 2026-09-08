import { ingestBscOnce, ingestTronOnce } from '../chains/index.js';
import { assertLegacyIndexerEnabled, getLegacyIndexerConfig } from '../config/legacy-env.js';
import { projectOnce } from '../projectors/index.js';
import { LegacyIndexerStore } from './storage/mongo.js';
import { verifyLegacySources } from './verify.js';
import { now } from '../utils/json.js';

function log(message: string, context?: Record<string, unknown>) {
  console.log(`[legacy-chain-indexer] ${message}${context ? ` ${JSON.stringify(context)}` : ''}`);
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/https?:\/\/[^\s)]+/gi, '[endpoint]')
    .replace(/\b(api[-_]?key|token|secret|private[-_]?key|password)(["']?\s*[:=]\s*["']?)[^"'\s,;)}]+/gi, '$1$2[redacted]')
    .replace(/\b(api[-_]?key|token|secret|private[-_]?key|password)\b\s+[^\s,;)}]+/gi, '$1 [redacted]');
}

async function withStore<T>(callback: (store: LegacyIndexerStore, config: ReturnType<typeof getLegacyIndexerConfig>) => Promise<T>) {
  const config = getLegacyIndexerConfig();
  const store = await new LegacyIndexerStore(config).connect();
  try {
    return await callback(store, config);
  } finally {
    await store.close();
  }
}

async function setup() {
  await withStore(async (store, config) => {
    assertLegacyIndexerEnabled(config);
    await store.ensureIndexes();
    const proofs = await verifyLegacySources(config, store);
    log('setup ok', { dbName: config.dbName, runtimeScope: config.runtimeScope, verifiedSources: proofs.length });
  });
}

async function ingestOnce() {
  await withStore(async (store, config) => {
    assertLegacyIndexerEnabled(config);
    await store.ensureIndexes();
    await verifyLegacySources(config, store);
    const startedAt = now();
    const bsc = await ingestBscOnce(store, config);
    const tron = await ingestTronOnce(store, config);
    const endedAt = now();
    await store.recordRun({ type: 'legacy-ingest-once', runtimeScope: 'legacy', startedAt, endedAt, durationMs: endedAt.getTime() - startedAt.getTime(), bsc, tron });
    log('ingest once ok', { bsc, tron });
  });
}

async function project() {
  await withStore(async (store, config) => {
    assertLegacyIndexerEnabled(config);
    await store.ensureIndexes();
    await verifyLegacySources(config, store);
    const startedAt = now();
    const result = await projectOnce(store, config.projectBatchSize);
    const endedAt = now();
    await store.recordRun({ type: 'legacy-project-once', runtimeScope: 'legacy', startedAt, endedAt, durationMs: endedAt.getTime() - startedAt.getTime(), ...result });
    log('project once ok', result);
  });
}

async function status() {
  await withStore(async (store, config) => {
    log('status', { enabled: config.enabled, dbName: config.dbName, runtimeScope: config.runtimeScope, ...(await store.summary()) });
  });
}

async function runForever() {
  const config = getLegacyIndexerConfig();
  assertLegacyIndexerEnabled(config);
  const store = await new LegacyIndexerStore(config).connect();
  let stopping = false;
  let closed = false;
  const closeStore = async () => {
    if (closed) return;
    closed = true;
    await store.close();
  };
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    log('shutdown');
    await closeStore();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  try {
    await store.ensureIndexes();
    await verifyLegacySources(config, store);
    log('run started', { dbName: config.dbName, chains: config.chains, pollIntervalMs: config.pollIntervalMs });

    while (!stopping) {
      const startedAt = now();
      try {
        const bsc = await ingestBscOnce(store, config);
        const tron = await ingestTronOnce(store, config);
        const projected = await projectOnce(store, config.projectBatchSize);
        const endedAt = now();
        if (bsc.outcome === 'incomplete') {
          await store.recordRun({
            type: 'legacy-loop-error',
            runtimeScope: 'legacy',
            startedAt,
            endedAt,
            durationMs: endedAt.getTime() - startedAt.getTime(),
            error: bsc.errors.map((item) => `${item.cursorId}: ${item.error}`).join(' | '),
            failedContractAliases: bsc.failedContractAliases,
            bsc,
            tron,
            projected,
          });
          log('loop incomplete', { bsc, tron, projected });
        } else {
          await store.recordRun({ type: 'legacy-loop', runtimeScope: 'legacy', startedAt, endedAt, durationMs: endedAt.getTime() - startedAt.getTime(), bsc, tron, projected });
          log('loop ok', { bsc, tron, projected });
        }
      } catch (error) {
        const message = safeError(error);
        await store.recordRun({ type: 'legacy-loop-error', runtimeScope: 'legacy', startedAt, endedAt: now(), error: message });
        log('loop error', { error: message });
      }
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  } finally {
    await closeStore();
  }
}

export async function runLegacyCli(command = process.argv[2] ?? 'status') {
  if (command === 'setup') return setup();
  if (command === 'ingest' || command === 'ingest-once') return ingestOnce();
  if (command === 'project' || command === 'project-once') return project();
  if (command === 'run') return runForever();
  if (command === 'status') return status();
  throw new Error(`Comando legacy no reconocido: ${command}`);
}

if (process.argv[1]?.endsWith('/legacy/cli.ts') || process.argv[1]?.endsWith('/legacy/cli.js')) {
  await runLegacyCli().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
