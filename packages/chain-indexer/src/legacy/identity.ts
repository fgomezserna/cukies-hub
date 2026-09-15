import { LEGACY_CONTRACTS, legacyContractAddress, type LegacyContractAlias } from './contracts.js';
import type { ChainEvent, ChainName } from '../types.js';

export type LegacyCukieIdentity = {
  /** Canonical chain label persisted on the materialized document. */
  chain: ChainName;
  /** BSC legacy is chain 56; TRON has no EVM chainId. */
  chainId?: 56;
  /** Canonical legacy network label persisted on the materialized document. */
  network: ChainName;
  /** Runtime identity segment (`56` for BSC or `mainnet` for TRON). */
  networkKey: '56' | 'mainnet';
  collectionAddress: string;
  collectionAddressNormalized: string;
  tokenId: string;
  documentId: string;
};

/**
 * Normalize a legacy network label without accepting testnet or arbitrary
 * values. Legacy metadata is sourced from BSC mainnet (chain 56) and TRON
 * mainnet only; the persisted `network` label remains BSC/TRON for consumers.
 */
export function normalizeLegacyNetwork(value: unknown): ChainName | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return normalized === 'BSC' || normalized === 'TRON' ? normalized : null;
}

/**
 * Return a canonical non-negative decimal token id. Numeric BSON ids are
 * accepted when they are safe integers; strings with leading zeroes are
 * canonicalized so they cannot create a second materialized document.
 */
export function normalizeLegacyTokenId(value: unknown): string | null {
  if (typeof value === 'bigint') {
    return value >= 0n ? value.toString(10) : null;
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? String(value) : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    return BigInt(trimmed).toString(10);
  } catch {
    return null;
  }
}

/**
 * Build the one canonical identity shared by legacy metadata import and
 * runtime legacy NFT projections. `null` is returned for malformed source
 * rows so an importer can skip them without creating an unsafe destination.
 */
export function tryLegacyCukieIdentity(
  network: unknown,
  tokenId: unknown,
): LegacyCukieIdentity | null {
  const chain = normalizeLegacyNetwork(network);
  const normalizedTokenId = normalizeLegacyTokenId(tokenId);
  if (!chain || !normalizedTokenId) return null;

  const collectionAddress = LEGACY_CONTRACTS[chain].TOKEN;
  if (!collectionAddress) return null;
  const networkKey = chain === 'BSC' ? '56' : 'mainnet';
  const collectionAddressNormalized = chain === 'BSC'
    ? collectionAddress.toLowerCase()
    : collectionAddress;

  return {
    chain,
    ...(chain === 'BSC' ? { chainId: 56 as const } : {}),
    network: chain,
    networkKey,
    collectionAddress,
    collectionAddressNormalized,
    tokenId: normalizedTokenId,
    documentId: `${chain}:${networkKey}:${collectionAddressNormalized}:${normalizedTokenId}`,
  };
}

/** Strict form for callers that are projecting an already validated event. */
export function legacyCukieIdentity(network: unknown, tokenId: unknown): LegacyCukieIdentity {
  const identity = tryLegacyCukieIdentity(network, tokenId);
  if (!identity) {
    throw new Error(`Identidad Cukie legacy invalida: network=${String(network)} tokenId=${String(tokenId)}.`);
  }
  return identity;
}

// Descriptive alias for importers and external callers that deal in metadata.
export const legacyMetadataIdentity = legacyCukieIdentity;

export function isLegacyEvent(event: Pick<ChainEvent, 'runtimeScope'>) {
  return event.runtimeScope === 'legacy';
}

export function legacyCollectionAddress(event: Pick<ChainEvent, 'chain' | 'contractAlias' | 'contractAddress' | 'normalized' | 'args'>) {
  const canonical = legacyContractAddress(event.chain, 'TOKEN');
  if (!canonical) throw new Error(`No hay TOKEN legacy canónico para ${event.chain}.`);
  const explicit = event.normalized.collectionNormalized ?? event.args.collectionNormalized;
  if (typeof explicit === 'string' && explicit.length > 0) {
    const matches = event.chain === 'BSC'
      ? explicit.toLowerCase() === canonical.toLowerCase()
      : explicit === canonical;
    if (!matches) throw new Error(`La colección NFT legacy debe ser TOKEN canónico en ${event.chain}.`);
    return explicit;
  }
  return canonical;
}

export function legacyNftIdentity(event: Pick<ChainEvent, 'chain' | 'chainId' | 'contractAlias' | 'contractAddress' | 'normalized' | 'args'>, tokenId: string) {
  if (event.chain === 'BSC' && event.chainId !== undefined && event.chainId !== 56) {
    throw new Error(`Identidad Cukie legacy BSC exige chainId 56, recibido ${String(event.chainId)}.`);
  }
  if (event.chain === 'TRON' && event.chainId !== undefined) {
    throw new Error('Identidad Cukie legacy TRON no admite chainId EVM.');
  }
  // Validate an explicitly supplied collection while deriving the materialized
  // address from the canonical TOKEN manifest, not from event casing.
  legacyCollectionAddress(event);
  return legacyCukieIdentity(event.chain, tokenId);
}

export function legacyNftDocumentId(event: Pick<ChainEvent, 'chain' | 'chainId' | 'contractAlias' | 'contractAddress' | 'normalized' | 'args'>, tokenId: string) {
  return legacyNftIdentity(event, tokenId).documentId;
}

export function legacyListingIdentity(event: Pick<ChainEvent, 'chain' | 'chainId' | 'contractAlias' | 'contractAddress' | 'normalized' | 'args'>, tokenId: string) {
  const identity = legacyNftIdentity(event, tokenId);
  return {
    chain: identity.chain,
    ...(identity.chainId === undefined ? {} : { chainId: identity.chainId }),
    collectionAddressNormalized: identity.collectionAddressNormalized,
    tokenId: identity.tokenId,
  };
}

export function legacyListingDocumentId(event: Pick<ChainEvent, 'chain' | 'chainId' | 'contractAlias' | 'contractAddress' | 'normalized' | 'args'>, tokenId: string) {
  const identity = legacyNftIdentity(event, tokenId);
  return `listing:${identity.documentId}`;
}

export function legacyPointsIdentity(event: Pick<ChainEvent, 'chain' | 'normalized' | 'args'>, walletNormalized: string) {
  const pointsAddress = LEGACY_CONTRACTS[event.chain].POINTS;
  return `${event.chain}:${event.chain === 'BSC' ? pointsAddress.toLowerCase() : pointsAddress}:${walletNormalized}`;
}

export function assertLegacyContractIdentity(event: ChainEvent, alias: LegacyContractAlias) {
  const expected = legacyContractAddress(event.chain, alias);
  const matches = event.chain === 'BSC'
    ? event.contractAddress.toLowerCase() === expected?.toLowerCase()
    : event.contractAddress === expected;
  if (!expected || !matches) {
    throw new Error(`${alias} legacy no coincide con la address canónica de ${event.chain}.`);
  }
  if (event.chain === 'BSC' && event.chainId !== 56) {
    throw new Error(`${alias} legacy BSC exige chainId 56.`);
  }
  return legacyContractProofTuple(event, alias);
}

function legacyContractProofTuple(event: ChainEvent, alias: LegacyContractAlias) {
  return {
    chain: event.chain,
    chainId: event.chain === 'BSC' ? 56 : undefined,
    contractAlias: alias,
    contractAddress: event.contractAddress,
  };
}

export function legacyChainKey(chain: ChainName) {
  return chain === 'BSC' ? 'BSC:56' : 'TRON:mainnet';
}
