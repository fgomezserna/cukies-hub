import { LEGACY_CONTRACTS, legacyContractAddress, type LegacyContractAlias } from './contracts.js';
import type { ChainEvent, ChainName } from '../types.js';

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
  const collection = legacyCollectionAddress(event);
  const network = event.chain === 'BSC' ? String(event.chainId ?? 56) : 'mainnet';
  return {
    chain: event.chain,
    chainId: event.chain === 'BSC' ? Number(event.chainId ?? 56) : undefined,
    collectionAddress: collection,
    collectionAddressNormalized: event.chain === 'BSC' ? collection.toLowerCase() : collection,
    tokenId,
    documentId: `${event.chain}:${network}:${event.chain === 'BSC' ? collection.toLowerCase() : collection}:${tokenId}`,
  };
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
    tokenId,
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
