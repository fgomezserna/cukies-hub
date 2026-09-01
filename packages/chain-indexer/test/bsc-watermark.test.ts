import assert from 'node:assert/strict';
import test from 'node:test';
import { keccak256 } from 'viem';

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
    bscExpectedChainId: 56,
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
    verifiedBscContracts: {},
    ...overrides,
  };
}

function fakeStore(
  cursor: Partial<ChainCursor> | null = null,
  options: { failCursorUpdate?: boolean } = {},
) {
  const updates: Array<{
    config: ContractEventConfig;
    update: Partial<ChainCursor>;
  }> = [];
  const eventBatches: unknown[][] = [];
  const checkpoints: unknown[] = [];
  const stakingBootstraps: unknown[] = [];
  const operations: string[] = [];
  const store = {
    getCursor: async () => cursor,
    updateCursor: async (
      contractEvent: ContractEventConfig,
      update: Partial<ChainCursor>,
    ) => {
      operations.push(`cursor:${contractEvent.contractAlias}:${contractEvent.eventName}`);
      if (options.failCursorUpdate) throw new Error('cursor update failed');
      updates.push({ config: contractEvent, update });
    },
    upsertEvents: async (events: unknown[]) => {
      eventBatches.push(events);
      return { inserted: events.length };
    },
    upsertBscCheckpoint: async (input: unknown) => {
      operations.push('checkpoint');
      checkpoints.push(input);
    },
    reconcileVerifiedUkiStakingBootstrap: async (input: unknown) => {
      operations.push('staking-bootstrap');
      stakingBootstraps.push(input);
    },
  } as unknown as IndexerStore;

  return { store, updates, eventBatches, checkpoints, stakingBootstraps, operations };
}

function rpc(input: {
  host: string;
  latestBlock?: bigint;
  logs?: unknown[];
  onGetBlock?: (blockNumber: bigint) => Promise<{ hash: `0x${string}`; timestamp: bigint }>;
  blockCalls?: bigint[];
  logCalls?: Array<{ fromBlock: bigint; toBlock: bigint }>;
  chainId?: number;
  bytecode?: `0x${string}`;
  receipt?: {
    contractAddress: `0x${string}`;
    blockNumber: bigint;
    status: 'success' | 'reverted';
  };
}) {
  return {
    url: `https://${input.host}`,
    host: input.host,
    client: {
      getChainId: async () => input.chainId ?? 56,
      getBlockNumber: async () => input.latestBlock ?? BigInt(120),
      getLogs: async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
        input.logCalls?.push({ fromBlock, toBlock });
        return input.logs ?? [];
      },
      getBlock: async ({ blockNumber }: { blockNumber: bigint }) => {
        input.blockCalls?.push(blockNumber);
        if (input.onGetBlock) return input.onGetBlock(blockNumber);
        return {
          hash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
          timestamp: blockNumber * BigInt(10),
        };
      },
      getBytecode: async () => input.bytecode ?? '0x',
      getTransactionReceipt: async () => input.receipt ?? {
        contractAddress: null,
        blockNumber: BigInt(0),
        status: 'reverted',
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
    onGetBlock: async (blockNumber) => ({
      hash: `0x${blockNumber.toString(16).padStart(64, '0')}`,
      timestamp: blockNumber * BigInt(10),
    }),
  });
  const { store, updates } = fakeStore();

  const result = await ingestBscOnce(store, config(), {
    rpcClients: [primary, secondary],
  });

  assert.deepEqual(logCalls, [{ fromBlock: BigInt(100), toBlock: BigInt(104) }]);
  assert.deepEqual(primaryBlockCalls, [BigInt(110), BigInt(100), BigInt(104)]);
  assert.deepEqual(secondaryBlockCalls, [BigInt(110), BigInt(100), BigInt(104)]);
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

  assert.deepEqual(blockCalls, [BigInt(110), BigInt(100), BigInt(104)]);
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
  const { store, updates, eventBatches, checkpoints, operations } = fakeStore({ nextBlock: 111 });

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
  assert.equal(checkpoints.length, 1);
  assert.equal(operations.at(-1), 'checkpoint');
});

test('keeps the completed checkpoint unchanged while any cursor is still backlogged', async () => {
  const client = rpc({ host: 'primary.test' });
  const { store, checkpoints } = fakeStore();

  await ingestBscOnce(store, config(), { rpcClients: [client] });

  assert.deepEqual(checkpoints, []);
});

