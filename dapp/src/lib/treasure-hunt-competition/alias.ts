import { createHash, createHmac } from 'node:crypto';

const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export type CompetitionAliasValidation =
  | { readonly valid: true; readonly alias: string; readonly canonicalAlias: string }
  | { readonly valid: false; readonly reason: 'length' | 'characters' | 'wallet_like' };

export function normalizeCompetitionAlias(alias: string) {
  return alias.trim().toLowerCase();
}

export function validateCompetitionAlias(alias: string): CompetitionAliasValidation {
  const trimmed = alias.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return { valid: false, reason: 'length' };
  }
  if (!ALIAS_PATTERN.test(trimmed)) {
    return { valid: false, reason: 'characters' };
  }
  if (/^0x/i.test(trimmed)) {
    return { valid: false, reason: 'wallet_like' };
  }

  return {
    valid: true,
    alias: trimmed,
    canonicalAlias: normalizeCompetitionAlias(trimmed),
  };
}

export function generateCompetitionAlias(walletAddress: string) {
  const normalizedWallet = walletAddress.trim().toLowerCase();
  if (!normalizedWallet) throw new Error('Wallet address is required to generate an alias');

  const walletHex = normalizedWallet.replace(/^0x/, '');
  const directFragments = new Set<string>();
  for (let index = 0; index <= walletHex.length - 6; index += 1) {
    directFragments.add(walletHex.slice(index, index + 6));
  }

  const digest = createHash('sha256')
    .update(`cukies-treasure-hunt-alias-v1:${normalizedWallet}`)
    .digest('hex');
  let suffix = '';
  for (let index = 0; index <= digest.length - 6; index += 6) {
    const candidate = digest.slice(index, index + 6);
    if (!directFragments.has(candidate)) {
      suffix = candidate;
      break;
    }
  }
  if (!suffix) suffix = digest.slice(0, 6);

  return `Hunter-${suffix.toUpperCase()}`;
}

/**
 * Generates the default alias persisted by the server. Unlike
 * `generateCompetitionAlias`, this value cannot be recomputed from a public
 * wallet address without the deployment secret. The 13 case-insensitive
 * base32 characters carry 65 bits while exactly fitting the alias length
 * limit. Using one case avoids losing entropy in the canonical alias index.
 */
export function generatePrivateCompetitionAlias(input: {
  readonly campaignId: string;
  readonly walletAddress: string;
  readonly secret: string;
  readonly collisionNonce?: number;
}) {
  if (input.secret.length < 32) {
    throw new Error('Competition alias secret must contain at least 32 characters');
  }
  const campaignId = input.campaignId.trim();
  const walletAddress = input.walletAddress.trim().toLowerCase();
  const collisionNonce = input.collisionNonce ?? 0;
  if (!campaignId) throw new Error('Campaign id is required to generate a private alias');
  if (!walletAddress) throw new Error('Wallet address is required to generate a private alias');
  if (!Number.isSafeInteger(collisionNonce) || collisionNonce < 0) {
    throw new Error('Competition alias collision nonce must be a non-negative integer');
  }

  const digest = createHmac('sha256', input.secret)
    .update(`cukies-treasure-hunt-private-alias-v1:${campaignId}:${walletAddress}:${collisionNonce}`)
    .digest();
  let suffix = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of digest) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && suffix.length < 13) {
      bits -= 5;
      suffix += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
    if (suffix.length === 13) break;
  }
  return `Hunter-${suffix}`;
}
