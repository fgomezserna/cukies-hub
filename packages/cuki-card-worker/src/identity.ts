import { createHash } from 'node:crypto';

import type { AssetIdentityContext, CukiDocument } from './types.js';

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isTronNetwork(network: string) {
  return network.toLowerCase().startsWith('tron');
}

export function validateAssetIdentityContext(context: AssetIdentityContext) {
  if (!nonEmptyString(context.network)) throw new Error('El contexto de identidad necesita network.');
  if (!Number.isSafeInteger(context.chainId) || context.chainId <= 0) {
    throw new Error('El contexto de identidad necesita un chainId positivo.');
  }
  if (!nonEmptyString(context.collectionAddressNormalized)) {
    throw new Error('El contexto de identidad necesita una colección.');
  }
  return context;
}

function identityParts(cuki: CukiDocument, context?: AssetIdentityContext) {
  const network = nonEmptyString(cuki.network) ?? nonEmptyString(cuki.chain) ?? context?.network.trim();
  const resolvedChainId = cuki.chainId ?? context?.chainId;
  const collection = nonEmptyString(cuki.collectionAddressNormalized)
    ?? context?.collectionAddressNormalized.trim();
  const tokenId = nonEmptyString(cuki.tokenId);

  if (!network || typeof resolvedChainId !== 'number' || !Number.isSafeInteger(resolvedChainId) || resolvedChainId <= 0 || !collection || !tokenId) return null;
  const normalizedCollection = isTronNetwork(network) ? collection : collection.toLowerCase();
  return { network: network.toLowerCase(), chainId: resolvedChainId, collection: normalizedCollection, tokenId };
}

export function canonicalAssetIdentity(cuki: CukiDocument, context?: AssetIdentityContext) {
  if (context) validateAssetIdentityContext(context);
  const parts = identityParts(cuki, context);
  if (!parts) return null;
  return `${parts.network}:${parts.chainId}:${parts.collection}:${parts.tokenId}`;
}

export function cukiInputFingerprint(cuki: CukiDocument) {
  const source = {
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
