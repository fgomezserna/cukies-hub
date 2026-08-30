import type { Address } from 'viem';

export const UKI_MARKETPLACE_SLIPPAGE_BPS = 100;
export const UKI_MARKETPLACE_QUOTE_DEADLINE_SECONDS = 10 * 60;

export type UkiMarketplacePaymentCurrency = 'UKI' | 'BNB' | 'USDT';

export type UkiMarketplaceCheckoutBudget = {
  quotedPaymentRaw: bigint;
  quotedFeeRaw: bigint;
  quotedTotalRaw: bigint;
  maxPaymentRaw: bigint;
  maxFeeRaw: bigint;
  maxTotalRaw: bigint;
  slippageBps: number;
};

export type UkiMarketplaceOnchainOrder = readonly [
  seller: Address,
  collection: Address,
  tokenId: bigint,
  ukiPrice: bigint,
  expiresAt: bigint,
  nonce: bigint,
  feeBps: number,
  state: number,
];

function assertBps(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`${label} no es válido.`);
  }
}

export function ceilMulDiv(value: bigint, multiplier: bigint, divisor: bigint) {
  if (value < BigInt(0) || multiplier < BigInt(0) || divisor <= BigInt(0)) {
    throw new Error('No se puede calcular un presupuesto negativo o con divisor cero.');
  }
  if (value === BigInt(0) || multiplier === BigInt(0)) return BigInt(0);
  return ((value * multiplier) + divisor - BigInt(1)) / divisor;
}

export function calculateUkiMarketplaceCheckoutBudget(input: {
  quotedPaymentRaw: bigint;
  feeBps: number;
  slippageBps?: number;
}): UkiMarketplaceCheckoutBudget {
  if (input.quotedPaymentRaw <= BigInt(0)) {
    throw new Error('La cotización debe ser mayor que cero.');
  }
  const slippageBps = input.slippageBps ?? UKI_MARKETPLACE_SLIPPAGE_BPS;
  assertBps(input.feeBps, 'La comisión');
  assertBps(slippageBps, 'La protección de precio');

  const quotedFeeRaw = ceilMulDiv(input.quotedPaymentRaw, BigInt(input.feeBps), BigInt(10_000));
  const maxPaymentRaw = ceilMulDiv(
    input.quotedPaymentRaw,
    BigInt(10_000 + slippageBps),
    BigInt(10_000),
  );
  const maxFeeRaw = ceilMulDiv(maxPaymentRaw, BigInt(input.feeBps), BigInt(10_000));

  return {
    quotedPaymentRaw: input.quotedPaymentRaw,
    quotedFeeRaw,
    quotedTotalRaw: input.quotedPaymentRaw + quotedFeeRaw,
    maxPaymentRaw,
    maxFeeRaw,
    maxTotalRaw: maxPaymentRaw + maxFeeRaw,
    slippageBps,
  };
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

export function validateUkiMarketplaceOnchainOrder(input: {
  indexed: {
    seller: Address;
    collectionAddress: Address;
    tokenId: string;
    ukiPriceRaw: string;
    expiresAt: string;
    nonceRaw: string;
    feeBps: number;
  };
  onchain: UkiMarketplaceOnchainOrder;
  activeOrderId: `0x${string}`;
  expectedOrderId: `0x${string}`;
  contractState: number;
  nowSeconds: bigint;
}) {
  const [seller, collection, tokenId, ukiPrice, expiresAt, nonce, feeBps, storedState] = input.onchain;
  const indexedExpiry = Math.floor(new Date(input.indexed.expiresAt).getTime() / 1_000);
  const expectedTokenId = /^\d+$/.test(input.indexed.tokenId)
    ? BigInt(input.indexed.tokenId)
    : null;
  const expectedPrice = /^\d+$/.test(input.indexed.ukiPriceRaw)
    ? BigInt(input.indexed.ukiPriceRaw)
    : null;
  const expectedNonce = /^\d+$/.test(input.indexed.nonceRaw)
    ? BigInt(input.indexed.nonceRaw)
    : null;

  if (
    expectedTokenId === null
    || expectedPrice === null
    || expectedNonce === null
    || !Number.isFinite(indexedExpiry)
  ) {
    throw new Error('El anuncio indexado contiene condiciones inválidas.');
  }
  if (input.contractState !== 1 || storedState !== 1) {
    throw new Error('La orden ya no está activa.');
  }
  if (!sameAddress(input.activeOrderId, input.expectedOrderId)) {
    throw new Error('La orden ha sido sustituida o cancelada.');
  }
  if (
    !sameAddress(seller, input.indexed.seller)
    || !sameAddress(collection, input.indexed.collectionAddress)
    || tokenId !== expectedTokenId
    || ukiPrice !== expectedPrice
    || expiresAt !== BigInt(indexedExpiry)
    || nonce !== expectedNonce
    || feeBps !== input.indexed.feeBps
  ) {
    throw new Error('Las condiciones on-chain ya no coinciden con el anuncio mostrado.');
  }
  if (expiresAt <= input.nowSeconds) {
    throw new Error('La orden ha expirado.');
  }
}
