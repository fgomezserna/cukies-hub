import { ViemBscBridgeDestination } from './bsc-destination.js';
import {
  getBridgeRelayerConfig,
  type BridgeRelayerConfig,
} from './config.js';
import { BridgeRelayerEngine } from './engine.js';
import { MongoBridgeRelayerStore } from './store.js';
import { TronGridBridgeRequestSource } from './tron-source.js';

function assertEnabled(
  config: ReturnType<typeof getBridgeRelayerConfig>,
): asserts config is BridgeRelayerConfig {
  if (!config.enabled) {
    throw new Error('CUKIES_BRIDGE_RELAYER_ENABLED no esta activado.');
  }
}

async function withRuntime<T>(
  config: BridgeRelayerConfig,
  task: (
    store: MongoBridgeRelayerStore,
    engine: BridgeRelayerEngine,
    source: TronGridBridgeRequestSource,
  ) => Promise<T>,
) {
  const store = await new MongoBridgeRelayerStore(config).connect();
  const source = new TronGridBridgeRequestSource(config);
  const destination = new ViemBscBridgeDestination(config);
  const engine = new BridgeRelayerEngine(store, store, destination, {
    workerId: config.workerId,
    leaseMs: config.leaseMs,
    retryBaseMs: config.retryBaseMs,
    retryMaxMs: config.retryMaxMs,
    maxAttempts: config.maxAttempts,
    submittedTimeoutMs: config.submittedTimeoutMs,
  });
  try {
    return await task(store, engine, source);
  } finally {
    await store.close();
  }
}

export async function setupBridgeRelayer(configInput = getBridgeRelayerConfig()) {
  assertEnabled(configInput);
  return withRuntime(configInput, async (store) => {
    await store.ensureIndexes();
    return { ok: true, dbName: configInput.dbName, direction: 'TRON_NILE_TO_BSC_TESTNET' };
  });
}

export async function runBridgeRelayerOnce(configInput = getBridgeRelayerConfig()) {
  assertEnabled(configInput);
  return withRuntime(configInput, async (store, engine, source) => {
    await store.ensureIndexes();
    const startedAt = new Date();
    const cursor = await store.getSourceCursor(configInput.tronStartTimestampMs);
    const poll = await source.poll(cursor);
    const inserted = await store.upsertRequests(poll.requests, startedAt);
    await store.recordSourceDeadLetters(poll.invalidEvents, new Date());
    await store.updateSourceCursor(poll.nextCursor, new Date());
    const processing = await engine.processNext(new Date());
    await store.db.collection('cukies_bridge_relayer_runs').insertOne({
      startedAt,
      finishedAt: new Date(),
      inserted,
      fetched: poll.requests.length,
      invalidEvents: poll.invalidEvents.length,
      processing,
      sourceCursor: poll.nextCursor,
      direction: 'TRON_NILE_TO_BSC_TESTNET',
    });
    return {
      inserted,
      fetched: poll.requests.length,
      invalidEvents: poll.invalidEvents.length,
      processing,
    };
  });
}

export async function runBridgeRelayer(configInput = getBridgeRelayerConfig()) {
  assertEnabled(configInput);
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopped) {
    try {
      await runBridgeRelayerOnce(configInput);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[cukies-bridge-relayer] ${text}\n`);
    }
    if (!stopped) {
      await new Promise((resolve) => setTimeout(resolve, configInput.pollIntervalMs));
    }
  }
}
