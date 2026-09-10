import { legacyMarketplaceContracts } from './config';
import type { LegacyMarketplaceCukiItem } from './types';

export type LegacyBreedingNetwork = 'BSC' | 'TRON';

export type LegacyBreedingIdentity = {
  network: LegacyBreedingNetwork;
  chainId: 56 | null;
  collectionAddress: string;
};

type IdentityRecord = {
  network?: unknown;
  chainId?: unknown;
  collectionAddress?: unknown;
  collectionAddressNormalized?: unknown;
  identityVerified?: unknown;
  ownershipVerified?: unknown;
  ownershipSource?: unknown;
  eligibilityVerified?: unknown;
  eligibilitySource?: unknown;
  owner?: unknown;
  ownerNormalized?: unknown;
  state?: unknown;
  origin?: unknown;
  childrenCount?: unknown;
  children?: unknown;
};

function normalizedNetwork(value: unknown): LegacyBreedingNetwork | null {
  const network = typeof value === 'string' ? value.toUpperCase() : null;
  return network === 'BSC' || network === 'TRON' ? network : null;
}

export function getLegacyBreedingIdentity(
  network: unknown,
): LegacyBreedingIdentity | null {
  const normalized = normalizedNetwork(network);
  if (normalized === 'BSC') {
    return {
      network: normalized,
      chainId: 56,
      collectionAddress: legacyMarketplaceContracts.bsc.contracts.token,
    };
  }
  if (normalized === 'TRON') {
    return {
      network: normalized,
      chainId: null,
      collectionAddress: legacyMarketplaceContracts.tron.contracts.token,
    };
  }
  return null;
}

function recordCollection(record: IdentityRecord) {
  for (const value of [record.collectionAddress, record.collectionAddressNormalized]) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return null;
}

function recordChainId(record: IdentityRecord) {
  if (typeof record.chainId === 'number' && Number.isFinite(record.chainId)) {
    return record.chainId;
  }
  if (typeof record.chainId === 'string' && /^\d+$/.test(record.chainId.trim())) {
    return Number(record.chainId.trim());
  }
  return record.chainId === null ? null : undefined;
}

export function normalizeLegacyBreedingOwner(
  network: unknown,
  owner: unknown,
) {
  const identity = getLegacyBreedingIdentity(network);
  if (!identity || typeof owner !== 'string' || owner.trim().length === 0) return null;
  return identity.network === 'BSC'
    ? owner.trim().toLowerCase()
    : owner.trim();
}

export function isLegacyBreedingIdentity(
  record: IdentityRecord,
  network?: unknown,
) {
  const identity = getLegacyBreedingIdentity(network ?? record.network);
  if (!identity || normalizedNetwork(record.network) !== identity.network) return false;

  const chainId = recordChainId(record);
  if (identity.chainId === null) {
    if (chainId !== null) return false;
    const hasExplicitNull = Object.prototype.hasOwnProperty.call(record, 'chainId')
      && chainId === null;
    if (!hasExplicitNull && record.identityVerified !== true) return false;
  } else if (chainId !== identity.chainId) {
    return false;
  }

  const collection = recordCollection(record);
  if (!collection) return false;
  return identity.network === 'BSC'
    ? collection.toLowerCase() === identity.collectionAddress.toLowerCase()
    : collection === identity.collectionAddress;
}

export function isLegacyBreedingOwner(
  record: IdentityRecord,
  network: unknown,
  owner: unknown,
) {
  const identity = getLegacyBreedingIdentity(network);
  if (!identity) return false;
  if (identity.network === 'TRON') {
    const expected = normalizeLegacyBreedingOwner(network, owner);
    const actual = typeof record.owner === 'string' ? record.owner.trim() : null;
    return Boolean(
      expected
      && actual
      && expected === actual,
    );
  }
  const expected = normalizeLegacyBreedingOwner(network, owner);
  const actual = normalizeLegacyBreedingOwner(network, record.ownerNormalized);
  return Boolean(expected && actual && expected === actual);
}

export function isLegacyBreedingEligibilityKnown(
  record: IdentityRecord,
  maxBreeds: number | null,
) {
  if (maxBreeds === null || !Number.isFinite(maxBreeds) || maxBreeds < 0) return false;
  if (
    record.eligibilityVerified !== true
    || record.eligibilitySource !== 'legacy-getNumBreedsByCukie'
  ) {
    return false;
  }
  if (typeof record.childrenCount !== 'number' || !Number.isFinite(record.childrenCount)) {
    return false;
  }
  return true;
}

export function isLegacyBreedingEligible(
  record: IdentityRecord,
  network: unknown,
  maxBreeds: number | null,
) {
  if (!isLegacyBreedingEligibilityKnown(record, maxBreeds)) return false;
  const identity = getLegacyBreedingIdentity(network);
  if (!identity) return false;
  const childrenCount = record.childrenCount;
  return typeof childrenCount === 'number'
    // The current getNumBreedsByCukie value is authoritative, but the
    // historical BSC +1 offset was only proven for the indexed aggregate.
    // Keep the boundary conservative until the contract semantics are proven.
    && childrenCount < maxBreeds!;
}

export function isLegacyBreedingCandidate(
  record: IdentityRecord | LegacyMarketplaceCukiItem,
  network: unknown,
  owner: unknown,
  maxBreeds: number | null,
) {
  return record.state === 'available'
    && record.ownershipVerified === true
    && record.ownershipSource === 'legacy-ownerOf'
    && isLegacyBreedingIdentity(record, network)
    && isLegacyBreedingOwner(record, network, owner)
    && isLegacyBreedingEligible(record, network, maxBreeds);
}

export function isLegacyCompletedBreed(
  record: IdentityRecord | LegacyMarketplaceCukiItem,
  owner: unknown,
) {
  return record.origin === 'breed'
    && record.ownershipVerified === true
    && record.ownershipSource === 'legacy-ownerOf'
    && isLegacyBreedingIdentity(record)
    && isLegacyBreedingOwner(record, record.network, owner);
}
