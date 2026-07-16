import { bsc } from 'viem/chains';
import { createPublicClient, http, type Address } from 'viem';

import { bscEventAbis } from '../config/abis.js';
import { getContractEventConfigs } from '../config/contracts.js';
import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, IndexerConfig } from '../types.js';
import { now, toJsonRecord } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

type BscClient = ReturnType<typeof createPublicClient>;
export type BscRpcClient = {
  url: string;
  host: string;
  client: BscClient;
};

export interface BscIngestDependencies {
  readonly rpcClients?: BscRpcClient[];
}

function rpcHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return 'invalid-rpc-url';
  }
}

function createBscRpcClients(urls: string[]) {
  return urls.map((url) => ({
    url,
    host: rpcHost(url),
    client: createPublicClient({
      chain: bsc,
      transport: http(url),
    }),
  }));
}

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return String(error);

  return error.message;
}

function isRpcRangeLimitError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  return message.includes('limit exceeded') || message.includes('request exceeds defined limit');
}

async function withBscRpcFallback<T>(
  rpcClients: BscRpcClient[],
  operation: (rpc: BscRpcClient) => Promise<T>,
) {
  const failures: string[] = [];

  for (const rpc of rpcClients) {
    try {
      return {
        value: await operation(rpc),
        rpc,
      };
    } catch (error) {
      failures.push(`${rpc.host}: ${errorMessage(error) || String(error)}`);
    }
  }

  throw new Error(`Todos los RPC BSC fallaron: ${failures.join(' | ')}`);
}

function rpcClientsWithPreferredFirst(
  preferred: BscRpcClient,
  rpcClients: BscRpcClient[],
) {
  return [preferred, ...rpcClients.filter((rpc) => rpc !== preferred)];
}

