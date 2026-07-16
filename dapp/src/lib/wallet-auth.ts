import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { isAddress, verifyMessage, zeroAddress } from 'viem';
import { TronWeb } from 'tronweb';

import { normalizeWalletAddress } from './wallet-address';

export type WalletAuthType = 'evm' | 'tron';

export const WALLET_CHALLENGE_COOKIE = 'cukies_wallet_challenge';
export const WALLET_SESSION_COOKIE = 'cukies_wallet_session';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_TRON_FULL_HOST = 'https://api.trongrid.io';

type WalletChallengePayload = {
  walletAddress: string;
  walletType: WalletAuthType;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
  message: string;
};

export type WalletSessionPayload = {
  userId: string;
  walletAddress: string;
  signedWalletAddress: string;
  walletType: WalletAuthType;
  issuedAt: string;
  expiresAt: string;
};

function getCookieSecret() {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET is required for wallet authentication');
  }

  return 'cukies-hub-dev-wallet-auth-secret';
}

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function sealPayload(payload: unknown) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getCookieSecret())
    .update(body)
    .digest('base64url');

  return `${body}.${signature}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function unsealPayload<T>(token?: string): T | null {
  if (!token) {
    return null;
  }

  const [body, signature] = token.split('.');

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = crypto
    .createHmac('sha256', getCookieSecret())
    .update(body)
    .digest('base64url');

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function isExpired(expiresAt: string) {
  return Number.isNaN(Date.parse(expiresAt)) || Date.now() > Date.parse(expiresAt);
}

export function resolveWalletType(
  walletAddress: string,
  walletType?: string | null,
): WalletAuthType {
  if (walletType === 'evm' || walletType === 'tron') {
    return walletType;
  }

  return normalizeWalletAddress(walletAddress).startsWith('T') ? 'tron' : 'evm';
}

export function createWalletLoginMessage(payload: {
  walletAddress: string;
  walletType: WalletAuthType;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}) {
  return [
    'Cukies Hub wants you to sign in with your wallet.',
    '',
    `Wallet: ${payload.walletAddress}`,
    `Wallet Type: ${payload.walletType}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${payload.issuedAt}`,
    `Expires At: ${payload.expiresAt}`,
  ].join('\n');
}

export function createWalletChallenge(
  walletAddress: string,
  walletType: WalletAuthType,
): WalletChallengePayload {
  const normalizedAddress = normalizeWalletAddress(walletAddress);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = createWalletLoginMessage({
    walletAddress: normalizedAddress,
    walletType,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return {
    walletAddress: normalizedAddress,
    walletType,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    message,
  };
}

export async function setWalletChallengeCookie(challenge: WalletChallengePayload) {
  const cookieStore = await cookies();
  cookieStore.set(WALLET_CHALLENGE_COOKIE, sealPayload(challenge), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(CHALLENGE_TTL_MS / 1000),
  });
}

export async function readWalletChallenge() {
  const cookieStore = await cookies();
  const challenge = unsealPayload<WalletChallengePayload>(
    cookieStore.get(WALLET_CHALLENGE_COOKIE)?.value,
  );

  if (!challenge || isExpired(challenge.expiresAt)) {
    return null;
  }

  return challenge;
}

export async function clearWalletChallengeCookie() {
  const cookieStore = await cookies();
  cookieStore.set(WALLET_CHALLENGE_COOKIE, '', {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

export async function verifyWalletSignature(params: {
  walletAddress: string;
  walletType: WalletAuthType;
  message: string;
  signature: string;
}) {
  const walletAddress = normalizeWalletAddress(params.walletAddress);

  if (params.walletType === 'tron') {
    const tronWeb = new TronWeb({
      fullHost: process.env.CHAIN_INDEXER_TRON_API_BASE_URL || DEFAULT_TRON_FULL_HOST,
    });
    const hexMessage = tronWeb.toHex(params.message);
    return Boolean(
      await tronWeb.trx.verifyMessage(hexMessage, params.signature, walletAddress),
    );
  }

  if (!walletAddress.startsWith('0x')) {
    return false;
  }

  const signature = params.signature.startsWith('0x')
    ? params.signature
    : `0x${params.signature}`;

  return verifyMessage({
    address: walletAddress as `0x${string}`,
    message: params.message,
    signature: signature as `0x${string}`,
  });
}

export function walletSessionMatchesAddress(
  session: WalletSessionPayload,
  walletAddress: string,
) {
  const normalizedAddress = normalizeWalletAddress(walletAddress);

  return (
    normalizeWalletAddress(session.walletAddress) === normalizedAddress ||
    normalizeWalletAddress(session.signedWalletAddress) === normalizedAddress
  );
}

export function isValidEvmWalletAddress(walletAddress: string) {
  const normalized = walletAddress.trim().toLowerCase();
  return isAddress(normalized, { strict: false }) && normalized !== zeroAddress;
}

/**
 * Sensitive EVM mutations and reads must be owned by the wallet that actually
 * signed the session. `walletAddress` can be the user's primary/profile wallet
 * and therefore is deliberately not considered here.
 */
export function evmWalletSessionMatchesSignedAddress(
  session: WalletSessionPayload,
  walletAddress: string,
) {
  const requestedAddress = walletAddress.trim();
  const signedAddress = session.signedWalletAddress?.trim();

  if (
    session.walletType !== 'evm' ||
    !signedAddress ||
    !isValidEvmWalletAddress(requestedAddress) ||
    !isValidEvmWalletAddress(signedAddress)
  ) {
    return false;
  }

  return normalizeWalletAddress(signedAddress) === normalizeWalletAddress(requestedAddress);
}

export async function setWalletSessionCookie(params: {
  userId: string;
  walletAddress: string;
  signedWalletAddress: string;
  walletType: WalletAuthType;
}) {
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
  const payload: WalletSessionPayload = {
    userId: params.userId,
    walletAddress: normalizeWalletAddress(params.walletAddress),
    signedWalletAddress: normalizeWalletAddress(params.signedWalletAddress),
    walletType: params.walletType,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const cookieStore = await cookies();
  cookieStore.set(WALLET_SESSION_COOKIE, sealPayload(payload), {
    httpOnly: true,
    secure: isProduction(),
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });

  return payload;
}

export async function readWalletSession() {
  const cookieStore = await cookies();
  const session = unsealPayload<WalletSessionPayload>(
    cookieStore.get(WALLET_SESSION_COOKIE)?.value,
  );

  if (!session || isExpired(session.expiresAt)) {
    return null;
  }

  return session;
}

export async function requireWalletSession(walletAddress: string) {
  const session = await readWalletSession();

  if (!session || !walletSessionMatchesAddress(session, walletAddress)) {
    throw new Error('Wallet session is required');
  }

  return session;
}
