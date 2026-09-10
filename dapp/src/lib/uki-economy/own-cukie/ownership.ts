const ZERO_BSC_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Maximum history that the compatibility reader can prove complete per NFT. */
export const CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT = 512;

export type CanonicalOwnershipIdentity = {
  chainId: 56 | 97;
  collectionAddressNormalized: string;
  tokenId: string;
};

export type CanonicalOwnershipHistoryRow = {
  _id?: unknown;
  eventName?: unknown;
  status?: unknown;
  chain?: unknown;
  chainId?: unknown;
  contractAlias?: unknown;
  contractAddress?: unknown;
  blockNumber?: unknown;
  logIndex?: unknown;
  blockHash?: unknown;
  txHash?: unknown;
  timestampMs?: unknown;
  normalized?: Record<string, unknown> | null;
};

export type CanonicalOwnershipEvent = {
  eventId: string;
  tokenId: string;
  fromNormalized: string;
  toNormalized: string;
  isMint: boolean;
  blockNumber: number;
  logIndex: number;
  blockHash?: string;
  transactionHash: string;
  timestampMs: number;
};

export type CanonicalOwnershipResolution =
  | {
      status: 'resolved';
      ownershipEventId: string;
      ownerNormalized: string;
      latest: CanonicalOwnershipEvent;
    }
  | { status: 'incomplete' | 'conflict'; reason: string };

/**
 * A compatibility read is safe only when it returned the complete per-token
 * window and the query itself did not hit its global cap. A sentinel event is
 * represented by `rows.length > maxEvents`.
 */
