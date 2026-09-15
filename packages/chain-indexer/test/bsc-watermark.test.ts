import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpRequestError, keccak256 } from 'viem';

import { ingestBscOnce } from '../src/chains/bsc.js';
import type { IndexerStore } from '../src/storage/index.js';
import type { ChainCursor, ContractEventConfig, IndexerConfig } from '../src/types.js';

const PRESALE_ADDRESS = `0x${'1'.repeat(40)}`;
const TOKEN_ADDRESS = '0x0dbDeBCC62f11005BF434ABFad74564E896aC861';
const PLAYER = `0x${'2'.repeat(40)}`;
const PRESALE_EVENT_COUNT = 10;
const UKI_STAKING_EVENT_COUNT = 6;
const POOL_VAULT_EVENT_COUNT = 11;

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
  options: {
    failCursorUpdate?: boolean;
    failEventUpsert?: boolean;
    failCutoffResolution?: boolean;
  } = {},
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
      if (options.failEventUpsert) throw new Error('event upsert failed');
      return { inserted: events.length };
    },
    upsertBscCheckpoint: async (input: unknown) => {
      operations.push('checkpoint');
      checkpoints.push(input);
    },
    listUnresolvedCompetitionCreditCutoffs: async () => {
      if (options.failCutoffResolution) throw new Error('cutoff lookup failed');
      return [];
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
  onGetLogs?: (input: { address: string; fromBlock: bigint; toBlock: bigint }) => Promise<unknown[]> | unknown[];
  onGetBlock?: (blockNumber: bigint) => Promise<{ hash: `0x${string}`; timestamp: bigint }>;
  blockCalls?: bigint[];
  logCalls?: Array<{ fromBlock: bigint; toBlock: bigint }>;
  chainId?: number;
  bytecode?: `0x${string}`;
  poolPeriodDurationSeconds?: bigint;
  contractReadCalls?: Array<{ address: string; functionName: string }>;
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
      getLogs: async ({ address, fromBlock, toBlock }: { address: string; fromBlock: bigint; toBlock: bigint }) => {
        input.logCalls?.push({ fromBlock, toBlock });
        if (input.onGetLogs) return input.onGetLogs({ address, fromBlock, toBlock });
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
      readContract: async ({ address, functionName }: { address: string; functionName: string }) => {
        input.contractReadCalls?.push({ address, functionName });
        if (input.poolPeriodDurationSeconds === undefined) throw new Error('PERIOD_DURATION getter unavailable');
        return input.poolPeriodDurationSeconds;
      },
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

  assert.deepEqual(logCalls, Array.from({ length: PRESALE_EVENT_COUNT }, () => ({
    fromBlock: BigInt(100), toBlock: BigInt(104),
  })));
  assert.deepEqual(primaryBlockCalls, [BigInt(110), BigInt(100), BigInt(104)]);
  assert.deepEqual(secondaryBlockCalls, [BigInt(110), BigInt(100), BigInt(104)]);
  assert.equal(result.safeBlock, 110);
  assert.equal(result.ranges, PRESALE_EVENT_COUNT);
  assert.deepEqual(updates.map(({ update }) => update), Array.from({ length: PRESALE_EVENT_COUNT }, () => ({
    nextBlock: 105,
    safeBlock: 110,
    processedFromBlock: 100,
    processedFromTimestampMs: 1_000_000,
    processedThroughBlock: 104,
    processedThroughTimestampMs: 1_040_000,
  })));
});

