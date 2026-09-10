import { isAddress } from 'viem';

import type { ChainEvent, ChainName } from '../types.js';
import { normalizeAddress } from '../utils/json.js';

const ZERO_BSC_ADDRESS = '0x0000000000000000000000000000000000000000';

export type NftOwnershipEvidence = {
  eventId: string;
  chain: ChainName;
  chainId?: number;
  contractAlias: string;
  contractAddress: string;
  collectionAddressNormalized: string;
  tokenId: string;
  from: string;
  to: string;
  fromNormalized: string;
  toNormalized: string;
  isMint: boolean;
  blockNumber: number;
  logIndex: number;
  blockHash?: string;
  transactionHash: string;
  timestampMs: number;
};

export type NftOwnershipEvidenceResult =
  | { ok: true; evidence: NftOwnershipEvidence }
  | { ok: false; reason: string };

export type NftOwnershipProjectionState = {
  chain?: unknown;
  network?: unknown;
  chainId?: unknown;
  collectionAddressNormalized?: unknown;
  tokenId?: unknown;
  ownerNormalized?: unknown;
  ownershipEventId?: unknown;
  ownershipEventBlockNumber?: unknown;
  ownershipEventLogIndex?: unknown;
  ownershipEventBlockHash?: unknown;
  ownershipObservedBlockNumber?: unknown;
  ownershipObservedLogIndex?: unknown;
  ownershipObservedBlockHash?: unknown;
  lastBlockNumber?: unknown;
  lastLogIndex?: unknown;
};

export type NftOwnershipProjectionDecision =
  | {
      kind: 'apply';
      nextOwnershipEventId: string;
      rotatesOwnership: boolean;
    }
  | {
      kind: 'duplicate';
      nextOwnershipEventId: string;
      rotatesOwnership: false;
    }
  | {
      kind: 'stale';
      nextOwnershipEventId: string | null;
      rotatesOwnership: false;
    }
  | { kind: 'conflict'; reason: string };

