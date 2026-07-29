import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestBscOnce } from '../src/chains/bsc.js';
import type { IndexerStore } from '../src/storage/index.js';
import type { ChainCursor, ContractEventConfig, IndexerConfig } from '../src/types.js';

const PRESALE_ADDRESS = `0x${'1'.repeat(40)}`;
const PLAYER = `0x${'2'.repeat(40)}`;

function config(overrides: Partial<IndexerConfig> = {}): IndexerConfig {
  return {
    mongoUrl: 'mongodb://unused',
    dbName: 'test',
    chains: ['BSC'],
    bscRpcUrl: 'https://primary.test',
    bscRpcUrls: ['https://primary.test', 'https://secondary.test'],
    tronApiBaseUrl: 'https://tron.test',
    bscStartBlock: 100,
    tronStartTimestampMs: 0,
    bscConfirmations: 10,
    maxBlockRange: 5,
    tronPageLimit: 100,
    tronRequestDelayMs: 0,
    pollIntervalMs: 1_000,
    projectBatchSize: 100,
    presaleAddress: PRESALE_ADDRESS,
    contractAliases: ['PRESALE'],
    ...overrides,
  };
}

function fakeStore(cursor: Partial<ChainCursor> | null = null) {
  const updates: Array<{
    config: ContractEventConfig;
    update: Partial<ChainCursor>;
  }> = [];
  const eventBatches: unknown[][] = [];
  const store = {
    getCursor: async () => cursor,
    updateCursor: async (
      contractEvent: ContractEventConfig,
      update: Partial<ChainCursor>,
    ) => {
      updates.push({ config: contractEvent, update });
    },
    upsertEvents: async (events: unknown[]) => {
      eventBatches.push(events);
      return { inserted: events.length };
    },
  } as unknown as IndexerStore;

  return { store, updates, eventBatches };
}

function rpc(input: {
  host: string;
  latestBlock?: bigint;
  logs?: unknown[];
  onGetBlock?: (blockNumber: bigint) => Promise<{ timestamp: bigint }>;
  blockCalls?: bigint[];
  logCalls?: Array<{ fromBlock: bigint; toBlock: bigint }>;
}) {
  return {
    url: `https://${input.host}`,
    host: input.host,
    client: {
      getBlockNumber: async () => input.latestBlock ?? BigInt(120),
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        input.logCalls?.push({ fromBlock, toBlock });
        return input.logs ?? [];
      },
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
        input.blockCalls?.push(blockNumber);
        if (input.onGetBlock) return input.onGetBlock(blockNumber);
        return { timestamp: blockNumber * BigInt(10) };
      },
    },
  };
}

test('watermark follows the last traversed range block and falls back for its timestamp', async () => {
  const primaryBlockCalls: bigint[] = [];
  const secondaryBlockCalls: bigint[] = [];
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const primary = rpc({
    host: 'primary.test',
    blockCalls: primaryBlockCalls,
    logCalls,
    onGetBlock: async () => {
      throw new Error('primary block lookup unavailable');
    },
  });
  const secondary = rpc({
    host: 'secondary.test',
    blockCalls: secondaryBlockCalls,
    onGetBlock: async (blockNumber) => ({ timestamp: blockNumber * BigInt(10) }),
  });
  const { store, updates } = fakeStore();

  const result = await ingestBscOnce(store, config(), {
    rpcClients: [primary, secondary],
  });

  assert.deepEqual(logCalls, [{ fromBlock: BigInt(100), toBlock: BigInt(104) }]);
  assert.deepEqual(primaryBlockCalls, [BigInt(100), BigInt(104)]);
  assert.deepEqual(secondaryBlockCalls, [BigInt(100), BigInt(104)]);
  assert.equal(result.safeBlock, 110);
  assert.equal(result.ranges, 1);
  assert.deepEqual(updates.map(({ update }) => update), [{
    nextBlock: 105,
    safeBlock: 110,
    processedFromBlock: 100,
    processedFromTimestampMs: 1_000_000,
    processedThroughBlock: 104,
    processedThroughTimestampMs: 1_040_000,
  }]);
});

test('reuses an event block timestamp when the range watermark is the same block', async () => {
  const blockCalls: bigint[] = [];
  const client = rpc({
    host: 'primary.test',
    blockCalls,
    logs: [{
      transactionHash: '0xabc',
      blockHash: '0xdef',
      blockNumber: BigInt(104),
      logIndex: 0,
      args: {
        buyer: PLAYER,
        asmAmount: BigInt(1),
        ukiAmount: BigInt(2),
        totalBuyerAsm: BigInt(1),
        totalBuyerUki: BigInt(2),
      },
    }],
  });
  const { store, updates, eventBatches } = fakeStore();

  await ingestBscOnce(store, config(), { rpcClients: [client] });

  assert.deepEqual(blockCalls, [BigInt(100), BigInt(104)]);
  assert.equal(eventBatches[0]?.length, 1);
  assert.equal((eventBatches[0]?.[0] as { timestampMs: number }).timestampMs, 1_040_000);
  assert.equal(updates[0]?.update.processedFromBlock, 100);
  assert.equal(updates[0]?.update.processedFromTimestampMs, 1_000_000);
  assert.equal(updates[0]?.update.processedThroughTimestampMs, 1_040_000);
});

test('persists a safe-head watermark when the cursor is already caught up', async () => {
  const blockCalls: bigint[] = [];
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({ host: 'primary.test', blockCalls, logCalls });
  const { store, updates, eventBatches } = fakeStore({ nextBlock: 111 });

  const result = await ingestBscOnce(store, config(), { rpcClients: [client] });

  assert.equal(result.ranges, 0);
  assert.deepEqual(logCalls, []);
  assert.deepEqual(blockCalls, [BigInt(110)]);
  assert.deepEqual(eventBatches, []);
  assert.deepEqual(updates.map(({ update }) => update), [{
    nextBlock: 111,
    safeBlock: 110,
    processedThroughBlock: 110,
    processedThroughTimestampMs: 1_100_000,
  }]);
});

test('records safe head as explicit coverage origin for a new start-block zero cursor', async () => {
  const blockCalls: bigint[] = [];
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({ host: 'primary.test', blockCalls, logCalls });
  const { store, updates } = fakeStore();

  await ingestBscOnce(store, config({ bscStartBlock: 0 }), { rpcClients: [client] });

  assert.deepEqual(logCalls, [{ fromBlock: BigInt(110), toBlock: BigInt(110) }]);
  assert.deepEqual(blockCalls, [BigInt(110)]);
  assert.deepEqual(updates.map(({ update }) => update), [{
    nextBlock: 111,
    safeBlock: 110,
    processedFromBlock: 110,
    processedFromTimestampMs: 1_100_000,
    processedThroughBlock: 110,
    processedThroughTimestampMs: 1_100_000,
  }]);
});