test('isolates a historical event failure while an independent contract advances', async () => {
  const presaleAddress = PRESALE_ADDRESS.toLowerCase();
  const stakingAddress = `0x${'3'.repeat(40)}`;
  const client = rpc({
    host: 'primary.test',
    onGetLogs: ({ address }) => {
      if (address.toLowerCase() === presaleAddress) throw new Error('historical logs pruned');
      return [];
    },
  });
  const { store, updates, checkpoints } = fakeStore();

  const result = await ingestBscOnce(store, config({
    contractAliases: ['PRESALE', 'UKI_STAKING'],
    ukiStakingAddress: stakingAddress,
    ukiStakingStartBlock: 100,
  }), { rpcClients: [client] });

  assert.equal(result.outcome, 'incomplete');
  assert.deepEqual(result.failedContractAliases, ['PRESALE']);
  assert.ok(result.errors.some((error) => error.contractAlias === 'PRESALE'));
  assert.ok(updates.some(({ config: item }) => item.contractAlias === 'UKI_STAKING'));
  assert.equal(updates.some(({ config: item }) => item.contractAlias === 'PRESALE'), false);
  assert.deepEqual(checkpoints, []);
});

test('keeps cutoff-resolution failure incomplete without blocking contract ingestion', async () => {
  const client = rpc({ host: 'primary.test' });
  const { store, updates, checkpoints } = fakeStore(null, { failCutoffResolution: true });

  const result = await ingestBscOnce(store, config(), { rpcClients: [client] });

  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /cutoff lookup failed/);
  assert.equal(updates.length, PRESALE_EVENT_COUNT);
  assert.deepEqual(checkpoints, []);
});

test('does not ingest an alias whose configured identity is invalid', async () => {
  const tokenV2Address = `0x${'7'.repeat(40)}` as const;
  const tokenBytecode = '0x60016000' as const;
  const client = rpc({
    host: 'testnet.test',
    chainId: 97,
    bytecode: tokenBytecode,
    receipt: { contractAddress: tokenV2Address, blockNumber: 106n, status: 'success' },
    logs: [{
      transactionHash: '0xabc', blockHash: '0xdef', blockNumber: 106n, logIndex: 0, args: {},
    }],
  });
  const { store, updates, eventBatches } = fakeStore();

  const result = await ingestBscOnce(store, config({
    bscExpectedChainId: 97,
    contractAliases: ['TOKEN_V2', 'PRESALE'],
    tokenV2Address,
    tokenV2StartBlock: 106,
    verifiedBscContracts: {
      TOKEN_V2: {
        alias: 'TOKEN_V2', chainId: 97, address: tokenV2Address, startBlock: 106,
        deploymentBlock: 106, deploymentTxHash: `0x${'8'.repeat(64)}`,
        runtimeCodeHash: `0x${'f'.repeat(64)}`, configHash: `0x${'9'.repeat(64)}`,
      },
    },
  }), { rpcClients: [client] });

  assert.equal(result.outcome, 'incomplete');
  assert.deepEqual(result.failedContractAliases, ['TOKEN_V2']);
  assert.equal(updates.some(({ config: item }) => item.contractAlias === 'PRESALE'), true);
  assert.equal(eventBatches.flat().some((event) => (event as { contractAlias?: string }).contractAlias === 'TOKEN_V2'), false);
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
  assert.equal(eventBatches.filter((batch) => batch.length > 0).length, PRESALE_EVENT_COUNT);
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
  assert.deepEqual(updates.map(({ update }) => update), Array.from({ length: PRESALE_EVENT_COUNT }, () => ({
    nextBlock: 111,
    safeBlock: 110,
    processedThroughBlock: 110,
    processedThroughTimestampMs: 1_100_000,
  })));
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

  const result = await ingestBscOnce(store, config(), { rpcClients: [client] });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /cursor update failed/);
  assert.deepEqual(checkpoints, []);
});

test('records safe head as explicit coverage origin for a new start-block zero cursor', async () => {
  const blockCalls: bigint[] = [];
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({ host: 'primary.test', blockCalls, logCalls });
  const { store, updates } = fakeStore();

  await ingestBscOnce(store, config({ bscStartBlock: 0 }), { rpcClients: [client] });

  assert.deepEqual(logCalls, Array.from({ length: PRESALE_EVENT_COUNT }, () => ({
    fromBlock: BigInt(110), toBlock: BigInt(110),
  })));
  assert.deepEqual(blockCalls, [BigInt(110)]);
  assert.deepEqual(updates.map(({ update }) => update), Array.from({ length: PRESALE_EVENT_COUNT }, () => ({
    nextBlock: 111,
    safeBlock: 110,
    processedFromBlock: 110,
    processedFromTimestampMs: 1_100_000,
    processedThroughBlock: 110,
    processedThroughTimestampMs: 1_100_000,
  })));
});

