import 'server-only';

import { isAddress } from 'viem';

import {
  ViemUkiMarketplaceLiveReader,
  type UkiMarketplaceLiveReader,
} from './live';
import {
  MongoUkiMarketplaceRepository,
  type UkiMarketplaceRepository,
} from './repository';
import { ukiMarketplaceRuntime } from './runtime';
import {
  UkiMarketplaceUnavailableError,
  UkiMarketplaceValidationError,
} from './errors';
export {
  UkiMarketplaceUnavailableError,
  UkiMarketplaceValidationError,
} from './errors';
import type {
  IndexedUkiMarketplaceOrder,
  UkiMarketplaceDisplayStatus,
  UkiMarketplaceLiveInspection,
  UkiMarketplaceOrderView,
  UkiMarketplaceRuntime,
} from './types';

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
  if (!Number.isSafeInteger(candidate) || candidate < 1 || candidate > 50) {
    throw new UkiMarketplaceValidationError(
      'limit must be an integer from 1 to 50',
    );
  }
  return candidate;
}

export type UkiMarketplaceCursor = { listedAt: Date; id: string };

function encodeCursor(value: UkiMarketplaceCursor) {
  return Buffer.from(
    JSON.stringify({ listedAt: value.listedAt.toISOString(), id: value.id }),
  ).toString('base64url');
}

function decodeCursor(
  value: string | undefined,
): UkiMarketplaceCursor | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as {
      listedAt?: string;
      id?: string;
    };
    const listedAt = parsed.listedAt ? new Date(parsed.listedAt) : null;
    if (!listedAt || Number.isNaN(listedAt.getTime()) || !parsed.id)
      throw new Error('invalid cursor');
    return { listedAt, id: parsed.id };
  } catch {
    throw new UkiMarketplaceValidationError('cursor is invalid');
  }
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
  if (
    !isAddress(normalized, { strict: false }) ||
    /^0x0{40}$/.test(normalized)
  ) {
    throw new UkiMarketplaceValidationError(
      'walletAddress is not a valid EVM wallet',
    );
  }
  return normalized as `0x${string}`;
}

function resolveActiveStatus(
  order: IndexedUkiMarketplaceOrder,
  inspection: UkiMarketplaceLiveInspection | undefined,
  now: Date,
): {
  status: UkiMarketplaceDisplayStatus;
  attentionReason: UkiMarketplaceOrderView['attentionReason'];
} {
  if (order.status !== 'active')
    return { status: order.status, attentionReason: null };
  if (order.expiresAt.getTime() <= now.getTime())
    return { status: 'expired', attentionReason: null };
  if (!inspection || inspection.contractState === null) {
    return { status: 'invalid', attentionReason: 'verification_unavailable' };
  }
  if (inspection.contractState === 2)
    return { status: 'sold', attentionReason: null };
  if (inspection.contractState === 3)
    return { status: 'cancelled', attentionReason: null };
  if (inspection.contractState === 4)
    return { status: 'expired', attentionReason: null };
  if (inspection.contractState === 5) {
    if (
      inspection.ownerNormalized === order.sellerNormalized &&
      inspection.marketplaceApproved === false
    ) {
      return {
        status: 'requires_attention',
        attentionReason: 'approval_required',
      };
    }
    return { status: 'invalid', attentionReason: null };
  }
  if (
    inspection.contractState !== 1 ||
    inspection.ownerNormalized !== order.sellerNormalized ||
    inspection.marketplaceApproved !== true
  ) {
    return { status: 'invalid', attentionReason: 'verification_unavailable' };
  }
  return { status: 'active', attentionReason: null };
}

function toOrderView(
  order: IndexedUkiMarketplaceOrder,
  status: UkiMarketplaceDisplayStatus,
  attentionReason: UkiMarketplaceOrderView['attentionReason'],
  catalogCursor?: string,
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
    catalogCursor,
  };
}

export type UkiMarketplacePublicPage = {
  orders: UkiMarketplaceOrderView[];
  nextCursor: string | null;
  hasMore: boolean;
};

