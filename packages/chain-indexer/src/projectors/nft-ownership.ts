import { isAddress } from 'viem';

import type { ChainEvent, ChainName } from '../types.js';
import { normalizeAddress } from '../utils/json.js';

const ZERO_BSC_ADDRESS = '0x0000000000000000000000000000000000000000';
// Base58 is case-sensitive. Keep the canonical Tron zero address rather than
// the all-uppercase display form used by the legacy generic normalizer.
const ZERO_TRON_ADDRESS = 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb';

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
  // TRON addresses are Base58 and case-sensitive. The generic normalizer
  // uppercases TRON values for legacy wallet comparisons, so ownership keeps
  // the raw canonical Base58 value here instead of changing its identity.
  if (event.chain === 'TRON') {
    // Older imported rows may contain the zero address in the generic
    // upper-case form. Canonicalize only this well-known sentinel so mint
    // detection remains correct while real owners retain their exact case.
    return raw.toUpperCase() === ZERO_TRON_ADDRESS.toUpperCase()
      ? ZERO_TRON_ADDRESS
      : raw;
  }
  return nonEmptyText(event.normalized[`${field}Normalized`])
    ?? nonEmptyText(normalizeAddress(event.chain, raw));
}

function zeroAddress(chain: ChainName) {
  return chain === 'BSC' ? ZERO_BSC_ADDRESS : ZERO_TRON_ADDRESS;
}

/**
 * Extracts only evidence that can establish token ownership. Metadata,
 * listings and TokenBought payloads deliberately cannot enter this function.
 */
export function buildNftOwnershipEvidence(event: ChainEvent): NftOwnershipEvidenceResult {
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
  if (event.chain === 'BSC') {
    if (event.chainId !== 56 && event.chainId !== 97) {
      return { ok: false, reason: 'Transfer BSC sin chainId 56/97' };
    }
    if (!isAddress(event.contractAddress) || /^0x0{40}$/i.test(event.contractAddress)) {
      return { ok: false, reason: 'Transfer BSC sin collection address valida' };
    }
    if (!isAddress(fromNormalized) || !isAddress(toNormalized)) {
      return { ok: false, reason: 'Transfer BSC con wallet no canonica' };
    }
  }

  const normalizedZero = zeroAddress(event.chain);
  return {
    ok: true,
    evidence: {
      eventId,
      chain: event.chain,
      ...(event.chain === 'BSC' && event.chainId !== undefined
        ? { chainId: event.chainId }
        : {}),
      contractAlias: event.contractAlias,
      contractAddress: event.contractAddress,
      collectionAddressNormalized: event.chain === 'BSC'
        ? event.contractAddress.toLowerCase()
        : event.contractAddress,
      tokenId,
      from,
      to,
      fromNormalized,
      toNormalized,
      isMint: event.chain === 'BSC'
        ? fromNormalized.toLowerCase() === normalizedZero
        : fromNormalized === normalizedZero,
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
  if (state.chainId !== undefined && state.chainId !== null) {
    if (evidence.chain !== 'BSC' || Number(state.chainId) !== evidence.chainId) {
      return 'chainId distinta';
    }
  }
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

function comparableOwner(chain: ChainName, value: unknown) {
  const owner = stateText(value);
  return owner && chain === 'BSC' ? owner.toLowerCase() : owner;
}

function ownersEqual(chain: ChainName, left: unknown, right: unknown) {
  const leftComparable = comparableOwner(chain, left);
  const rightComparable = comparableOwner(chain, right);
  return leftComparable !== null
    && rightComparable !== null
    && leftComparable === rightComparable;
}

function currentOwner(state: NftOwnershipProjectionState, chain: ChainName) {
  return comparableOwner(chain, state.ownerNormalized);
}

/**
 * Decides whether a Transfer may advance the projected owner. The decision is
 * pure so retries, reorg checks and compatibility tests share the same rules.
 */
export function decideNftOwnershipProjection(
  state: NftOwnershipProjectionState,
  evidence: NftOwnershipEvidence,
): NftOwnershipProjectionDecision {
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
    const owner = currentOwner(state, evidence.chain);
    if (owner && !ownersEqual(evidence.chain, owner, evidence.toNormalized)) {
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

  const owner = currentOwner(state, evidence.chain);
  if (owner) {
    if (evidence.isMint) {
      if (!ownersEqual(evidence.chain, owner, evidence.toNormalized)) {
        return { kind: 'conflict', reason: 'mint contradice el owner proyectado' };
      }
      if (eventId) {
        return { kind: 'conflict', reason: 'mint distinto sobre un ownershipEventId existente' };
      }
    } else if (!ownersEqual(evidence.chain, owner, evidence.fromNormalized)) {
      return { kind: 'conflict', reason: 'Transfer no parte del owner proyectado' };
    }
  }

  const rotatesOwnership = evidence.isMint
    || !ownersEqual(evidence.chain, evidence.fromNormalized, evidence.toNormalized);
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