test('legacy start block zero is historical and never falls back to safe head', async () => {
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({
    host: 'mainnet.test',
    logCalls,
    logs: [{
      args: { from: PLAYER, to: TOKEN_ADDRESS, tokenId: 42n },
      blockNumber: 0n,
      blockHash: `0x${'3'.repeat(64)}`,
      transactionHash: `0x${'4'.repeat(64)}`,
      logIndex: 7,
    }],
  });
  const { store, updates, eventBatches } = fakeStore();

  await ingestBscOnce(store, config({
    runtimeScope: 'legacy',
    bscStartBlock: 100,
    bscConfirmations: 120,
    maxBlockRange: 5,
    contractAliases: ['TOKEN'],
    tokenAddress: TOKEN_ADDRESS,
    legacyStartBlocks: { TOKEN: 0 },
  }), { rpcClients: [client] });

  assert.equal(logCalls[0]?.fromBlock, 0n);
  assert.equal(logCalls[0]?.toBlock, 0n);
  assert.equal(updates[0]?.update.processedFromBlock, 0);
  const eventIds = eventBatches.flat().map((event) => (event as { _id: string })._id);
  assert.ok(eventIds.length > 0);
  assert.ok(eventIds.every((eventId) => eventId.startsWith('legacy:BSC:')));
});

test('legacy ingestion rejects a missing per-alias start block instead of using safe head', async () => {
  const client = rpc({ host: 'mainnet.test' });
  const { store } = fakeStore();

  const result = await ingestBscOnce(store, config({
    runtimeScope: 'legacy',
    contractAliases: ['TOKEN'],
    tokenAddress: TOKEN_ADDRESS,
    legacyStartBlocks: {},
  }), { rpcClients: [client] });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /TOKEN legacy exige un bloque inicial explícito/);
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

  assert.deepEqual(logCalls, Array.from({ length: UKI_STAKING_EVENT_COUNT }, () => ({
    fromBlock: 105n, toBlock: 109n,
  })));
  assert.deepEqual(
    updates.map(({ update }) => update.processedFromBlock),
    Array.from({ length: UKI_STAKING_EVENT_COUNT }, () => 105),
  );
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
    { fromBlock: 106n, toBlock: 110n },
    { fromBlock: 106n, toBlock: 110n },
    { fromBlock: 106n, toBlock: 110n },
  ]);
  assert.deepEqual(updates.map(({ config: eventConfig, update }) => ({
    alias: eventConfig.contractAlias,
    start: update.processedFromBlock,
    txHash: update.contractDeploymentTxHash,
  })), Array.from({ length: 5 }, () => ({
    alias: 'TOKEN_V2',
    start: 106,
    txHash: deploymentTxHash,
  })));
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

  assert.equal(updates.length, UKI_STAKING_EVENT_COUNT);
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

  const result = await ingestBscOnce(store, config({
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
    }), { rpcClients: [client] });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /runtimeCodeHash/);
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

  const result = await ingestBscOnce(store, config({
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
    }), { rpcClients: [client] });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /receipt de despliegue/);
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

  const result = await ingestBscOnce(store, config({
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
    }), { rpcClients: [client] });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /no demuestra cobertura desde el bloque de despliegue/);
  assert.deepEqual(updates, []);
});

