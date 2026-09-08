import { createHash } from 'node:crypto';

import type { AssetIdentityContext, CukiDocument } from './types.js';

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

export function validateAssetIdentityContext(context: AssetIdentityContext) {
  const network = nonEmptyString(context.network)?.toUpperCase();
  if (network !== 'BSC' && network !== 'TRON') {
    throw new Error('El contexto de identidad necesita network BSC o TRON.');
  }
  if (!nonEmptyString(context.collectionAddressNormalized)) {
    throw new Error('El contexto de identidad necesita una colección.');
  }
  if (network === 'BSC') {
    const chainId = context.chainId;
    if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new Error('El contexto BSC necesita un chainId positivo.');
    }
  }
  if (network === 'TRON' && context.chainId !== undefined) {
    throw new Error('El contexto TRON canónico usa mainnet y no admite chainId EVM.');
  }
  return context;
}

function sourceDocumentNetwork(cuki: CukiDocument) {
  const chain = nonEmptyString(cuki.chain)?.toUpperCase();
  const network = nonEmptyString(cuki.network)?.toUpperCase();
  if (chain === 'TRON' || network === 'TRON') return 'TRON';
  if (chain === 'BSC' || network === 'BSC') return 'BSC';
  return null;
}

function identityParts(cuki: CukiDocument, context?: AssetIdentityContext) {
  const contextNetwork = context?.network.trim().toUpperCase();
  const documentChain = nonEmptyString(cuki.chain)?.toUpperCase();
  const documentNetwork = nonEmptyString(cuki.network)?.toUpperCase();
  if (
    documentChain && documentNetwork
    && (documentChain === 'BSC' || documentChain === 'TRON')
    && (documentNetwork === 'BSC' || documentNetwork === 'TRON')
    && documentChain !== documentNetwork
  ) return null;
  const sourceNetwork = sourceDocumentNetwork(cuki);
  const network = sourceNetwork ?? contextNetwork;
  const collection = nonEmptyString(cuki.collectionAddressNormalized)
    ?? context?.collectionAddressNormalized.trim();
  const tokenId = nonEmptyString(cuki.tokenId);

  if (!network || !collection || !tokenId) return null;
  if (contextNetwork && sourceNetwork && sourceNetwork !== contextNetwork) return null;

  if (network === 'TRON') {
    if (cuki.chainId !== undefined || (context && context.chainId !== undefined)) return null;
    if (context && cuki.collectionAddressNormalized && cuki.collectionAddressNormalized !== context.collectionAddressNormalized) return null;
    return { network: 'tron', scope: 'mainnet', collection, tokenId };
  }

  if (network !== 'BSC') return null;
  const chainId = cuki.chainId ?? context?.chainId;
  if (typeof chainId !== 'number' || !Number.isSafeInteger(chainId) || chainId <= 0) return null;
  if (context && cuki.chainId !== undefined && cuki.chainId !== context.chainId) return null;
  if (context && cuki.collectionAddressNormalized && cuki.collectionAddressNormalized.toLowerCase() !== context.collectionAddressNormalized.toLowerCase()) return null;
  return { network: 'bsc', scope: String(chainId), collection: collection.toLowerCase(), tokenId };
}

export function canonicalAssetIdentity(cuki: CukiDocument, context?: AssetIdentityContext) {
  if (context) validateAssetIdentityContext(context);
  const parts = identityParts(cuki, context);
  if (!parts) return null;
  return `${parts.network}:${parts.scope}:${parts.collection}:${parts.tokenId}`;
}

export function cukiInputFingerprint(cuki: CukiDocument, context?: AssetIdentityContext) {
  const source = {
    assetIdentity: canonicalAssetIdentity(cuki, context),
    tokenId: cuki.tokenId ?? null,
    network: cuki.network ?? null,
    chain: cuki.chain ?? null,
    chainId: cuki.chainId ?? null,
    collectionAddressNormalized: cuki.collectionAddressNormalized ?? null,
    type: cuki.type ?? null,
    rarity: cuki.rarity ?? null,
    generation: cuki.generation ?? null,
    skills: cuki.skills ?? null,
  };
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}