test('does not publish a checkpoint when cursor persistence fails', async () => {
  const client = rpc({ host: 'primary.test' });
  const { store, checkpoints } = fakeStore({ nextBlock: 111 }, { failCursorUpdate: true });

  await assert.rejects(
    ingestBscOnce(store, config(), { rpcClients: [client] }),
    /cursor update failed/,
  );
  assert.deepEqual(checkpoints, []);
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

test('skips an RPC from a different chain before reading blocks', async () => {
  const mainnetBlockCalls: bigint[] = [];
  const testnetBlockCalls: bigint[] = [];
  const mainnet = rpc({
    host: 'mainnet.test',
    chainId: 56,
    blockCalls: mainnetBlockCalls,
  });
  const testnet = rpc({
    host: 'testnet.test',
    chainId: 97,
    blockCalls: testnetBlockCalls,
  });
  const { store } = fakeStore({ nextBlock: 111 });

  const result = await ingestBscOnce(
    store,
    config({ bscExpectedChainId: 97 }),
    { rpcClients: [mainnet, testnet] },
  );

  assert.deepEqual(mainnetBlockCalls, []);
  assert.deepEqual(testnetBlockCalls, [BigInt(110)]);
  assert.equal(result.latestBlockRpcHost, 'testnet.test');
});

test('uses the deployment block configured for each UKI economy contract', async () => {
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({ host: 'primary.test', logCalls });
  const { store, updates } = fakeStore();

  await ingestBscOnce(store, config({
    contractAliases: ['UKI_STAKING'],
    ukiStakingAddress: `0x${'3'.repeat(40)}`,
    ukiStakingStartBlock: 105,
  }), { rpcClients: [client] });

  assert.deepEqual(logCalls, [
    { fromBlock: 105n, toBlock: 109n },
    { fromBlock: 105n, toBlock: 109n },
  ]);
  assert.deepEqual(updates.map(({ update }) => update.processedFromBlock), [105, 105]);
});

test('uses and seals the independent TOKEN_V2 deployment identity', async () => {
  const address = `0x${'7'.repeat(40)}` as const;
  const bytecode = '0x60016000' as const;
  const deploymentTxHash = `0x${'8'.repeat(64)}`;
  const identity = {
    alias: 'TOKEN_V2' as const,
    chainId: 97 as const,
    address,
    startBlock: 106,
    deploymentBlock: 106,
    deploymentTxHash,
    runtimeCodeHash: keccak256(bytecode),
    configHash: `0x${'9'.repeat(64)}`,
  };
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode,
    receipt: { contractAddress: address, blockNumber: 106n, status: 'success' },
    logCalls,
  });
  const { store, updates } = fakeStore();

  await ingestBscOnce(store, config({
    bscExpectedChainId: 97,
    contractAliases: ['TOKEN_V2'],
    tokenV2Address: address,
    tokenV2StartBlock: 106,
    verifiedBscContracts: { TOKEN_V2: identity },
  }), { rpcClients: [client] });

  assert.deepEqual(logCalls, [
    { fromBlock: 106n, toBlock: 110n },
    { fromBlock: 106n, toBlock: 110n },
  ]);
  assert.deepEqual(updates.map(({ config: eventConfig, update }) => ({
    alias: eventConfig.contractAlias,
    start: update.processedFromBlock,
    txHash: update.contractDeploymentTxHash,
  })), [
    { alias: 'TOKEN_V2', start: 106, txHash: deploymentTxHash },
    { alias: 'TOKEN_V2', start: 106, txHash: deploymentTxHash },
  ]);
});

test('verifies UKI contract receipt and runtime before sealing cursor identity', async () => {
  const address = `0x${'3'.repeat(40)}` as const;
  const deploymentTxHash = `0x${'4'.repeat(64)}`;
  const bytecode = '0x60006000' as const;
  const identity = {
    alias: 'UKI_STAKING' as const,
    chainId: 97 as const,
    address,
    startBlock: 105,
    deploymentBlock: 105,
    deploymentTxHash,
    runtimeCodeHash: keccak256(bytecode),
    configHash: `0x${'5'.repeat(64)}`,
  };
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode,
    receipt: { contractAddress: address, blockNumber: 105n, status: 'success' },
  });
  const { store, updates, stakingBootstraps, checkpoints, operations } = fakeStore();

  await ingestBscOnce(store, config({
    bscExpectedChainId: 97,
    contractAliases: ['UKI_STAKING'],
    ukiStakingAddress: address,
    ukiStakingStartBlock: 105,
    maxBlockRange: 10,
    verifiedBscContracts: { UKI_STAKING: identity },
  }), { rpcClients: [client] });

  assert.equal(updates.length, 2);
  for (const { update } of updates) {
    assert.equal(update.bootstrapStatus, 'verified');
    assert.equal(update.verifiedChainId, 97);
    assert.equal(update.contractCodeHash, identity.runtimeCodeHash);
    assert.equal(update.contractDeploymentBlock, 105);
    assert.equal(update.contractDeploymentTxHash, deploymentTxHash);
  }
  assert.equal(stakingBootstraps.length, 1);
  assert.equal(checkpoints.length, 1);
  assert.deepEqual(operations.slice(-2), ['staking-bootstrap', 'checkpoint']);
});