function poolVaultFixture(chainId: 56 | 97, duration?: bigint) {
  const address = `0x${'3'.repeat(40)}` as const;
  const bytecode = '0x60016000' as const;
  const identity = { alias: 'CUKIE_POOL_NFT_VAULT' as const, chainId, address, startBlock: 105, deploymentBlock: 105, deploymentTxHash: `0x${'4'.repeat(64)}`, runtimeCodeHash: keccak256(bytecode), configHash: `0x${'5'.repeat(64)}` };
  const contractReadCalls: Array<{ address: string; functionName: string }> = [];
  const client = rpc({ host: 'pool.test', chainId, bytecode, poolPeriodDurationSeconds: duration, contractReadCalls, receipt: { contractAddress: address, blockNumber: 105n, status: 'success' } });
  const settings = config({ bscExpectedChainId: chainId, contractAliases: ['CUKIE_POOL_NFT_VAULT'], cukiePoolNftVaultAddress: address, cukiePoolNftVaultStartBlock: 105, maxBlockRange: 10, verifiedBscContracts: { CUKIE_POOL_NFT_VAULT: identity } });
  return { address, identity, client, settings, contractReadCalls, ...fakeStore() };
}

test('pins the live pool duration in every verified testnet cursor without changing confirmations', async () => {
  for (const duration of [1800n, 3600n]) {
    const fixture = poolVaultFixture(97, duration);
    const result = await ingestBscOnce(fixture.store, fixture.settings, { rpcClients: [fixture.client] });
    assert.deepEqual(fixture.contractReadCalls, [{ address: fixture.address, functionName: 'PERIOD_DURATION' }]);
    assert.equal(fixture.updates.length, POOL_VAULT_EVENT_COUNT);
    for (const { config: eventConfig, update } of fixture.updates) {
      assert.equal(eventConfig.contractAlias, 'CUKIE_POOL_NFT_VAULT');
      assert.equal(update.poolPeriodDurationSeconds, Number(duration));
      assert.equal(update.bootstrapStatus, 'verified');
      assert.equal(update.verifiedChainId, 97);
      assert.equal(update.contractCodeHash, fixture.identity.runtimeCodeHash);
      assert.equal(update.contractDeploymentBlock, 105);
      assert.equal(update.processedFromBlock, 105);
    }
    assert.equal(result.safeBlock, 110);
    assert.equal(fixture.settings.bscConfirmations, 10);
    assert.equal(fixture.checkpoints.length, 1);
  }
});

test('keeps the 86400-second pool calendar valid on chain 56 and chain 97', async () => {
  for (const chainId of [56, 97] as const) {
    const fixture = poolVaultFixture(chainId, 86400n);
    await ingestBscOnce(fixture.store, fixture.settings, { rpcClients: [fixture.client] });
    assert.equal(fixture.contractReadCalls.length, 1);
    assert.equal(fixture.updates.length, POOL_VAULT_EVENT_COUNT);
    assert.ok(fixture.updates.every(({ update }) => update.poolPeriodDurationSeconds === 86400 && update.verifiedChainId === chainId));
  }
});

test('refuses fast production pools and unsupported testnet durations before sealing any cursor', async () => {
  const cases: Array<{ chainId: 56 | 97; duration: bigint }> = [
    { chainId: 56, duration: 1800n },
    { chainId: 56, duration: 3600n },
    { chainId: 97, duration: 0n },
    { chainId: 97, duration: 1799n },
    { chainId: 97, duration: 7200n },
  ];
  for (const { chainId, duration } of cases) {
    const fixture = poolVaultFixture(chainId, duration);
    const result = await ingestBscOnce(fixture.store, fixture.settings, { rpcClients: [fixture.client] });
    assert.equal(result.outcome, 'incomplete');
    assert.match(result.errors[0]?.error ?? '', /duracion no permitida/);
    assert.equal(fixture.contractReadCalls.length, 1);
    assert.deepEqual(fixture.updates, []);
    assert.deepEqual(fixture.eventBatches, []);
    assert.deepEqual(fixture.checkpoints, []);
  }
});

