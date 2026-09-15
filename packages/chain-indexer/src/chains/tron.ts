import { getContractEventConfigs } from '../config/contracts.js';
import { LEGACY_CONTRACT_ALIASES } from '../legacy/contracts.js';
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

type TronHttpError = Error & {
  status: number;
  retryAfterMs?: number;
};

type TronRequestState = {
  /** Earliest time at which any subsequent TronGrid request may start. */
  nextAllowedAt: number;
};

const TRON_MAX_TRANSIENT_RETRIES = 3;
const TRON_RETRY_BACKOFF_MS = 250;
// One indexer process has one TronGrid quota window. Keep Retry-After across
// ingest cycles so an exhausted 429 cannot be forgotten by the next poll.
const sharedTronRequestState: TronRequestState = { nextAllowedAt: 0 };

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
  return error instanceof Error
    && ((error as Partial<TronHttpError>).status === 429 || error.message.includes('TronGrid 429'));
}

function isBadRequestError(error: unknown) {
  return error instanceof Error
    && ((error as Partial<TronHttpError>).status === 400 || error.message.includes('TronGrid 400'));
}

function isAuthError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = (error as Partial<TronHttpError>).status;
  return status === 401 || status === 403
    || /TronGrid (?:401|403)\b|unauthori[sz]ed|forbidden/i.test(error.message);
}

function parseRetryAfterMs(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function delay(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSharedRetryWindow(state: TronRequestState) {
  const remaining = state.nextAllowedAt - Date.now();
  if (remaining > 0) await delay(remaining);
}

function eventsBaseUrl(config: IndexerConfig) {
  const parsed = new URL(config.tronApiBaseUrl);
  const pathname = parsed.pathname.replace(/\/$/, '');
  if (config.runtimeScope === 'legacy') {
    if (parsed.origin !== 'https://api.trongrid.io' || pathname !== '/v1') {
      throw new Error('Runtime legacy TRON exige https://api.trongrid.io/v1 para eventos.');
    }
  }
  return `${parsed.origin}${pathname}`;
}

function buildTronUrl(
  config: IndexerConfig,
  contractEvent: ContractEventConfig,
  minTimestampMs: number,
  fingerprint?: string | null,
) {
  const url = new URL(
    `${eventsBaseUrl(config)}/contracts/${contractEvent.contractAddress}/events`,
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
  state: TronRequestState = { nextAllowedAt: 0 },
) {
  const url = buildTronUrl(config, contractEvent, minTimestampMs, fingerprint);
  const headers: Record<string, string> = {};

  if (config.tronApiKey) {
    headers['TRON-PRO-API-KEY'] = config.tronApiKey;
  }

  for (let attempt = 0; ; attempt += 1) {
    await waitForSharedRetryWindow(state);
    let response: Response;
    try {
      response = await fetch(url, { headers });
    } catch (error) {
      const backoffMs = TRON_RETRY_BACKOFF_MS * (2 ** attempt);
      state.nextAllowedAt = Math.max(state.nextAllowedAt, Date.now() + backoffMs);
      if (attempt >= TRON_MAX_TRANSIENT_RETRIES) throw error;
      await waitForSharedRetryWindow(state);
      continue;
    }

    if (response.ok) {
      return (await response.json()) as TronGridResponse;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers?.get('retry-after') ?? null);
    const httpError = new Error(
      `TronGrid ${response.status} ${response.statusText}`,
    ) as TronHttpError;
    httpError.status = response.status;
    if (retryAfterMs !== undefined) httpError.retryAfterMs = retryAfterMs;

    // 401/403 are configuration/credential failures and must remain visible;
    // retrying them only delays diagnosis. 429 and 5xx may be transient and
    // share the Retry-After window across contract/event cursors.
    const retryable = !isAuthError(httpError)
      && (response.status === 429 || (response.status >= 500 && response.status <= 599));
    if (!retryable) throw httpError;

    const backoffMs = retryAfterMs ?? TRON_RETRY_BACKOFF_MS * (2 ** attempt);
    // Preserve even the final Retry-After before surfacing exhaustion. The
    // following ingest cycle will respect this shared deadline.
    state.nextAllowedAt = Math.max(state.nextAllowedAt, Date.now() + backoffMs);
    if (attempt >= TRON_MAX_TRANSIENT_RETRIES) throw httpError;
    await waitForSharedRetryWindow(state);
  }
}

function eventToChainEvent(config: IndexerConfig, contractEvent: ContractEventConfig, event: TronGridEvent): ChainEvent {
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
    runtimeScope: config.runtimeScope ?? 'default',
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

  const contractEvents = getContractEventConfigs(['TRON'], config.runtimeScope === 'legacy'
    ? { contractAliases: [...LEGACY_CONTRACT_ALIASES] }
    : { contractAliases: config.contractAliases });
  let inserted = 0;
  let pages = 0;
  let rateLimited = false;
  const requestState = sharedTronRequestState;
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
          requestState,
        );
      } catch (error) {
        if (!cursor?.fingerprint || !isBadRequestError(error)) throw error;

        response = await fetchTronEvents(
          config,
          contractEvent,
          minTimestampMs,
          null,
          requestState,
        );
      }

      const eventById = new Map<string, ChainEvent>();
      for (const rawEvent of response.data ?? []) {
        const event = eventToChainEvent(config, contractEvent, rawEvent);
        eventById.set(event._id, event);
      }
      const events = [...eventById.values()].sort((left, right) =>
        left.timestampMs - right.timestampMs
        || left.blockNumber - right.blockNumber
        || left.logIndex - right.logIndex
        || left._id.localeCompare(right._id));
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
        errors.push({
          cursorId: `${contractEvent.chain}:${contractEvent.contractAlias}:${contractEvent.eventName}`,
          error: `${errorMessage(error)} tras agotar reintentos; cursor conservado`,
        });
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
