import { ingestBscOnce, ingestTronOnce } from '../chains/index.js';
import type { BscRpcWarning } from '../chains/bsc.js';
import { assertLegacyIndexerEnabled, getLegacyIndexerConfig } from '../config/legacy-env.js';
import { projectOnce } from '../projectors/index.js';
import { LegacyIndexerStore } from './storage/mongo.js';
import { verifyLegacySources } from './verify.js';
import { now } from '../utils/json.js';
import { bootstrapLegacyProjectionSources } from './bootstrap.js';

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

type LegacyBscResult = {
  outcome?: 'complete' | 'incomplete';
  inserted: number;
  ranges: number;
  errors?: Array<{ cursorId: string; error: string; [key: string]: unknown }>;
  failedContractAliases?: string[];
  safeBlock?: number;
  safeBlockHash?: string;
  rpcHosts?: string[];
  latestBlockRpcHost?: string;
  rpcWarnings?: BscRpcWarning[];
  windows?: number;
};
type LegacyTronResult = {
  inserted: number;
  pages: number;
  rateLimited?: boolean;
  errors?: Array<{ cursorId: string; error: string; [key: string]: unknown }>;
};

export function isLegacyCycleIncomplete(
  bsc: LegacyBscResult,
  tron: LegacyTronResult,
) {
  return bsc.outcome === 'incomplete'
    || tron.rateLimited === true
    || (tron.errors?.length ?? 0) > 0;
}

type LegacyIngestDependencies = {
  ingestBsc?: typeof ingestBscOnce;
  ingestTron?: typeof ingestTronOnce;
};

function aggregateBscRuns(runs: LegacyBscResult[]): LegacyBscResult {
  const first = runs[0] ?? { inserted: 0, ranges: 0 };
  const last = runs.at(-1) ?? first;
  return {
    ...first,
    ...last,
    outcome: runs.some((run) => run.outcome === 'incomplete') ? 'incomplete' : 'complete',
    inserted: runs.reduce((sum, run) => sum + run.inserted, 0),
    ranges: runs.reduce((sum, run) => sum + run.ranges, 0),
    errors: runs.flatMap((run) => run.errors ?? []),
    failedContractAliases: [...new Set(runs.flatMap((run) => run.failedContractAliases ?? []))],
    rpcWarnings: runs.flatMap((run) => run.rpcWarnings ?? []),
    windows: runs.length,
  };
}

/**
 * Runs the two legacy readers concurrently and bounds BSC catch-up work per
 * cycle. A slow TronGrid page/429 therefore does not stop BSC from consuming
 * several contiguous windows, while every reader still persists its own
 * cursor only after a successful range/page.
 */
export async function ingestLegacyChainsOnce(
  store: LegacyIndexerStore,
  config: Parameters<typeof ingestBscOnce>[1] & { bscWindowsPerCycle?: number },
  dependencies: LegacyIngestDependencies = {},
) {
  const bscIngest = dependencies.ingestBsc ?? ingestBscOnce;
  const tronIngest = dependencies.ingestTron ?? ingestTronOnce;
  const maxWindows = Math.max(1, Math.min(20, Math.floor(config.bscWindowsPerCycle ?? 1)));

  const bscTask = (async () => {
    const runs: LegacyBscResult[] = [];
    for (let window = 0; window < maxWindows; window += 1) {
      const result = await bscIngest(store, config) as LegacyBscResult;
      runs.push(result);
      if (result.outcome === 'incomplete' || result.ranges === 0) break;
    }
    return aggregateBscRuns(runs);
  })();
  const tronTask = tronIngest(store, config);

  const [bscSettled, tronSettled] = await Promise.allSettled([bscTask, tronTask]);
  const bsc: LegacyBscResult = bscSettled.status === 'fulfilled'
    ? bscSettled.value
    : {
        outcome: 'incomplete',
        inserted: 0,
        ranges: 0,
        errors: [{
          cursorId: 'BSC:cycle',
          chain: 'BSC',
          contractAlias: 'TOKEN',
          eventName: 'Transfer',
          error: safeError(bscSettled.reason),
        }],
        failedContractAliases: config.contractAliases ?? [],
      };
  const tron: LegacyTronResult = tronSettled.status === 'fulfilled'
    ? tronSettled.value
    : {
        inserted: 0,
        pages: 0,
        rateLimited: false,
        errors: [{ cursorId: 'TRON:cycle', error: safeError(tronSettled.reason) }],
      };
  return { bsc, tron };
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

async function bootstrap() {
  await withStore(async (store, config) => {
    assertLegacyIndexerEnabled(config);
    await store.ensureIndexes();
    await verifyLegacySources(config, store);
    const startedAt = now();
    const result = await bootstrapLegacyProjectionSources(store, config);
    const endedAt = now();
    await store.recordRun({
      type: 'legacy-bootstrap',
      runtimeScope: 'legacy',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      ...result,
    });
    log('bootstrap ok', result);
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
        const { bsc, tron } = await ingestLegacyChainsOnce(store, config);
        const projected = await projectOnce(store, config.projectBatchSize);
        const endedAt = now();
        if (isLegacyCycleIncomplete(bsc, tron)) {
          await store.recordRun({
            type: 'legacy-loop-error',
            runtimeScope: 'legacy',
            startedAt,
            endedAt,
            durationMs: endedAt.getTime() - startedAt.getTime(),
            error: [
              ...(bsc.errors ?? []),
              ...(tron.errors ?? []),
            ].map((item) => `${item.cursorId}: ${item.error}`).join(' | '),
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
  if (command === 'bootstrap') return bootstrap();
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