function nonEmptyText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function safeInteger(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function normalizedTransferField(
  event: ChainEvent,
  field: 'from' | 'to',
  raw: string,
) {
  return nonEmptyText(event.normalized[`${field}Normalized`])
    ?? nonEmptyText(normalizeAddress(event.chain, raw));
}

/**
 * Extracts only evidence that can establish token ownership. Metadata,
 * listings and TokenBought payloads deliberately cannot enter this function.
 */
export function buildNftOwnershipEvidence(event: ChainEvent): NftOwnershipEvidenceResult {
  if (event.chain !== 'BSC') return { ok: false, reason: 'ownership canonico solo BSC' };
  if (event.eventName !== 'Transfer') return { ok: false, reason: 'no es Transfer' };
  const eventId = nonEmptyText(event._id);
  const tokenId = nonEmptyText(event.normalized.tokenId) ?? nonEmptyText(event.args.tokenId);
  const from = nonEmptyText(event.normalized.from) ?? nonEmptyText(event.args.from);
  const to = nonEmptyText(event.normalized.to) ?? nonEmptyText(event.args.to);
  const fromNormalized = from ? normalizedTransferField(event, 'from', from) : null;
  const toNormalized = to ? normalizedTransferField(event, 'to', to) : null;
  const blockNumber = safeInteger(event.blockNumber);
  const logIndex = safeInteger(event.logIndex);
  const timestampMs = safeInteger(event.timestampMs);
  const transactionHash = nonEmptyText(event.txHash);
  const blockHash = event.blockHash === undefined || event.blockHash === null
    ? undefined
    : nonEmptyText(event.blockHash);

  if (!eventId || !tokenId || !from || !to || !fromNormalized || !toNormalized) {
    return { ok: false, reason: 'Transfer sin identidad de token o wallets canonicas' };
  }
  if (blockNumber === null || logIndex === null || timestampMs === null || !transactionHash) {
    return { ok: false, reason: 'Transfer sin tuple bloque/log/timestamp canonica' };
  }
  if (event.blockHash !== undefined && event.blockHash !== null && !blockHash) {
    return { ok: false, reason: 'Transfer con blockHash invalido' };
  }
  if (event.chainId !== 56 && event.chainId !== 97) {
    return { ok: false, reason: 'Transfer BSC sin chainId 56/97' };
  }
  if (!isAddress(event.contractAddress) || /^0x0{40}$/i.test(event.contractAddress)) {
    return { ok: false, reason: 'Transfer BSC sin collection address valida' };
  }
  if (!isAddress(fromNormalized) || !isAddress(toNormalized)) {
    return { ok: false, reason: 'Transfer BSC con wallet no canonica' };
  }

  const normalizedZero = ZERO_BSC_ADDRESS;
  return {
    ok: true,
    evidence: {
      eventId,
      chain: event.chain,
      chainId: event.chainId,
      contractAlias: event.contractAlias,
      contractAddress: event.contractAddress,
      collectionAddressNormalized: event.contractAddress.toLowerCase(),
      tokenId,
      from,
      to,
      fromNormalized,
      toNormalized,
      isMint: fromNormalized.toLowerCase() === normalizedZero,
      blockNumber,
      logIndex,
      ...(blockHash ? { blockHash: blockHash.toLowerCase() } : {}),
      transactionHash: transactionHash.toLowerCase(),
      timestampMs,
    },
  };
}

type Tuple = { blockNumber: number; logIndex: number };

function tupleFromState(state: NftOwnershipProjectionState): Tuple | null {
  const blockNumber = safeInteger(
    state.ownershipObservedBlockNumber
      ?? state.ownershipEventBlockNumber
      ?? state.lastBlockNumber,
  );
  const logIndex = safeInteger(
    state.ownershipObservedLogIndex
      ?? state.ownershipEventLogIndex
      ?? state.lastLogIndex,
  );
  return blockNumber === null || logIndex === null ? null : { blockNumber, logIndex };
}

function tupleCompare(left: Tuple, right: Tuple) {
  if (left.blockNumber !== right.blockNumber) return left.blockNumber - right.blockNumber;
  return left.logIndex - right.logIndex;
}

function stateText(value: unknown) {
  return nonEmptyText(value);
}

function stateBlockHash(state: NftOwnershipProjectionState) {
  return stateText(
    state.ownershipObservedBlockHash
      ?? state.ownershipEventBlockHash,
  )?.toLowerCase() ?? null;
}

function stateIdentityConflict(
  state: NftOwnershipProjectionState,
  evidence: NftOwnershipEvidence,
) {
  for (const candidate of [state.chain, state.network]) {
    if (
      candidate !== undefined
      && candidate !== null
      && nonEmptyText(candidate)?.toUpperCase() !== evidence.chain
    ) return 'network distinta';
  }
  if (state.chainId !== undefined && state.chainId !== null
    && Number(state.chainId) !== evidence.chainId) return 'chainId distinta';
  if (state.collectionAddressNormalized
    && (evidence.chain === 'BSC'
      ? String(state.collectionAddressNormalized).toLowerCase()
        !== evidence.collectionAddressNormalized.toLowerCase()
      : String(state.collectionAddressNormalized)
        !== evidence.collectionAddressNormalized)) {
    return 'collection distinta';
  }
  if (state.tokenId !== undefined && state.tokenId !== null
    && String(state.tokenId) !== evidence.tokenId) return 'tokenId distinto';
  return null;
}

function currentOwner(state: NftOwnershipProjectionState) {
  return stateText(state.ownerNormalized)?.toLowerCase() ?? null;
}

/**
 * Decides whether a Transfer may advance the projected owner. The decision is
 * pure so retries, reorg checks and compatibility tests share the same rules.
 */
export function decideNftOwnershipProjection(
  state: NftOwnershipProjectionState,
  evidence: NftOwnershipEvidence,
): NftOwnershipProjectionDecision {
  if (evidence.chain !== 'BSC') {
    return { kind: 'conflict', reason: 'ownership canonico solo BSC' };
  }
  const identityConflict = stateIdentityConflict(state, evidence);
  if (identityConflict) return { kind: 'conflict', reason: identityConflict };

  const eventId = stateText(state.ownershipEventId);
  const observedTuple = tupleFromState(state);
  const eventTuple = { blockNumber: evidence.blockNumber, logIndex: evidence.logIndex };
  const observedComparison = observedTuple ? tupleCompare(eventTuple, observedTuple) : null;
  const observedHash = stateBlockHash(state);
  if (
    observedComparison === 0
    && observedHash
    && evidence.blockHash
    && observedHash !== evidence.blockHash.toLowerCase()
  ) {
    return { kind: 'conflict', reason: 'blockHash distinto en la misma tuple de ownership' };
  }

  if (eventId === evidence.eventId) {
    const ownershipHash = stateText(state.ownershipEventBlockHash)?.toLowerCase() ?? null;
    if (
      ownershipHash
      && evidence.blockHash
      && ownershipHash !== evidence.blockHash.toLowerCase()
    ) {
      return { kind: 'conflict', reason: 'ownershipEventId reorg con blockHash distinto' };
    }
    const owner = currentOwner(state);
    if (owner && owner !== evidence.toNormalized.toLowerCase()) {
      return { kind: 'conflict', reason: 'ownershipEventId ya proyectado con owner distinto' };
    }
    return { kind: 'duplicate', nextOwnershipEventId: eventId, rotatesOwnership: false };
  }

  if (observedComparison !== null && observedComparison < 0) {
    return { kind: 'stale', nextOwnershipEventId: eventId, rotatesOwnership: false };
  }
  if (observedComparison === 0) {
    return { kind: 'conflict', reason: 'dos Transfers distintos comparten la misma tuple' };
  }

  const owner = currentOwner(state);
  if (owner) {
    if (evidence.isMint) {
      if (owner !== evidence.toNormalized.toLowerCase()) {
        return { kind: 'conflict', reason: 'mint contradice el owner proyectado' };
      }
      if (eventId) {
        return { kind: 'conflict', reason: 'mint distinto sobre un ownershipEventId existente' };
      }
    } else if (owner !== evidence.fromNormalized.toLowerCase()) {
      return { kind: 'conflict', reason: 'Transfer no parte del owner proyectado' };
    }
  }

  const rotatesOwnership = evidence.isMint || evidence.fromNormalized !== evidence.toNormalized;
  return {
    kind: 'apply',
    nextOwnershipEventId: rotatesOwnership || !eventId ? evidence.eventId : eventId,
    rotatesOwnership,
  };
}

export function nftOwnershipProjectionValues(
  evidence: NftOwnershipEvidence,
  decision: Extract<NftOwnershipProjectionDecision, { kind: 'apply' }>,
  state: NftOwnershipProjectionState,
) {
  const currentEventId = stateText(state.ownershipEventId);
  const ownershipChanged = decision.nextOwnershipEventId !== currentEventId;
  return {
    ownershipEventId: decision.nextOwnershipEventId,
    ownershipObservedEventId: evidence.eventId,
    ownershipObservedBlockNumber: evidence.blockNumber,
    ownershipObservedLogIndex: evidence.logIndex,
    ...(evidence.blockHash ? { ownershipObservedBlockHash: evidence.blockHash } : {}),
    ...(ownershipChanged
      ? {
          ownershipEventBlockNumber: evidence.blockNumber,
          ownershipEventLogIndex: evidence.logIndex,
          ...(evidence.blockHash ? { ownershipEventBlockHash: evidence.blockHash } : {}),
          ownershipEventTransactionHash: evidence.transactionHash,
          ownershipEventTimestampMs: evidence.timestampMs,
          ownershipEventFromNormalized: evidence.fromNormalized,
          ownershipEventToNormalized: evidence.toNormalized,
        }
      : {}),
  };
}
