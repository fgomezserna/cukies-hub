import type { LegacyTronWebLike } from './tron';

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