async function getBlockTimestampMs(input: {
  blockNumber: number;
  preferredRpc: BscRpcClient;
  rpcClients: BscRpcClient[];
  timestampCache: Map<number, number>;
}) {
  const cached = input.timestampCache.get(input.blockNumber);
  if (cached !== undefined) return cached;

  const { value: block } = await withBscRpcFallback(
    rpcClientsWithPreferredFirst(input.preferredRpc, input.rpcClients),
    (rpc) => rpc.client.getBlock({ blockNumber: BigInt(input.blockNumber) }),
  );
  const timestampMsBigInt = block.timestamp * BigInt(1_000);
  if (timestampMsBigInt < BigInt(0) || timestampMsBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Timestamp BSC fuera de rango seguro para el bloque ${input.blockNumber}`);
  }
  const timestampMs = Number(timestampMsBigInt);
  input.timestampCache.set(input.blockNumber, timestampMs);
  return timestampMs;
}

async function getLogsWithFallback(
  client: BscClient,
  params: {
    address: Address;
    event: (typeof bscEventAbis)[keyof typeof bscEventAbis];
  },
  fromBlock: number,
  toBlock: number,
): Promise<any[]> {
  try {
    return await client.getLogs({
      ...params,
      fromBlock: BigInt(fromBlock),
      toBlock: BigInt(toBlock),
    });
  } catch (error) {
    if (!isRpcRangeLimitError(error) || fromBlock >= toBlock) throw error;

    const middleBlock = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      getLogsWithFallback(client, params, fromBlock, middleBlock),
      getLogsWithFallback(client, params, middleBlock + 1, toBlock),
    ]);

    return [...left, ...right];
  }
}

export async function ingestBscOnce(
  store: IndexerStore,
  config: IndexerConfig,
  dependencies: BscIngestDependencies = {},
) {
  if (!config.chains.includes('BSC')) return { inserted: 0, ranges: 0 };

  const rpcClients = dependencies.rpcClients ?? createBscRpcClients(
    config.bscRpcUrls.length > 0 ? config.bscRpcUrls : [config.bscRpcUrl],
  );

  const { value: latestBlockValue, rpc: latestBlockRpc } = await withBscRpcFallback(
    rpcClients,
    (rpc) => rpc.client.getBlockNumber(),
  );
  const latestBlock = Number(latestBlockValue);
  const safeBlock = Math.max(0, latestBlock - config.bscConfirmations);
  const contractEvents = getContractEventConfigs(['BSC'], {
    presaleAddress: config.presaleAddress,
    contractAliases: config.contractAliases,
  });
  const timestampCache = new Map<number, number>();
  let inserted = 0;
  let ranges = 0;

  for (const contractEvent of contractEvents) {
    const cursor = await store.getCursor(contractEvent);
    const cursorHasCoverageOrigin =
      Number.isSafeInteger(cursor?.processedFromBlock) &&
      Number(cursor?.processedFromBlock) >= 0 &&
      Number.isSafeInteger(cursor?.processedFromTimestampMs) &&
      Number(cursor?.processedFromTimestampMs) >= 0;
    const fromBlock =
      cursor?.nextBlock ?? (config.bscStartBlock > 0 ? config.bscStartBlock : safeBlock);

    if (fromBlock > safeBlock) {
      const processedThroughTimestampMs = await getBlockTimestampMs({
        blockNumber: safeBlock,
        preferredRpc: latestBlockRpc,
        rpcClients,
        timestampCache,
      });
      await store.updateCursor(contractEvent, {
        nextBlock: fromBlock,
        safeBlock,
        processedThroughBlock: safeBlock,
        processedThroughTimestampMs,
        ...(cursorHasCoverageOrigin
          ? {
              processedFromBlock: cursor?.processedFromBlock,
              processedFromTimestampMs: cursor?.processedFromTimestampMs,
            }
          : {}),
      });
      continue;
    }

    const toBlock = Math.min(fromBlock + config.maxBlockRange - 1, safeBlock);
    const processedFromBlock = cursorHasCoverageOrigin
      ? Number(cursor?.processedFromBlock)
      : fromBlock;
    const processedFromTimestampMs = cursorHasCoverageOrigin
      ? Number(cursor?.processedFromTimestampMs)
      : await getBlockTimestampMs({
          blockNumber: processedFromBlock,
          preferredRpc: latestBlockRpc,
          rpcClients,
          timestampCache,
        });
    const { value: logs, rpc: logsRpc } = await withBscRpcFallback(
      rpcClients,
      (rpc) => getLogsWithFallback(
        rpc.client,
        {
          address: contractEvent.contractAddress as Address,
          event: bscEventAbis[contractEvent.eventName],
        },
        fromBlock,
        toBlock,
      ),
    );

    const events: ChainEvent[] = [];

    for (const log of logs) {
      const logArgs =
        log.args && !Array.isArray(log.args) ? (log.args as Record<string, unknown>) : {};
      const blockNumber = Number(log.blockNumber);
      const timestampMs = await getBlockTimestampMs({
        blockNumber,
        preferredRpc: logsRpc,
        rpcClients,
        timestampCache,
      });

      const args = toJsonRecord(logArgs);
      const normalized = normalizeDomainEvent(
        'BSC',
        contractEvent.eventName,
        contractEvent.contractAlias,
        logArgs,
      );
      const logIndex = Number(log.logIndex ?? 0);
      const createdAt = now();

      events.push({
        _id: `BSC:${contractEvent.contractAlias}:${contractEvent.eventName}:${log.transactionHash}:${logIndex}`,
        chain: 'BSC',
        contractAlias: contractEvent.contractAlias,
        contractAddress: contractEvent.contractAddress,
        eventName: contractEvent.eventName,
        txHash: log.transactionHash,
        logIndex,
        blockNumber,
        blockHash: log.blockHash,
        timestampMs,
        args,
        normalized,
        raw: toJsonRecord(log),
        status: 'ingested',
        attempts: 0,
        schemaVersion: 1,
        createdAt,
        updatedAt: createdAt,
      });
    }

    const result = await store.upsertEvents(events);
    inserted += result.inserted;
    ranges += 1;

    const processedThroughTimestampMs = await getBlockTimestampMs({
      blockNumber: toBlock,
      preferredRpc: logsRpc,
      rpcClients,
      timestampCache,
    });
    await store.updateCursor(contractEvent, {
      nextBlock: toBlock + 1,
      safeBlock,
      processedFromBlock,
      processedFromTimestampMs,
      processedThroughBlock: toBlock,
      processedThroughTimestampMs,
    });
  }

  return {
    inserted,
    ranges,
    safeBlock,
    rpcHosts: rpcClients.map((rpc) => rpc.host),
    latestBlockRpcHost: latestBlockRpc.host,
  };
}