export async function listPublicUkiMarketplacePage(
  input: {
    limit?: number;
    cursor?: string;
    search?: string;
  },
  dependencies: UkiMarketplaceServiceDependencies = defaultDependencies(),
): Promise<UkiMarketplacePublicPage> {
  const { chainId, marketplaceAddress } = assertRuntime(dependencies.runtime);
  const limit = validatedLimit(input.limit);
  const now = dependencies.now();
  let cursor = decodeCursor(input.cursor);
  const orders: UkiMarketplaceOrderView[] = [];
  let scans = 0;
  let budgetExhausted = false;

  const hasValidCandidateAfter = async (after: UkiMarketplaceCursor) => {
    let probe = after;
    for (let probeScan = 0; probeScan < 8; probeScan += 1) {
      const candidates = await dependencies.repository.listPublicCandidates({
        chainId,
        marketplaceAddress,
        now,
        limit: 1,
        after: probe,
        ...(input.search ? { search: input.search } : {}),
      });
      if (candidates.length === 0) return { hasMore: false, cursor: probe };
      const inspections = await dependencies.liveReader.inspectOrders(
        candidates,
      );
      if (
        candidates.every((order) => {
          const inspection = inspections.get(order.orderId);
          return (
            !inspection ||
            (inspection.contractState === null &&
              inspection.ownerNormalized === null &&
              inspection.marketplaceApproved === null)
          );
        })
      ) {
        throw new UkiMarketplaceUnavailableError();
      }
      if (
        candidates.some(
          (order) =>
            resolveActiveStatus(order, inspections.get(order.orderId), now)
              .status === 'active',
        )
      ) {
        return { hasMore: true, cursor: probe };
      }
      const lastCandidate = candidates[candidates.length - 1];
      probe = { listedAt: lastCandidate.listedAt, id: lastCandidate._id };
    }
    return { hasMore: true, cursor: probe };
  };

  while (orders.length < limit && scans < 8) {
    const candidates = await dependencies.repository.listPublicCandidates({
      chainId,
      marketplaceAddress,
      now,
      limit,
      ...(cursor ? { after: cursor } : {}),
      ...(input.search ? { search: input.search } : {}),
    });
    if (candidates.length === 0) break;
    scans += 1;
    const inspections = await dependencies.liveReader.inspectOrders(candidates);
    if (
      candidates.every((order) => {
        const inspection = inspections.get(order.orderId);
        return (
          !inspection ||
          (inspection.contractState === null &&
            inspection.ownerNormalized === null &&
            inspection.marketplaceApproved === null)
        );
      })
    ) {
      throw new UkiMarketplaceUnavailableError();
    }
    const resolved = candidates
      .map((order) => {
        const status = resolveActiveStatus(
          order,
          inspections.get(order.orderId),
          now,
        );
        return { order, ...status };
      })
      .filter(({ status }) => status === 'active');
    const availableSlots = limit - orders.length;
    for (const entry of resolved.slice(0, availableSlots)) {
      const entryCursor = encodeCursor({
        listedAt: entry.order.listedAt,
        id: entry.order._id,
      });
      orders.push(
        toOrderView(
          entry.order,
          entry.status,
          entry.attentionReason,
          entryCursor,
        ),
      );
      cursor = { listedAt: entry.order.listedAt, id: entry.order._id };
    }
    if (orders.length === limit) {
      if (resolved.length > availableSlots) {
        return {
          orders,
          nextCursor: cursor ? encodeCursor(cursor) : null,
          hasMore: true,
        };
      }
      const more =
        candidates.length === limit && cursor
          ? await hasValidCandidateAfter(cursor)
          : { hasMore: false, cursor };
      return {
        orders,
        nextCursor: more.cursor ? encodeCursor(more.cursor) : null,
        hasMore: more.hasMore,
      };
    }
    const lastCandidate = candidates[candidates.length - 1];
    cursor = { listedAt: lastCandidate.listedAt, id: lastCandidate._id };
    if (candidates.length < limit) break;
    if (scans >= 8) {
      budgetExhausted = true;
      break;
    }
  }

  return {
    orders,
    nextCursor: cursor ? encodeCursor(cursor) : null,
    hasMore: budgetExhausted && Boolean(cursor),
  };
}

export async function listPublicUkiMarketplaceOrders(
  input: {
    limit?: number;
  },
  dependencies: UkiMarketplaceServiceDependencies = defaultDependencies(),
) {
  return (
    await listPublicUkiMarketplacePage({ limit: input.limit }, dependencies)
  ).orders;
}

export async function listSellerUkiMarketplaceOrders(
  input: {
    walletAddress: string;
    limit?: number;
  },
  dependencies: UkiMarketplaceServiceDependencies = defaultDependencies(),
) {
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
    const resolved = resolveActiveStatus(
      order,
      inspections.get(order.orderId),
      now,
    );
    return toOrderView(order, resolved.status, resolved.attentionReason);
  });
}