test('requires a successful pool getter and never invents a default when RPC cannot read it', async () => {
  const fixture = poolVaultFixture(97);
  const result = await ingestBscOnce(fixture.store, fixture.settings, { rpcClients: [fixture.client] });
  assert.equal(result.outcome, 'incomplete');
  assert.match(result.errors[0]?.error ?? '', /reason=contract-data/);
  assert.equal(fixture.contractReadCalls.length, 1);
  assert.deepEqual(fixture.updates, []);
  assert.deepEqual(fixture.checkpoints, []);
});

test('shrinks an oversized BSC range, retries the same cursor and persists adaptive state', async () => {
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const adjustmentLogs: unknown[] = [];
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => adjustmentLogs.push(args);
  const client = rpc({
    host: 'adaptive.test',
    logCalls,
    onGetLogs: ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1n > 2n) {
        throw new Error('eth_getLogs response too large: limit exceeded (maximum 500 blocks)');
      }
      return [];
    },
  });
  const { store, updates } = fakeStore();

  let result;
  try {
    result = await ingestBscOnce(store, config({
      maxBlockRange: 8,
      minBlockRange: 2,
      bscConfirmations: 10,
    }), { rpcClients: [client] });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(result.outcome, 'complete');
  assert.deepEqual(logCalls.slice(0, 6), [
    { fromBlock: 100n, toBlock: 107n },
    { fromBlock: 100n, toBlock: 103n },
    { fromBlock: 100n, toBlock: 101n },
    { fromBlock: 102n, toBlock: 103n },
    { fromBlock: 104n, toBlock: 105n },
    { fromBlock: 106n, toBlock: 107n },
  ]);
  assert.ok(updates.every(({ update }) => update.nextBlock === 108));
  assert.ok(updates.every(({ update }) => update.adaptiveRange === 2));
  assert.ok(updates.every(({ update }) => update.adaptiveSuccesses === 1));
  assert.ok(adjustmentLogs.some((entry) => {
    const [, context] = entry as [unknown, Record<string, unknown>];
    return context?.cursor === 'BSC:PRESALE:Purchased'
      && context?.reason === 'response-too-large'
      && context?.retries === 1
      && context?.from === 100;
  }));
  assert.ok(adjustmentLogs.some((entry) => {
    const [, context] = entry as [unknown, Record<string, unknown>];
    return context?.reason === 'query-success'
      && context?.range === 2
      && context?.nextCursor === 108
      && context?.retries === 2;
  }));
});

test('does not adapt a BSC range for auth failures and leaves the cursor unadvanced', async () => {
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({
    host: 'auth.test',
    logCalls,
    onGetLogs: () => {
      const cause = Object.assign(new Error('invalid api key'), { status: 401 });
      throw Object.assign(new Error('HTTP request failed'), { cause });
    },
  });
  const { store, updates } = fakeStore({ nextBlock: 100, adaptiveRange: 8 });

  const result = await ingestBscOnce(store, config({
    maxBlockRange: 8,
    minBlockRange: 2,
  }), { rpcClients: [client] });

  assert.equal(result.outcome, 'incomplete');
  assert.equal(logCalls.length, 10);
  assert.deepEqual(logCalls[0], { fromBlock: 100n, toBlock: 107n });
  assert.deepEqual(updates, []);
  assert.match(result.errors[0]?.error ?? '', /reason=authentication status=401/);
});

