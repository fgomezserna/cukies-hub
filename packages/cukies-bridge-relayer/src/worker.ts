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

async function withStore<T>(
  config: BridgeRelayerConfig,
  task: (
    store: MongoBridgeRelayerStore,
  ) => Promise<T>,
) {
  const store = await new MongoBridgeRelayerStore(config).connect();
  try {
    return await task(store);
  } finally {
    await store.close();
  }
}

type BridgeRelayerRuntime = Readonly<{
  store: MongoBridgeRelayerStore;
  engine: BridgeRelayerEngine;
  source: TronGridBridgeRequestSource;
}>;

async function createRuntime(config: BridgeRelayerConfig): Promise<BridgeRelayerRuntime> {
  const store = await new MongoBridgeRelayerStore(config).connect();
  try {
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
    return { store, engine, source };
  } catch (error) {
    await store.close();
    throw error;
  }
}

async function withRuntime<T>(
  config: BridgeRelayerConfig,
  task: (runtime: BridgeRelayerRuntime) => Promise<T>,
) {
  const runtime = await createRuntime(config);
  try {
    return await task(runtime);
  } finally {
    await runtime.store.close();
  }
}

async function runBridgeRelayerIteration(
  config: BridgeRelayerConfig,
  runtime: BridgeRelayerRuntime,
) {
  const { store, engine, source } = runtime;
  const startedAt = new Date();
  const cursor = await store.getSourceCursor(config.tronStartTimestampMs);
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
    direction: 'TRON_MAINNET_TO_BSC_MAINNET_LEGACY',
  });
  return {
    inserted,
    fetched: poll.requests.length,
    invalidEvents: poll.invalidEvents.length,
    processing,
  };
}

export async function setupBridgeRelayer(configInput = getBridgeRelayerConfig()) {
  assertEnabled(configInput);
  // Setup only needs Mongo indexes. Creating the Viem/Tron transports here
  // leaves open sockets and can prevent docker-start.sh from reaching `start`.
  return withStore(configInput, async (store) => {
    await store.ensureIndexes();
    return { ok: true, dbName: configInput.dbName, direction: 'TRON_MAINNET_TO_BSC_MAINNET_LEGACY' };
  });
}

export async function runBridgeRelayerOnce(configInput = getBridgeRelayerConfig()) {
  assertEnabled(configInput);
  return withRuntime(configInput, async (runtime) => {
    await runtime.store.ensureIndexes();
    return runBridgeRelayerIteration(configInput, runtime);
  });
}

export async function runBridgeRelayer(configInput = getBridgeRelayerConfig()) {
  assertEnabled(configInput);
  const runtime = await createRuntime(configInput);
  let stopped = false;
  const stop = () => { stopped = true; };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  try {
    await runtime.store.ensureIndexes();
    while (!stopped) {
      try {
        await runBridgeRelayerIteration(configInput, runtime);
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[cukies-bridge-relayer] ${text}\n`);
      }
      if (!stopped) {
        await new Promise((resolve) => setTimeout(resolve, configInput.pollIntervalMs));
      }
    }
  } finally {
    await runtime.store.close();
  }
}