test('rejects a UKI contract when its live runtime hash differs from the pinned identity', async () => {
  const address = `0x${'3'.repeat(40)}` as const;
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode: '0x60006000',
    receipt: { contractAddress: address, blockNumber: 105n, status: 'success' },
  });
  const { store, updates, stakingBootstraps } = fakeStore();

  await assert.rejects(
    ingestBscOnce(store, config({
      bscExpectedChainId: 97,
      contractAliases: ['UKI_STAKING'],
      ukiStakingAddress: address,
      ukiStakingStartBlock: 105,
      verifiedBscContracts: {
        UKI_STAKING: {
          alias: 'UKI_STAKING',
          chainId: 97,
          address,
          startBlock: 105,
          deploymentBlock: 105,
          deploymentTxHash: `0x${'4'.repeat(64)}`,
          runtimeCodeHash: `0x${'f'.repeat(64)}`,
          configHash: `0x${'5'.repeat(64)}`,
        },
      },
    }), { rpcClients: [client] }),
    /runtimeCodeHash/,
  );
  assert.deepEqual(updates, []);
  assert.deepEqual(stakingBootstraps, []);
});

test('rejects a UKI contract when the deployment receipt points to another address', async () => {
  const address = `0x${'3'.repeat(40)}` as const;
  const bytecode = '0x60006000' as const;
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode,
    receipt: {
      contractAddress: `0x${'9'.repeat(40)}`,
      blockNumber: 105n,
      status: 'success',
    },
  });
  const { store, updates } = fakeStore();

  await assert.rejects(
    ingestBscOnce(store, config({
      bscExpectedChainId: 97,
      contractAliases: ['UKI_STAKING'],
      ukiStakingAddress: address,
      ukiStakingStartBlock: 105,
      verifiedBscContracts: {
        UKI_STAKING: {
          alias: 'UKI_STAKING',
          chainId: 97,
          address,
          startBlock: 105,
          deploymentBlock: 105,
          deploymentTxHash: `0x${'4'.repeat(64)}`,
          runtimeCodeHash: keccak256(bytecode),
          configHash: `0x${'5'.repeat(64)}`,
        },
      },
    }), { rpcClients: [client] }),
    /receipt de despliegue/,
  );
  assert.deepEqual(updates, []);
});

test('does not seal an existing UKI cursor whose coverage starts after deployment', async () => {
  const address = `0x${'3'.repeat(40)}` as const;
  const bytecode = '0x60006000' as const;
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode,
    receipt: { contractAddress: address, blockNumber: 105n, status: 'success' },
  });
  const { store, updates } = fakeStore({
    nextBlock: 111,
    processedFromBlock: 106,
    processedFromTimestampMs: 1_060_000,
  });

  await assert.rejects(
    ingestBscOnce(store, config({
      bscExpectedChainId: 97,
      contractAliases: ['UKI_STAKING'],
      ukiStakingAddress: address,
      ukiStakingStartBlock: 105,
      verifiedBscContracts: {
        UKI_STAKING: {
          alias: 'UKI_STAKING',
          chainId: 97,
          address,
          startBlock: 105,
          deploymentBlock: 105,
          deploymentTxHash: `0x${'4'.repeat(64)}`,
          runtimeCodeHash: keccak256(bytecode),
          configHash: `0x${'5'.repeat(64)}`,
        },
      },
    }), { rpcClients: [client] }),
    /no demuestra cobertura desde el bloque de despliegue/,
  );
  assert.deepEqual(updates, []);
});

test('rejects config drift in an already sealed cursor before reading new logs', async () => {
  const address = `0x${'3'.repeat(40)}` as const;
  const deploymentTxHash = `0x${'4'.repeat(64)}`;
  const bytecode = '0x60006000' as const;
  const identity = {
    alias: 'UKI_STAKING' as const,
    chainId: 97 as const,
    address,
    startBlock: 105,
    deploymentBlock: 105,
    deploymentTxHash,
    runtimeCodeHash: keccak256(bytecode),
    configHash: `0x${'5'.repeat(64)}`,
  };
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode,
    receipt: { contractAddress: address, blockNumber: 105n, status: 'success' },
    logCalls,
  });
  const { store, updates } = fakeStore({
    contractAddress: address,
    nextBlock: 111,
    processedFromBlock: 105,
    processedFromTimestampMs: 1_050_000,
    bootstrapStatus: 'verified',
    bootstrapStartBlock: 105,
    bootstrapVerifiedAt: new Date('2026-08-27T00:00:00.000Z'),
    verifiedChainId: 97,
    contractCodeHash: identity.runtimeCodeHash,
    contractDeploymentBlock: 105,
    contractDeploymentTxHash: deploymentTxHash,
    contractConfigHash: `0x${'f'.repeat(64)}`,
  });

  await assert.rejects(
    ingestBscOnce(store, config({
      bscExpectedChainId: 97,
      contractAliases: ['UKI_STAKING'],
      ukiStakingAddress: address,
      ukiStakingStartBlock: 105,
      verifiedBscContracts: { UKI_STAKING: identity },
    }), { rpcClients: [client] }),
    /Config drift en bootstrap UKI_STAKING:Staked/,
  );

  assert.deepEqual(logCalls, []);
  assert.deepEqual(updates, []);
});