test('shrinks a mixed fallback while surfacing authentication failures durably', async () => {
  const syntheticSecret = 'SYNTHETIC_ECHO_TOKEN';
  const rangeCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const authCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const rangeLimited = rpc({
    host: 'range-limited.test',
    logCalls: rangeCalls,
    onGetLogs: ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1n > 2n) {
        throw Object.assign(new Error('Request exceeds defined limit.'), { code: -32005 });
      }
      return [];
    },
  });
  const authenticatedArchive = rpc({
    host: 'archive-auth.test',
    logCalls: authCalls,
    onGetLogs: () => {
      throw new HttpRequestError({
        url: `https://archive-auth.test/v1?apiKey=${syntheticSecret}`,
        status: 403,
        details: `Invalid API key ${syntheticSecret}`,
      });
    },
  });
  const { store, updates } = fakeStore({ nextBlock: 100, adaptiveRange: 8 });

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const warningLogs: unknown[] = [];
  console.log = () => {};
  console.warn = (...args: unknown[]) => warningLogs.push(args);
  let result;
  try {
    result = await ingestBscOnce(store, config({
      maxBlockRange: 8,
      minBlockRange: 2,
    }), { rpcClients: [rangeLimited, authenticatedArchive] });
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  }

  assert.equal(result.outcome, 'complete');
  assert.deepEqual(rangeCalls.slice(0, 3), [
    { fromBlock: 100n, toBlock: 107n },
    { fromBlock: 100n, toBlock: 103n },
    { fromBlock: 100n, toBlock: 101n },
  ]);
  assert.ok(authCalls.length >= 2);
  assert.ok(updates.every(({ update }) => update.nextBlock === 108));
  assert.ok(updates.every(({ update }) => update.adaptiveRange === 2));
  assert.ok(result.rpcWarnings.some((warning) => (
    warning.cursorId === 'BSC:PRESALE:Purchased'
    && warning.rpcHost === 'archive-auth.test'
    && warning.reason === 'authentication'
    && warning.error === 'reason=authentication status=403'
    && warning.retries === 1
  )));
  assert.doesNotMatch(JSON.stringify({ result, warningLogs }), new RegExp(syntheticSecret));
});

test('shrinks a mixed fallback when the alternate RPC has a transport failure', async () => {
  const rangeCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const transportCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const rangeLimited = rpc({
    host: 'range-limited.test',
    logCalls: rangeCalls,
    onGetLogs: ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1n > 2n) {
        throw Object.assign(new Error('Request exceeds defined limit.'), { code: -32005 });
      }
      return [];
    },
  });
  const disconnected = rpc({
    host: 'transport.test',
    logCalls: transportCalls,
    onGetLogs: () => {
      const cause = Object.assign(new Error('socket closed'), { code: 'ECONNRESET' });
      throw Object.assign(new Error('fetch failed'), { cause });
    },
  });
  const { store, updates } = fakeStore({ nextBlock: 100, adaptiveRange: 8 });

  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  let result;
  try {
    result = await ingestBscOnce(store, config({
      maxBlockRange: 8,
      minBlockRange: 2,
    }), { rpcClients: [rangeLimited, disconnected] });
  } finally {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
  }

  assert.equal(result.outcome, 'complete');
  assert.deepEqual(rangeCalls.slice(0, 3), [
    { fromBlock: 100n, toBlock: 107n },
    { fromBlock: 100n, toBlock: 103n },
    { fromBlock: 100n, toBlock: 101n },
  ]);
  assert.equal(transportCalls.length, PRESALE_EVENT_COUNT * 2);
  assert.ok(updates.every(({ update }) => update.nextBlock === 108));
  assert.ok(updates.every(({ update }) => update.adaptiveRange === 2));
  assert.ok(result.rpcWarnings.some((warning) => (
    warning.rpcHost === 'transport.test'
    && warning.reason === 'transient'
    && warning.error === 'reason=transient code=ECONNRESET'
  )));
});

test('does not hide a contract/data failure behind a range adjustment', async () => {
  const rangeCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const fatalCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const rangeLimited = rpc({
    host: 'range-limited.test',
    logCalls: rangeCalls,
    onGetLogs: () => {
      throw new Error('eth_getLogs response too large');
    },
  });
  const invalidContract = rpc({
    host: 'invalid-contract.test',
    logCalls: fatalCalls,
    onGetLogs: () => {
      throw new Error('execution reverted while decoding contract event');
    },
  });
  const { store, updates } = fakeStore({ nextBlock: 100, adaptiveRange: 8 });

  const originalConsoleWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await ingestBscOnce(store, config({
      maxBlockRange: 8,
      minBlockRange: 2,
    }), { rpcClients: [rangeLimited, invalidContract] });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.equal(result.outcome, 'incomplete');
  assert.equal(rangeCalls.length, PRESALE_EVENT_COUNT);
  assert.equal(fatalCalls.length, PRESALE_EVENT_COUNT);
  assert.deepEqual(updates, []);
  assert.match(result.errors[0]?.error ?? '', /reason=contract-data/);
});

