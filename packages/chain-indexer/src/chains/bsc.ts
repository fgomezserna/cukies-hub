import { bsc } from 'viem/chains';
import { createPublicClient, http, type Address } from 'viem';

import { bscEventAbis } from '../config/abis.js';
import { getContractEventConfigs } from '../config/contracts.js';
import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, IndexerConfig } from '../types.js';
import { now, toJsonRecord } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

function isRpcLimitError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('limit exceeded') || message.includes('request exceeds defined limit');
}

async function getLogsWithFallback(
  client: ReturnType<typeof createPublicClient>,
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
    if (!isRpcLimitError(error) || fromBlock >= toBlock) throw error;

    const middleBlock = Math.floor((fromBlock + toBlock) / 2);
    const [left, right] = await Promise.all([
      getLogsWithFallback(client, params, fromBlock, middleBlock),
      getLogsWithFallback(client, params, middleBlock + 1, toBlock),
    ]);

    return [...left, ...right];
  }
}

export async function ingestBscOnce(store: IndexerStore, config: IndexerConfig) {
  if (!config.chains.includes('BSC')) return { inserted: 0, ranges: 0 };

  const client = createPublicClient({
    chain: bsc,
    transport: http(config.bscRpcUrl),
  });

  const latestBlock = Number(await client.getBlockNumber());
  const safeBlock = Math.max(0, latestBlock - config.bscConfirmations);
  const contractEvents = getContractEventConfigs(['BSC'], {
    presaleAddress: config.presaleAddress,
  });
  const timestampCache = new Map<number, number>();
  let inserted = 0;
  let ranges = 0;

  for (const contractEvent of contractEvents) {
    const cursor = await store.getCursor(contractEvent);
    const fromBlock =
      cursor?.nextBlock ?? (config.bscStartBlock > 0 ? config.bscStartBlock : safeBlock);

    if (fromBlock > safeBlock) {
      await store.updateCursor(contractEvent, { nextBlock: fromBlock, safeBlock });
      continue;
    }

    const toBlock = Math.min(fromBlock + config.maxBlockRange - 1, safeBlock);
    const logs = await getLogsWithFallback(
      client,
      {
        address: contractEvent.contractAddress as Address,
        event: bscEventAbis[contractEvent.eventName],
      },
      fromBlock,
      toBlock,
    );

    const events: ChainEvent[] = [];

    for (const log of logs) {
      const logArgs =
        log.args && !Array.isArray(log.args) ? (log.args as Record<string, unknown>) : {};
      const blockNumber = Number(log.blockNumber);
      let timestampMs = timestampCache.get(blockNumber);

      if (!timestampMs) {
        const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
        timestampMs = Number(block.timestamp) * 1000;
        timestampCache.set(blockNumber, timestampMs);
      }

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

    await store.updateCursor(contractEvent, {
      nextBlock: toBlock + 1,
      safeBlock,
    });
  }

  return { inserted, ranges, safeBlock };
}
