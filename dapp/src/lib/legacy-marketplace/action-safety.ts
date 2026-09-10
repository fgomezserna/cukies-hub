import type { LegacyTronWebLike } from './tron';
import {
  TRON_MAINNET_CHAIN_ID,
  resolveTronChainId,
  type TronWebLike,
} from '@/lib/tronlink-provider';

export function isSameEvmWallet(left?: string | null, right?: string | null) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function canonicalTronAddress(
  tronWeb: LegacyTronWebLike,
  value?: string | null,
) {
  if (!value) return null;
  try {
    const hex = tronWeb.address?.toHex?.(value);
    if (hex && /^41[0-9a-f]{40}$/i.test(hex)) return `hex:${hex.toLowerCase()}`;
  } catch {
    // Fall back to exact base58 comparison; its alphabet is case-sensitive.
  }
  return `base58:${value}`;
}

export function isSameTronWallet(
  tronWeb: LegacyTronWebLike,
  left?: string | null,
  right?: string | null,
) {
  const canonicalLeft = canonicalTronAddress(tronWeb, left);
  const canonicalRight = canonicalTronAddress(tronWeb, right);
  return Boolean(canonicalLeft && canonicalRight && canonicalLeft === canonicalRight);
}

function canonicalTronNodeHost(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export type LegacyTronActionContext = {
  address: string;
  nodeHost: string;
  chainId: string;
};

export function captureTronActionContext(
  tronWeb: LegacyTronWebLike,
  expectedMainnetRpcUrl: string,
): LegacyTronActionContext {
  const address = tronWeb.defaultAddress?.base58
    ?? tronWeb.defaultAddress?.hex
    ?? '';
  const nodeHost = canonicalTronNodeHost(tronWeb.fullNode?.host);
  const expectedHost = canonicalTronNodeHost(expectedMainnetRpcUrl);
  const chainId = resolveTronChainId(null, tronWeb as unknown as TronWebLike);
  if (
    !address
    || !nodeHost
    || !expectedHost
    || nodeHost !== expectedHost
    || chainId !== TRON_MAINNET_CHAIN_ID
  ) {
    throw new Error('WALLET_CONTEXT_CHANGED');
  }
  return { address, nodeHost, chainId };
}

export function assertTronActionContext(
  tronWeb: LegacyTronWebLike,
  expected: LegacyTronActionContext,
) {
  const currentAddress = tronWeb.defaultAddress?.base58
    ?? tronWeb.defaultAddress?.hex
    ?? null;
  const currentNodeHost = canonicalTronNodeHost(tronWeb.fullNode?.host);
  const currentChainId = resolveTronChainId(null, tronWeb as unknown as TronWebLike);
  if (
    !isSameTronWallet(tronWeb, expected.address, currentAddress)
    || currentNodeHost !== expected.nodeHost
    || currentChainId !== expected.chainId
    || currentChainId !== TRON_MAINNET_CHAIN_ID
  ) {
    throw new Error('WALLET_CONTEXT_CHANGED');
  }
}

export function assertDisplayedPriceUnchanged(
  displayedPriceRaw: string | null,
  livePriceRaw: bigint,
) {
  if (!displayedPriceRaw || !/^\d+$/.test(displayedPriceRaw)) {
    throw new Error('DISPLAYED_PRICE_UNAVAILABLE');
  }
  if (BigInt(displayedPriceRaw) !== livePriceRaw) {
    throw new Error('LISTING_PRICE_CHANGED');
  }
}

export function assertEvmActionContext(input: {
  expectedAddress: string;
  expectedChainId: number;
  currentAddress?: string;
  currentChainId?: number;
}) {
  if (
    input.currentChainId !== input.expectedChainId
    || !isSameEvmWallet(input.currentAddress, input.expectedAddress)
  ) {
    throw new Error('WALLET_CONTEXT_CHANGED');
  }
}

export async function reconcileConfirmedMarketplaceAction<T>(
  confirm: () => Promise<T>,
  reconcile: () => Promise<void>,
) {
  const result = await confirm();
  try {
    await reconcile();
    return { result, reconciled: true as const };
  } catch {
    return { result, reconciled: false as const };
  }
}