test('does not hide a chain mismatch behind a range adjustment', async () => {
  const rangeCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const rangeLimited = rpc({
    host: 'range-limited.test',
    logCalls: rangeCalls,
    onGetLogs: () => {
      throw new Error('eth_getLogs response too large');
    },
  });
  const wrongChain = rpc({
    host: 'wrong-chain.test',
    chainId: 97,
  });
  const { store, updates } = fakeStore({ nextBlock: 100, adaptiveRange: 8 });

  const originalConsoleWarn = console.warn;
  console.warn = () => {};
  let result;
  try {
    result = await ingestBscOnce(store, config({
      maxBlockRange: 8,
      minBlockRange: 2,
    }), { rpcClients: [rangeLimited, wrongChain] });
  } finally {
    console.warn = originalConsoleWarn;
  }

  assert.equal(result.outcome, 'incomplete');
  assert.equal(rangeCalls.length, PRESALE_EVENT_COUNT);
  assert.deepEqual(updates, []);
  assert.match(result.errors[0]?.error ?? '', /reason=chain-mismatch/);
  assert.ok(result.rpcWarnings.some((warning) => (
    warning.rpcHost === 'wrong-chain.test'
    && warning.reason === 'chain-mismatch'
    && warning.error === 'reason=chain-mismatch'
  )));
});

test('halves explicit BSC timeouts and never changes the logical cursor window', async () => {
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({
    host: 'timeout.test',
    logCalls,
    onGetLogs: ({ fromBlock, toBlock }) => {
      if (toBlock - fromBlock + 1n > 4n) {
        throw Object.assign(new Error('request timed out'), { code: 'ETIMEDOUT' });
      }
      return [];
    },
  });
  const { store, updates } = fakeStore();

  const originalConsoleLog = console.log;
  console.log = () => {};
  try {
    const result = await ingestBscOnce(store, config({
      maxBlockRange: 8,
      minBlockRange: 2,
    }), { rpcClients: [client] });
    assert.equal(result.outcome, 'complete');
  } finally {
    console.log = originalConsoleLog;
  }

  assert.deepEqual(logCalls.slice(0, 3), [
    { fromBlock: 100n, toBlock: 107n },
    { fromBlock: 100n, toBlock: 103n },
    { fromBlock: 104n, toBlock: 107n },
  ]);
  assert.ok(updates.every(({ update }) => update.nextBlock === 108));
  assert.ok(updates.every(({ update }) => update.adaptiveRange === 4));
});

test('surfaces a size error at the configured minimum without advancing the cursor', async () => {
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({
    host: 'minimum.test',
    logCalls,
    onGetLogs: () => {
      throw new Error('eth_getLogs response too large');
    },
  });
  const { store, updates, eventBatches } = fakeStore({
    nextBlock: 100,
    adaptiveRange: 4,
  });

  const originalConsoleLog = console.log;
  console.log = () => {};
  let result;
  try {
    result = await ingestBscOnce(store, config({
      maxBlockRange: 4,
      minBlockRange: 2,
    }), { rpcClients: [client] });
  } finally {
    console.log = originalConsoleLog;
  }

  assert.equal(result.outcome, 'incomplete');
  assert.deepEqual(logCalls.slice(0, 2), [
    { fromBlock: 100n, toBlock: 103n },
    { fromBlock: 100n, toBlock: 101n },
  ]);
  assert.deepEqual(eventBatches, []);
  assert.deepEqual(updates, []);
});

