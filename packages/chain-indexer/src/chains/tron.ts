import { getContractEventConfigs } from '../config/contracts.js';
import { normalizeDomainEvent } from '../normalize.js';
import type { ChainEvent, ContractEventConfig, IndexerConfig, JsonRecord } from '../types.js';
import { normalizeTronArgs, now, toJsonRecord } from '../utils/json.js';
import type { IndexerStore } from '../storage/index.js';

type TronGridEvent = {
  block_number: number;
  block_timestamp: number;
  contract_address: string;
  event_name: string;
  transaction_id: string;
  event_index?: number;
  result?: Record<string, unknown>;
};

type TronGridResponse = {
  data?: TronGridEvent[];
  meta?: {
    fingerprint?: string;
    links?: {
      next?: string;
    };
  };
};

function extractFingerprint(response: TronGridResponse) {
  if (response.meta?.fingerprint) return response.meta.fingerprint;

  const next = response.meta?.links?.next;
  if (!next) return null;

  try {
    const url = new URL(next);
    return url.searchParams.get('fingerprint');
  } catch {
    return null;
  }
}

function isRateLimitError(error: unknown) {
  return error instanceof Error && error.message.includes('TronGrid 429');
}

function isBadRequestError(error: unknown) {
  return error instanceof Error && error.message.includes('TronGrid 400');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function delay(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTronUrl(
  config: IndexerConfig,
  contractEvent: ContractEventConfig,
  minTimestampMs: number,
  fingerprint?: string | null,
) {
  const url = new URL(
    `${config.tronApiBaseUrl}/contracts/${contractEvent.contractAddress}/events`,
  );
  url.searchParams.set('only_confirmed', 'true');
  url.searchParams.set('order_by', 'block_timestamp,asc');
  url.searchParams.set('event_name', contractEvent.eventName);
  url.searchParams.set('limit', String(config.tronPageLimit));

  if (fingerprint) {
    url.searchParams.set('fingerprint', fingerprint);
  } else {
    url.searchParams.set('min_block_timestamp', String(minTimestampMs));
  }

  return url;
}

async function fetchTronEvents(
  config: IndexerConfig,
  contractEvent: ContractEventConfig,
  minTimestampMs: number,
  fingerprint?: string | null,
) {
  const url = buildTronUrl(config, contractEvent, minTimestampMs, fingerprint);
  const headers: Record<string, string> = {};

  if (config.tronApiKey) {
    headers['TRON-PRO-API-KEY'] = config.tronApiKey;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`TronGrid ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as TronGridResponse;
}

function eventToChainEvent(contractEvent: ContractEventConfig, event: TronGridEvent): ChainEvent {
  const argsRaw = normalizeTronArgs(event.result ?? {});
  const args = toJsonRecord(argsRaw);
  const normalized = normalizeDomainEvent(
    'TRON',
    contractEvent.eventName,
    contractEvent.contractAlias,
    argsRaw,
  );
  const eventIndex = Number(event.event_index ?? 0);
  const createdAt = now();

  return {
    _id: `TRON:${contractEvent.contractAlias}:${contractEvent.eventName}:${event.transaction_id}:${eventIndex}`,
    chain: 'TRON',
    contractAlias: contractEvent.contractAlias,
    contractAddress: contractEvent.contractAddress,
    eventName: contractEvent.eventName,
    txHash: event.transaction_id,
    logIndex: eventIndex,
    blockNumber: Number(event.block_number),
    timestampMs: Number(event.block_timestamp),
    args,
    normalized,
    raw: toJsonRecord(event) as JsonRecord,
    status: 'ingested',
    attempts: 0,
    schemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
  };
}

export async function ingestTronOnce(store: IndexerStore, config: IndexerConfig) {
  if (!config.chains.includes('TRON')) return { inserted: 0, pages: 0 };

  const contractEvents = getContractEventConfigs(['TRON']);
  let inserted = 0;
  let pages = 0;
  let rateLimited = false;
  const errors: Array<{ cursorId: string; error: string }> = [];

  for (const contractEvent of contractEvents) {
    try {
      const cursor = await store.getCursor(contractEvent);
      const minTimestampMs = cursor?.nextTimestampMs ?? config.tronStartTimestampMs;
      let response: TronGridResponse;

      try {
        response = await fetchTronEvents(
          config,
          contractEvent,
          minTimestampMs,
          cursor?.fingerprint,
        );
      } catch (error) {
        if (!cursor?.fingerprint || !isBadRequestError(error)) throw error;

        response = await fetchTronEvents(config, contractEvent, minTimestampMs, null);
      }

      const events = (response.data ?? []).map((event) => eventToChainEvent(contractEvent, event));
      const result = await store.upsertEvents(events);
      const nextFingerprint = extractFingerprint(response);
      const lastTimestamp = events.at(-1)?.timestampMs;

      inserted += result.inserted;
      pages += 1;

      await store.updateCursor(contractEvent, {
        nextTimestampMs:
          nextFingerprint || lastTimestamp === undefined ? minTimestampMs : lastTimestamp + 1,
        fingerprint: nextFingerprint,
      });

      await delay(config.tronRequestDelayMs);
    } catch (error) {
      if (isRateLimitError(error)) {
        rateLimited = true;
        break;
      }

      errors.push({
        cursorId: `${contractEvent.chain}:${contractEvent.contractAlias}:${contractEvent.eventName}`,
        error: errorMessage(error),
      });
    }
  }

  return { inserted, pages, rateLimited, errors };
}