export function isCanonicalOwnershipHistoryWindowComplete(
  rows: CanonicalOwnershipHistoryRow[],
  options: {
    maxEvents?: number;
    globalTruncated?: boolean;
  } = {},
) {
  const maxEvents = options.maxEvents ?? CANONICAL_OWNERSHIP_HISTORY_EVENT_LIMIT;
  return options.globalTruncated !== true && rows.length <= maxEvents;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function normalized(row: CanonicalOwnershipHistoryRow, key: string) {
  return text(row.normalized?.[key]);
}

function bscAddress(value: string | null) {
  return value && /^0x[0-9a-f]{40}$/.test(value.toLowerCase())
    ? value.toLowerCase()
    : null;
}

type CanonicalRowResult =
  | { kind: 'event'; event: CanonicalOwnershipEvent }
  | { kind: 'invalid'; reason: string }
  | null;

function canonicalRow(
  row: CanonicalOwnershipHistoryRow,
  identity: CanonicalOwnershipIdentity,
): CanonicalRowResult {
  const identityMatches =
    row.eventName === 'Transfer'
    && row.chain === 'BSC'
    && (row.chainId === identity.chainId || Number(row.chainId) === identity.chainId)
    && (row.contractAlias === 'TOKEN' || row.contractAlias === 'TOKEN_V2')
    && text(row.contractAddress)?.toLowerCase() === identity.collectionAddressNormalized
    && normalized(row, 'tokenId') === identity.tokenId;
  if (!identityMatches) return null;
  if (
    row.status !== undefined
    && row.status !== null
    && row.status !== 'projected'
  ) return { kind: 'invalid', reason: 'Transfer no proyectado' };
  const eventId = text(row._id);
  const tokenId = normalized(row, 'tokenId');
  const fromNormalized = bscAddress(normalized(row, 'fromNormalized'));
  const toNormalized = bscAddress(normalized(row, 'toNormalized'));
  const blockNumber = integer(row.blockNumber);
  const logIndex = integer(row.logIndex);
  const timestampMs = integer(row.timestampMs);
  const transactionHash = text(row.txHash)?.toLowerCase();
  const blockHash = row.blockHash === undefined || row.blockHash === null
    ? undefined
    : text(row.blockHash)?.toLowerCase();
  if (
    !eventId
    || !tokenId
    || tokenId !== identity.tokenId
    || !fromNormalized
    || !toNormalized
    || blockNumber === null
    || logIndex === null
    || timestampMs === null
    || !transactionHash
    || (row.blockHash !== undefined && row.blockHash !== null && !blockHash)
  ) return { kind: 'invalid', reason: 'Transfer con evidencia incompleta' };
  return {
    kind: 'event',
    event: {
      eventId,
      tokenId,
      fromNormalized,
      toNormalized,
      isMint: fromNormalized === ZERO_BSC_ADDRESS,
      blockNumber,
      logIndex,
      ...(blockHash ? { blockHash } : {}),
      transactionHash,
      timestampMs,
    },
  };
}

function compare(left: CanonicalOwnershipEvent, right: CanonicalOwnershipEvent) {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber - right.blockNumber;
  return left.logIndex - right.logIndex;
}

function sameEventPayload(left: CanonicalOwnershipEvent, right: CanonicalOwnershipEvent) {
  return left.tokenId === right.tokenId
    && left.fromNormalized === right.fromNormalized
    && left.toNormalized === right.toNormalized
    && left.isMint === right.isMint
    && left.blockNumber === right.blockNumber
    && left.logIndex === right.logIndex
    && left.transactionHash === right.transactionHash
    && left.timestampMs === right.timestampMs
    && (left.blockHash ?? null) === (right.blockHash ?? null);
}

/**
 * Rebuilds the owner from projected Transfer events without trusting
 * lastEventId, metadata or marketplace state. Invalid/incomplete evidence is
 * deliberately fail-closed so callers fall back to the pool.
 */
export function resolveCanonicalOwnershipHistory(
  rows: CanonicalOwnershipHistoryRow[],
  input: CanonicalOwnershipIdentity & { expectedOwnerNormalized: string },
): CanonicalOwnershipResolution {
  const parsed = rows.map((row) => canonicalRow(row, input));
  const invalid = parsed.find((row) => row?.kind === 'invalid');
  if (invalid?.kind === 'invalid') return { status: 'incomplete', reason: invalid.reason };
  const events = parsed
    .flatMap((row) => row?.kind === 'event' ? [row.event] : [])
    .sort(compare);
  if (events.length === 0) return { status: 'incomplete', reason: 'sin Transfer canonicos' };

  const unique: CanonicalOwnershipEvent[] = [];
  const seenIds = new Map<string, CanonicalOwnershipEvent>();
  for (const event of events) {
    const priorById = seenIds.get(event.eventId);
    if (priorById) {
      if (!sameEventPayload(priorById, event)) {
        return { status: 'conflict', reason: 'eventId repetido con evidencia distinta' };
      }
      continue;
    }
    const prior = unique.at(-1);
    if (prior && compare(prior, event) === 0) {
      if (
        prior.eventId !== event.eventId
        || (prior.blockHash && event.blockHash && prior.blockHash !== event.blockHash)
      ) {
        return { status: 'conflict', reason: 'Transfers distintos comparten tuple o blockHash' };
      }
      continue;
    }
    seenIds.set(event.eventId, event);
    unique.push(event);
  }

  let owner: string | null = null;
  let ownershipEventId: string | null = null;
  let latest: CanonicalOwnershipEvent | null = null;
  for (const event of unique) {
    if (!owner) {
      if (!event.isMint) {
        return { status: 'incomplete', reason: 'historial sin mint predecessor' };
      }
      owner = event.toNormalized;
      ownershipEventId = event.eventId;
      latest = event;
      continue;
    }
    if (event.isMint) {
      return { status: 'conflict', reason: 'mint duplicado para el mismo token' };
    }
    if (event.fromNormalized !== owner) {
      return { status: 'conflict', reason: 'Transfer no parte del owner anterior' };
    }
    if (event.fromNormalized !== event.toNormalized) {
      owner = event.toNormalized;
      ownershipEventId = event.eventId;
      latest = event;
    }
  }

  if (!owner || !ownershipEventId || !latest) {
    return { status: 'incomplete', reason: 'historial de ownership incompleto' };
  }
  const expectedOwner = input.expectedOwnerNormalized.toLowerCase();
  if (owner !== expectedOwner) {
    return { status: 'conflict', reason: 'owner del historial no coincide con cukies' };
  }
  return {
    status: 'resolved',
    ownershipEventId,
    ownerNormalized: owner,
    latest,
  };
}