test('grows only after three complete windows and never exceeds 5001', async () => {
  const client = rpc({ host: 'recovery.test', latestBlock: 6_000n });
  const { store, updates } = fakeStore({
    nextBlock: 100,
    adaptiveRange: 5_000,
    adaptiveSuccesses: 2,
  });

  const originalConsoleLog = console.log;
  console.log = () => {};
  try {
    const result = await ingestBscOnce(store, config({
      maxBlockRange: 5_001,
      minBlockRange: 1,
      bscConfirmations: 0,
    }), { rpcClients: [client] });
    assert.equal(result.outcome, 'complete');
  } finally {
    console.log = originalConsoleLog;
  }

  assert.ok(updates.every(({ update }) => update.nextBlock === 5_101));
  assert.ok(updates.every(({ update }) => update.adaptiveRange === 5_001));
  assert.ok(updates.every(({ update }) => update.adaptiveSuccesses === 0));
});

test('rejects adaptive bounds outside the configured 1..5001 envelope', async () => {
  const client = rpc({ host: 'bounds.test' });
  const { store } = fakeStore();

  await assert.rejects(
    ingestBscOnce(store, config({ maxBlockRange: 5_002 }), { rpcClients: [client] }),
    /entre 1 y 5001/,
  );
  await assert.rejects(
    ingestBscOnce(store, config({ maxBlockRange: 4, minBlockRange: 5 }), { rpcClients: [client] }),
    /no mayor/,
  );
});

test('deduplicates logs and replays the exact range after persistence fails', async () => {
  const duplicate = {
    transactionHash: `0x${'a'.repeat(64)}`,
    blockHash: `0x${'b'.repeat(64)}`,
    blockNumber: 102n,
    logIndex: 1,
    args: {
      buyer: PLAYER,
      asmAmount: 1n,
      ukiAmount: 2n,
      totalBuyerAsm: 1n,
      totalBuyerUki: 2n,
    },
  };
  const second = {
    ...duplicate,
    transactionHash: `0x${'c'.repeat(64)}`,
    blockNumber: 103n,
    logIndex: 0,
  };
  const logCalls: Array<{ fromBlock: bigint; toBlock: bigint }> = [];
  const client = rpc({ host: 'replay.test', logs: [second, duplicate, duplicate], logCalls });
  const failed = fakeStore({ nextBlock: 100 }, { failCursorUpdate: true });

  const originalConsoleLog = console.log;
  console.log = () => {};
  try {
    const first = await ingestBscOnce(failed.store, config({
      maxBlockRange: 4,
      minBlockRange: 1,
    }), { rpcClients: [client] });
    assert.equal(first.outcome, 'incomplete');
  } finally {
    console.log = originalConsoleLog;
  }
  assert.deepEqual(failed.updates, []);
  assert.ok(failed.eventBatches.every((batch) => batch.length === 2));

  const replayed = fakeStore({ nextBlock: 100 });
  console.log = () => {};
  try {
    const secondRun = await ingestBscOnce(replayed.store, config({
      maxBlockRange: 4,
      minBlockRange: 1,
    }), { rpcClients: [client] });
    assert.equal(secondRun.outcome, 'complete');
  } finally {
    console.log = originalConsoleLog;
  }

  const firstIds = failed.eventBatches[0]?.map((event) => (event as { _id: string })._id);
  const replayIds = replayed.eventBatches[0]?.map((event) => (event as { _id: string })._id);
  assert.deepEqual(replayIds, firstIds);
  assert.equal(new Set(replayIds).size, 2);
  assert.ok(replayed.updates.every(({ update }) => update.nextBlock === 104));
  assert.deepEqual(logCalls[0], { fromBlock: 100n, toBlock: 103n });
  assert.deepEqual(logCalls[PRESALE_EVENT_COUNT], { fromBlock: 100n, toBlock: 103n });
});
