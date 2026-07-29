import { createHash, createHmac } from 'node:crypto';

const ALIAS_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LEGACY_GENERATED_ALIAS_PATTERN = /^Hunter-[A-Z0-9]{6,13}$/i;
const ALIAS_ADJECTIVES = [
  'Aero', 'Amber', 'Aqua', 'Astro', 'Bold', 'Brave', 'Coral', 'Cuki',
  'Dusk', 'Ember', 'Epic', 'Frost', 'Gold', 'Lunar', 'Mint', 'Neon',
  'Nova', 'Onyx', 'Rapid', 'Rogue', 'Solar', 'Sonic', 'Star', 'Storm',
  'Swift', 'Turbo', 'Ultra', 'Vivid', 'Wild', 'Zen', 'Zesty', 'Lucky',
] as const;
const ALIAS_NOUNS = [
  'Ace', 'Bear', 'Blaze', 'Bolt', 'Comet', 'Crow', 'Fox', 'Gem',
  'Ghost', 'Hawk', 'Hero', 'Lynx', 'Mage', 'Moon', 'Ninja', 'Orb',
  'Panda', 'Pixel', 'Quest', 'Rune', 'Shark', 'Spark', 'Tiger', 'Titan',
  'Vault', 'Wolf', 'Whale', 'Wisp', 'Yeti', 'Scout', 'Rider', 'Crown',
] as const;

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

function base32Suffix(digest: Buffer, length = 8) {
  let suffix = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of digest) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5 && suffix.length < length) {
      bits -= 5;
      suffix += BASE32_ALPHABET[(buffer >>> bits) & 31];
    }
    if (suffix.length === length) break;
  }
  return suffix;
}

function aliasFromDigest(digest: Buffer) {
  const adjective = ALIAS_ADJECTIVES[digest[0] & 31];
  const noun = ALIAS_NOUNS[digest[1] & 31];
  return `${adjective}${noun}-${base32Suffix(digest.subarray(2))}`;
}

export function generateCompetitionAlias(walletAddress: string) {
  const normalizedWallet = walletAddress.trim().toLowerCase();
  if (!normalizedWallet) throw new Error('Wallet address is required to generate an alias');

  const digest = createHash('sha256')
    .update(`cukies-treasure-hunt-alias-v2:${normalizedWallet}`)
    .digest();
  return aliasFromDigest(digest);
}

export function displayCompetitionAlias(alias: string) {
  if (!LEGACY_GENERATED_ALIAS_PATTERN.test(alias)) return alias;
  const digest = createHash('sha256')
    .update(`cukies-treasure-hunt-legacy-alias-v2:${alias.toLowerCase()}`)
    .digest();
  return aliasFromDigest(digest);
}

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
    .update(`cukies-treasure-hunt-private-alias-v2:${campaignId}:${walletAddress}:${collisionNonce}`)
    .digest();
  return aliasFromDigest(digest);
}
