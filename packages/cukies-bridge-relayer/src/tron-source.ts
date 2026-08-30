import { isAddress, isHash, type Address, type Hash } from 'viem';

import { PermanentBridgeError } from './metadata.js';
import type {
  ConfirmedBridgeRequest,
  TronBridgeRequestSource,
  TronPollCursor,
  TronPollResult,
} from './types.js';
import type { BridgeRelayerConfig } from './config.js';

type TronGridBridgeEvent = {
  block_number?: unknown;
  block_timestamp?: unknown;
  transaction_id?: unknown;
  event_index?: unknown;
  event_name?: unknown;
  result?: Record<string, unknown>;
};

type TronGridResponse = {
  data?: TronGridBridgeEvent[];
  meta?: {
    fingerprint?: string;
    links?: { next?: string };
  };
};

function stringField(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PermanentBridgeError(`BridgeRequested sin ${label}.`);
  }
  return value.trim();
}

function integerField(value: unknown, label: string) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new PermanentBridgeError(`BridgeRequested con ${label} invalido.`);
  }
  return numeric;
}

function decimalField(value: unknown, label: string) {
  const normalized = stringField(String(value ?? ''), label);
  if (!/^\d+$/.test(normalized)) {
    throw new PermanentBridgeError(`BridgeRequested con ${label} no decimal.`);
  }
  return normalized;
}

function bytes32(value: unknown, label: string): Hash {
  const raw = stringField(value, label);
  const normalized = raw.startsWith('0x') ? raw : `0x${raw}`;
  if (!isHash(normalized)) {
    throw new PermanentBridgeError(`BridgeRequested con ${label} no bytes32.`);
  }
  return normalized;
}

export function normalizeBridgeDestination(value: unknown): Address {
  const raw = stringField(value, 'destinationOwner');
  const withoutPrefix = raw.replace(/^0x/i, '');
  const compact = withoutPrefix.length === 64 ? withoutPrefix.slice(24) : withoutPrefix;
  const normalized = `0x${compact}`;
  if (!isAddress(normalized) || /^0x0{40}$/i.test(normalized)) {
    throw new PermanentBridgeError('BridgeRequested con destinationOwner invalido.');
  }
  return normalized;
}

export function parseConfirmedBridgeRequest(
  event: TronGridBridgeEvent,
): ConfirmedBridgeRequest {
  if (event.event_name !== 'BridgeRequested') {
    throw new PermanentBridgeError('Evento Nile inesperado para el relayer.');
  }
  const result = event.result ?? {};
  const sourceNetwork = integerField(result.sourceNetwork, 'sourceNetwork');
  const destinationNetwork = integerField(
    result.destinationNetwork,
    'destinationNetwork',
  );
  if (sourceNetwork !== 0 || destinationNetwork !== 1) {
    throw new PermanentBridgeError('El evento no es TRON Nile -> BSC Testnet.');
  }
  const metadataHash = bytes32(result.metadataHash, 'metadataHash');
  if (/^0x0{64}$/i.test(metadataHash)) {
    throw new PermanentBridgeError('BridgeRequested no puede usar metadataHash cero.');
  }

  return {
    transferId: bytes32(result.transferId, 'transferId'),
    tokenId: decimalField(result.tokenId, 'tokenId'),
    sourceNetwork: 0,
    destinationNetwork: 1,
    sourceOwner: stringField(result.sourceOwner, 'sourceOwner'),
    destinationOwner: normalizeBridgeDestination(result.destinationOwner),
    nonce: decimalField(result.nonce, 'nonce'),
    metadataHash,
    sourceTxHash: stringField(event.transaction_id, 'transaction_id'),
    sourceBlockNumber: integerField(event.block_number, 'block_number'),
    sourceTimestampMs: integerField(event.block_timestamp, 'block_timestamp'),
    sourceEventIndex: integerField(event.event_index ?? 0, 'event_index'),
  };
}

function fingerprint(response: TronGridResponse) {
  if (response.meta?.fingerprint) return response.meta.fingerprint;
  const next = response.meta?.links?.next;
  if (!next) return null;
  try {
    return new URL(next).searchParams.get('fingerprint');
  } catch {
    return null;
  }
}

export class TronGridBridgeRequestSource implements TronBridgeRequestSource {
  constructor(
    private readonly config: BridgeRelayerConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async poll(cursor: TronPollCursor): Promise<TronPollResult> {
    const url = new URL(
      `${this.config.tronApiBaseUrl}/contracts/${this.config.tronEndpointAddress}/events`,
    );
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('order_by', 'block_timestamp,asc');
    url.searchParams.set('event_name', 'BridgeRequested');
    url.searchParams.set('limit', '200');
    if (cursor.fingerprint) {
      url.searchParams.set('fingerprint', cursor.fingerprint);
    } else {
      url.searchParams.set('min_block_timestamp', String(cursor.nextTimestampMs));
    }

    const response = await this.fetchImpl(url, {
      headers: this.config.tronApiKey
        ? { 'TRON-PRO-API-KEY': this.config.tronApiKey }
        : undefined,
    });
    if (!response.ok) {
      throw new Error(`TronGrid Nile ${response.status} ${response.statusText}`);
    }
    const payload = await response.json() as TronGridResponse;
    const requests: ConfirmedBridgeRequest[] = [];
    const invalidEvents: TronPollResult['invalidEvents'] = [];
    for (const event of payload.data ?? []) {
      try {
        requests.push(parseConfirmedBridgeRequest(event));
      } catch (error) {
        invalidEvents.push({
          sourceTxHash: typeof event.transaction_id === 'string'
            ? event.transaction_id
            : 'unknown',
          sourceEventIndex: Number.isSafeInteger(Number(event.event_index))
            ? Number(event.event_index)
            : 0,
          error: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
        });
      }
    }
    const nextFingerprint = fingerprint(payload);
    const rawLastTimestamp = Number(payload.data?.at(-1)?.block_timestamp);
    const lastTimestamp = Number.isSafeInteger(rawLastTimestamp) && rawLastTimestamp >= 0
      ? rawLastTimestamp
      : undefined;
    return {
      requests,
      invalidEvents,
      nextCursor: {
        fingerprint: nextFingerprint,
        nextTimestampMs: nextFingerprint || lastTimestamp === undefined
          ? cursor.nextTimestampMs
          : lastTimestamp + 1,
      },
    };
  }
}
