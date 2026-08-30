import 'server-only';

import { isAddress } from 'viem';

import { ViemUkiMarketplaceLiveReader, type UkiMarketplaceLiveReader } from './live';
import {
  MongoUkiMarketplaceRepository,
  type UkiMarketplaceRepository,
} from './repository';
import { ukiMarketplaceRuntime } from './runtime';
import type {
  IndexedUkiMarketplaceOrder,
  UkiMarketplaceDisplayStatus,
  UkiMarketplaceLiveInspection,
  UkiMarketplaceOrderView,
  UkiMarketplaceRuntime,
} from './types';

export class UkiMarketplaceUnavailableError extends Error {
  constructor() {
    super('UKI marketplace unavailable');
    this.name = 'UkiMarketplaceUnavailableError';
  }
}

export class UkiMarketplaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UkiMarketplaceValidationError';
  }
}

export type UkiMarketplaceServiceDependencies = {
  repository: UkiMarketplaceRepository;
  liveReader: UkiMarketplaceLiveReader;
  runtime: UkiMarketplaceRuntime;
  now: () => Date;
};

function defaultDependencies(): UkiMarketplaceServiceDependencies {
  return {
    repository: new MongoUkiMarketplaceRepository(),
    liveReader: new ViemUkiMarketplaceLiveReader(ukiMarketplaceRuntime),
    runtime: ukiMarketplaceRuntime,
    now: () => new Date(),
  };
}

function validatedLimit(limit: number | undefined) {
  const candidate = limit ?? 24;
  if (!Number.isInteger(candidate) || candidate < 1 || candidate > 50) {
    throw new UkiMarketplaceValidationError('limit must be an integer from 1 to 50');
  }
  return candidate;
}

function assertRuntime(runtime: UkiMarketplaceRuntime) {
  if (!runtime.ready || !runtime.chainId || !runtime.marketplaceAddress) {
    throw new UkiMarketplaceUnavailableError();
  }
  return {
    chainId: runtime.chainId,
    marketplaceAddress: runtime.marketplaceAddress,
  };
}

function normalizeSeller(walletAddress: string) {
  const normalized = walletAddress.trim().toLowerCase();
  if (!isAddress(normalized, { strict: false }) || /^0x0{40}$/.test(normalized)) {
    throw new UkiMarketplaceValidationError('walletAddress is not a valid EVM wallet');
  }
  return normalized as `0x${string}`;
}

function resolveActiveStatus(
  order: IndexedUkiMarketplaceOrder,
  inspection: UkiMarketplaceLiveInspection | undefined,
  now: Date,
): { status: UkiMarketplaceDisplayStatus; attentionReason: UkiMarketplaceOrderView['attentionReason'] } {
  if (order.status !== 'active') return { status: order.status, attentionReason: null };
  if (order.expiresAt.getTime() <= now.getTime()) return { status: 'expired', attentionReason: null };
  if (!inspection || inspection.contractState === null) {
    return { status: 'invalid', attentionReason: 'verification_unavailable' };
  }
  if (inspection.contractState === 2) return { status: 'sold', attentionReason: null };
  if (inspection.contractState === 3) return { status: 'cancelled', attentionReason: null };
  if (inspection.contractState === 4) return { status: 'expired', attentionReason: null };
  if (inspection.contractState === 5) {
    if (
      inspection.ownerNormalized === order.sellerNormalized
      && inspection.marketplaceApproved === false
    ) {
      return { status: 'requires_attention', attentionReason: 'approval_required' };
    }
    return { status: 'invalid', attentionReason: null };
  }
  if (
    inspection.contractState !== 1
    || inspection.ownerNormalized !== order.sellerNormalized
    || inspection.marketplaceApproved !== true
  ) {
    return { status: 'invalid', attentionReason: 'verification_unavailable' };
  }
  return { status: 'active', attentionReason: null };
}

function toOrderView(
  order: IndexedUkiMarketplaceOrder,
  status: UkiMarketplaceDisplayStatus,
  attentionReason: UkiMarketplaceOrderView['attentionReason'],
): UkiMarketplaceOrderView {
  return {
    orderId: order.orderId,
    chainId: order.chainId,
    marketplaceAddress: order.marketplaceAddressNormalized,
    collectionAddress: order.collectionAddressNormalized,
    tokenId: order.tokenId,
    seller: order.sellerNormalized,
    ukiPriceRaw: order.ukiPriceRaw,
    expiresAt: order.expiresAt.toISOString(),
    nonceRaw: order.nonceRaw,
    feeBps: order.feeBps,
    status,
    attentionReason,
    buyer: order.buyerNormalized ?? null,
    paymentToken: order.paymentTokenNormalized ?? null,
    paymentAmountRaw: order.paymentAmountRaw ?? null,
    feeAmountRaw: order.feeAmountRaw ?? null,
    listedAt: order.listedAt.toISOString(),
    soldAt: order.soldAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    expiredAt: order.expiredAt?.toISOString() ?? null,
    invalidatedAt: order.invalidatedAt?.toISOString() ?? null,
  };
}

export async function listPublicUkiMarketplaceOrders(input: {
  limit?: number;
}, dependencies: UkiMarketplaceServiceDependencies = defaultDependencies()) {
  const { chainId, marketplaceAddress } = assertRuntime(dependencies.runtime);
  const limit = validatedLimit(input.limit);
  const now = dependencies.now();
  const candidates = await dependencies.repository.listPublicCandidates({
    chainId,
    marketplaceAddress,
    now,
    limit,
  });
  const inspections = await dependencies.liveReader.inspectOrders(candidates);

  return candidates
    .map((order) => {
      const resolved = resolveActiveStatus(order, inspections.get(order.orderId), now);
      return { order, ...resolved };
    })
    .filter(({ status }) => status === 'active')
    .slice(0, limit)
    .map(({ order, status, attentionReason }) => toOrderView(order, status, attentionReason));
}

export async function listSellerUkiMarketplaceOrders(input: {
  walletAddress: string;
  limit?: number;
}, dependencies: UkiMarketplaceServiceDependencies = defaultDependencies()) {
  const { chainId, marketplaceAddress } = assertRuntime(dependencies.runtime);
  const limit = validatedLimit(input.limit);
  const sellerNormalized = normalizeSeller(input.walletAddress);
  const now = dependencies.now();
  const orders = await dependencies.repository.listSellerOrders({
    chainId,
    marketplaceAddress,
    sellerNormalized,
    limit,
  });
  const active = orders.filter((order) => order.status === 'active');
  const inspections = await dependencies.liveReader.inspectOrders(active);

  return orders.map((order) => {
    const resolved = resolveActiveStatus(order, inspections.get(order.orderId), now);
    return toOrderView(order, resolved.status, resolved.attentionReason);
  });
}
