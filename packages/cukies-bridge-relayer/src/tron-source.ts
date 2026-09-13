import { keccak256, stringToHex, isAddress, type Address, type Hash } from 'viem';
import { TronWeb } from 'tronweb';

import { PermanentBridgeError } from './metadata.js';
import type {
  ConfirmedBridgeRequest,
  TronBridgeRequestSource,
  TronPollCursor,
  TronPollResult,
} from './types.js';
import type { BridgeRelayerConfig } from './config.js';

export type TronGridBridgeEvent = {
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
    throw new PermanentBridgeError(`JumpInBridge sin ${label}.`);
  }
  return value.trim();
}

function integerField(value: unknown, label: string) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new PermanentBridgeError(`JumpInBridge con ${label} invalido.`);
  }
  return numeric;
}

function decimalField(value: unknown, label: string) {
  const normalized = stringField(String(value ?? ''), label);
  if (!/^\d+$/.test(normalized)) {
    throw new PermanentBridgeError(`JumpInBridge con ${label} no decimal.`);
  }
  // Keep token ids lossless; BigInt catches values that would overflow the
  // uint256 argument later without coercing through Number.
  try {
    if (BigInt(normalized) < 0n) throw new Error('negative');
  } catch {
    throw new PermanentBridgeError(`JumpInBridge con ${label} invalido.`);
  }
  return normalized;
}

function transactionHash(value: unknown) {
  const raw = stringField(value, 'transaction_id').replace(/^0x/i, '');
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new PermanentBridgeError('JumpInBridge con transaction_id invalido.');
  }
  return raw.toLowerCase();
}

function tronAddressToHex(value: string) {
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) {
    try {
      return TronWeb.address.toHex(value).replace(/^0x/i, '').toLowerCase();
    } catch {
      throw new PermanentBridgeError('Direccion TRON invalida.');
    }
  }
  return value.replace(/^0x/i, '').toLowerCase();
}

/**
 * Legacy TRON ABI addresses are sometimes rendered as base58 (`T...`) and
 * sometimes as 41-prefixed hex.  The BSC destination is the final 20 bytes.
 */
export function normalizeBridgeDestination(value: unknown): Address {
  const raw = stringField(value, 'destOwner');
  let compact = tronAddressToHex(raw);
  if (compact.startsWith('41') && compact.length === 42) compact = compact.slice(2);
  if (compact.length === 64) compact = compact.slice(-40);
  if (!/^[0-9a-f]{40}$/i.test(compact)) {
    throw new PermanentBridgeError('JumpInBridge con destOwner invalido.');
  }
  const normalized = `0x${compact}` as Address;
  if (!isAddress(normalized) || /^0x0{40}$/i.test(normalized)) {
    throw new PermanentBridgeError('JumpInBridge con destOwner invalido.');
  }
  return normalized;
}

function normalizeSourceOwner(value: unknown) {
  const raw = stringField(value, 'originOwner');
  // Do not rewrite the source identity: it is useful evidence in TRON's
  // native representation and may be base58 or 41-prefixed hex.
  if (/^T/.test(raw) && !TronWeb.isAddress(raw)) {
    throw new PermanentBridgeError('JumpInBridge con originOwner invalido.');
  }
  return raw;
}

function syntheticTransferId(sourceTxHash: string, sourceEventIndex: number): Hash {
  return keccak256(stringToHex(`legacy-tron-mainnet:${sourceTxHash}:${sourceEventIndex}`));
}

export function parseConfirmedBridgeRequest(
  event: TronGridBridgeEvent,
): ConfirmedBridgeRequest {
  if (event.event_name !== 'JumpInBridge') {
    throw new PermanentBridgeError('Evento TRON inesperado para el relayer legacy.');
  }
  const result = event.result ?? {};
  const network = integerField(result.network, 'network');
  if (network !== 1) {
    throw new PermanentBridgeError('El evento no apunta a BSC mainnet (network=1).');
  }
  const sourceTxHash = transactionHash(event.transaction_id);
  const sourceEventIndex = integerField(event.event_index ?? 0, 'event_index');
  const tokenId = decimalField(result.tokenId, 'tokenId');

  return {
    transferId: syntheticTransferId(sourceTxHash, sourceEventIndex),
    tokenId,
    network: 1,
    destinationNetwork: 1,
    sourceNetwork: 0,
    sourceOwner: normalizeSourceOwner(result.originOwner),
    destinationOwner: normalizeBridgeDestination(result.destOwner),
    sourceTxHash,
    sourceBlockNumber: integerField(event.block_number, 'block_number'),
    sourceTimestampMs: integerField(event.block_timestamp, 'block_timestamp'),
    sourceEventIndex,
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
      `${this.config.tronApiBaseUrl}/contracts/${this.config.tronBridgeAddress}/events`,
    );
    url.searchParams.set('only_confirmed', 'true');
    url.searchParams.set('order_by', 'block_timestamp,asc');
    url.searchParams.set('event_name', 'JumpInBridge');
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
      throw new Error(`TronGrid mainnet ${response.status} ${response.statusText}`);
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
            ? event.transaction_id.replace(/^0x/i, '').toLowerCase()
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
