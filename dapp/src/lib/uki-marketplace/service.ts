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
  UkiMarketplaceAssetIdentity,
  UkiMarketplaceAssetMetadata,
  UkiMarketplaceDisplayStatus,
  UkiMarketplaceLiveInspection,
  UkiMarketplaceOrderView,
  UkiMarketplaceRuntime,
  UkiMarketplaceSort,
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

export type UkiMarketplaceCursor = {
  listedAt: Date;
  id: string;
  /** Clave numérica de precio para continuar una página ordenada por precio. */
  priceRaw?: string;
};

function encodeCursor(value: UkiMarketplaceCursor) {
  const payload = {
    listedAt: value.listedAt.toISOString(),
    id: value.id,
    ...(value.priceRaw ? { priceRaw: value.priceRaw } : {}),
  };
  return Buffer.from(
    JSON.stringify(payload),
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
      priceRaw?: string;
    };
    const listedAt = parsed.listedAt ? new Date(parsed.listedAt) : null;
    if (
      !listedAt
      || Number.isNaN(listedAt.getTime())
      || !parsed.id
      || (parsed.priceRaw !== undefined && !/^\d+$/.test(parsed.priceRaw))
    ) {
      throw new Error('invalid cursor');
    }
    return {
      listedAt,
      id: parsed.id,
      ...(parsed.priceRaw !== undefined ? { priceRaw: parsed.priceRaw } : {}),
    };
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

const DECIMAL_TOKEN_ID = /^(0|[1-9][0-9]*)$/;
const MAX_UINT256 = (BigInt(1) << BigInt(256)) - BigInt(1);

function orderAssetIdentity(
  order: IndexedUkiMarketplaceOrder,
): UkiMarketplaceAssetIdentity | null {
  return assetIdentity({
    chainId: order.chainId,
    collectionAddress: order.collectionAddressNormalized,
    tokenId: order.tokenId,
  });
}

function assetIdentity(input: {
  chainId: unknown;
  collectionAddress: unknown;
  tokenId: unknown;
}): UkiMarketplaceAssetIdentity | null {
  if (input.chainId !== 56 && input.chainId !== 97) return null;
  if (typeof input.collectionAddress !== 'string') return null;
  const collectionAddress = input.collectionAddress.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(collectionAddress) || /^0x0{40}$/.test(collectionAddress)) {
    return null;
  }
  const tokenId = String(input.tokenId);
  if (!DECIMAL_TOKEN_ID.test(tokenId)) return null;
  try {
    if (BigInt(tokenId) > MAX_UINT256) return null;
  } catch {
    return null;
  }
  return {
    chainId: input.chainId,
    collectionAddress: collectionAddress as `0x${string}`,
    tokenId,
  };
}

function assetIdentityKey(input: UkiMarketplaceAssetIdentity) {
  return `${input.chainId}:${input.collectionAddress.toLowerCase()}:${input.tokenId}`;
}

const marketplaceRarityAliases: Record<string, string> = {
  '1': 'common',
  common: 'common',
  '2': 'uncommon',
  uncommon: 'uncommon',
  'no-comun': 'uncommon',
  'no común': 'uncommon',
  '3': 'rare',
  rare: 'rare',
  raro: 'rare',
  '4': 'epic',
  epic: 'epic',
  épico: 'epic',
  '5': 'legendary',
  legendary: 'legendary',
  legendario: 'legendary',
  '6': 'goat',
  goat: 'goat',
};

function normalizeMarketplaceRarity(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  return marketplaceRarityAliases[normalized] ?? null;
}

function normalizeMarketplaceGeneration(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'original', 'first', 'first_generation', 'genesis'].includes(normalized)) {
    return 'original';
  }
  if (['2', 'second', 'second_generation', 'bred', 'breeding'].includes(normalized)) {
    return 'second_generation';
  }
  return null;
}

function matchesMarketplaceMetadata(
  metadata: UkiMarketplaceAssetMetadata | undefined,
  input: { type?: string; generation?: string },
) {
  if (input.type && input.type !== 'all') {
    const expectedType = normalizeMarketplaceRarity(input.type);
    if (!expectedType || !normalizeMarketplaceRarity(metadata?.rarity)) {
      return false;
    }
    if (normalizeMarketplaceRarity(metadata?.rarity) !== expectedType) {
      return false;
    }
  }
  if (input.generation && input.generation !== 'all') {
    const expectedGeneration = normalizeMarketplaceGeneration(input.generation);
    if (!expectedGeneration || !normalizeMarketplaceGeneration(metadata?.generation)) {
      return false;
    }
    if (normalizeMarketplaceGeneration(metadata?.generation) !== expectedGeneration) {
      return false;
    }
  }
  return true;
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
  metadata?: UkiMarketplaceAssetMetadata,
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
    imageUrl: metadata?.imageUrl ?? null,
    rarity: metadata?.rarity ?? null,
    generation: metadata?.generation ?? null,
    catalogCursor,
  };
}

type ResolvedPublicOrder = {
  order: IndexedUkiMarketplaceOrder;
  status: UkiMarketplaceDisplayStatus;
  attentionReason: UkiMarketplaceOrderView['attentionReason'];
  catalogCursor?: string;
};

async function metadataByOrder(
  entries: ResolvedPublicOrder[],
  repository: UkiMarketplaceRepository,
) {
  const listAssetMetadata = repository.listAssetMetadata;
  if (!listAssetMetadata || entries.length === 0) return new Map<string, UkiMarketplaceAssetMetadata>();

  const identities = [...new Map(
    entries.flatMap((entry) => {
      const identity = orderAssetIdentity(entry.order);
      return identity
        ? [[assetIdentityKey(identity), identity] as const]
        : [];
    }),
  ).values()];
  if (identities.length === 0) return new Map<string, UkiMarketplaceAssetMetadata>();

  // La imagen es enriquecimiento opcional: una caída de metadata no puede
  // ocultar el anuncio que ya fue reconciliado con el contrato.
  try {
    const metadata = await listAssetMetadata.call(repository, { identities });
    const requested = new Set(identities.map(assetIdentityKey));
    return new Map(
      metadata.flatMap((item) => {
        const identity = assetIdentity({
          chainId: item.chainId,
          collectionAddress: item.collectionAddress,
          tokenId: item.tokenId,
        });
        if (!identity) return [];
        const key = assetIdentityKey(identity);
        return requested.has(key) ? [[key, item] as const] : [];
      }),
    );
  } catch {
    return new Map<string, UkiMarketplaceAssetMetadata>();
  }
}

async function orderViews(
  entries: ResolvedPublicOrder[],
  repository: UkiMarketplaceRepository,
  metadataCache?: Map<string, UkiMarketplaceAssetMetadata>,
) {
  const metadata = metadataCache && metadataCache.size > 0
    ? metadataCache
    : await metadataByOrder(entries, repository);
  return entries.map((entry) => {
    const identity = orderAssetIdentity(entry.order);
    return toOrderView(
      entry.order,
      entry.status,
      entry.attentionReason,
      entry.catalogCursor,
      identity ? metadata.get(assetIdentityKey(identity)) : undefined,
    );
  });
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
    type?: string;
    generation?: string;
    sort?: UkiMarketplaceSort;
  },
  dependencies: UkiMarketplaceServiceDependencies = defaultDependencies(),
): Promise<UkiMarketplacePublicPage> {
  const { chainId, marketplaceAddress } = assertRuntime(dependencies.runtime);
  const limit = validatedLimit(input.limit);
  const sort = input.sort ?? 'newest';
  const now = dependencies.now();
  let cursor = decodeCursor(input.cursor);
  if (sort.startsWith('price-') && cursor && !cursor.priceRaw) {
    throw new UkiMarketplaceValidationError('price cursor is invalid');
  }
  const entries: ResolvedPublicOrder[] = [];
  const metadataCache = new Map<string, UkiMarketplaceAssetMetadata>();
  let scans = 0;
  let budgetExhausted = false;

  const page = async (nextCursor: UkiMarketplaceCursor | undefined, hasMore: boolean) => ({
    orders: await orderViews(entries, dependencies.repository, metadataCache),
    nextCursor: nextCursor ? encodeCursor(nextCursor) : null,
    hasMore,
  });

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
        ...(sort !== 'newest' ? { sort } : {}),
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
      const resolved = candidates
        .map((order) => ({
          order,
          ...resolveActiveStatus(order, inspections.get(order.orderId), now),
        }))
        .filter(({ status }) => status === 'active');
      if (!input.type && !input.generation && resolved.length > 0) {
        return { hasMore: true, cursor: probe };
      }
      if (resolved.length > 0) {
        const probeMetadata = await metadataByOrder(resolved, dependencies.repository);
        probeMetadata.forEach((metadata, key) => metadataCache.set(key, metadata));
        if (resolved.some((entry) => {
          const identity = orderAssetIdentity(entry.order);
          return matchesMarketplaceMetadata(
            identity ? probeMetadata.get(assetIdentityKey(identity)) : undefined,
            input,
          );
        })) {
          return { hasMore: true, cursor: probe };
        }
      }
      const lastCandidate = candidates[candidates.length - 1];
      probe = {
        listedAt: lastCandidate.listedAt,
        id: lastCandidate._id,
        ...(sort.startsWith('price-') ? { priceRaw: lastCandidate.ukiPriceRaw } : {}),
      };
    }
    return { hasMore: true, cursor: probe };
  };

  while (entries.length < limit && scans < 8) {
    const candidates = await dependencies.repository.listPublicCandidates({
      chainId,
      marketplaceAddress,
      now,
      limit,
      ...(cursor ? { after: cursor } : {}),
      ...(input.search ? { search: input.search } : {}),
      ...(sort !== 'newest' ? { sort } : {}),
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
    if (input.type || input.generation) {
      const batchMetadata = await metadataByOrder(resolved, dependencies.repository);
      batchMetadata.forEach((metadata, key) => metadataCache.set(key, metadata));
    }
    const filtered = resolved.filter((entry) => {
      const identity = orderAssetIdentity(entry.order);
      return matchesMarketplaceMetadata(
        identity ? metadataCache.get(assetIdentityKey(identity)) : undefined,
        input,
      );
    });
    const availableSlots = limit - entries.length;
    for (const entry of filtered.slice(0, availableSlots)) {
      const entryCursor = encodeCursor({
        listedAt: entry.order.listedAt,
        id: entry.order._id,
        ...(sort.startsWith('price-') ? { priceRaw: entry.order.ukiPriceRaw } : {}),
      });
      entries.push({
        order: entry.order,
        status: entry.status,
        attentionReason: entry.attentionReason,
        catalogCursor: entryCursor,
      });
      cursor = {
        listedAt: entry.order.listedAt,
        id: entry.order._id,
        ...(sort.startsWith('price-') ? { priceRaw: entry.order.ukiPriceRaw } : {}),
      };
    }
    if (entries.length === limit) {
      if (filtered.length > availableSlots) {
        return page(cursor, true);
      }
      const more =
        candidates.length === limit && cursor
          ? await hasValidCandidateAfter(cursor)
          : { hasMore: false, cursor };
      return page(more.cursor, more.hasMore);
    }
    const lastCandidate = candidates[candidates.length - 1];
    cursor = {
      listedAt: lastCandidate.listedAt,
      id: lastCandidate._id,
      ...(sort.startsWith('price-') ? { priceRaw: lastCandidate.ukiPriceRaw } : {}),
    };
    if (candidates.length < limit) break;
    if (scans >= 8) {
      budgetExhausted = true;
      break;
    }
  }

  return page(cursor, budgetExhausted && Boolean(cursor));
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

  const entries = orders.map((order) => {
    const resolved = resolveActiveStatus(
      order,
      inspections.get(order.orderId),
      now,
    );
    return {
      order,
      status: resolved.status,
      attentionReason: resolved.attentionReason,
    } satisfies ResolvedPublicOrder;
  });
  return orderViews(entries, dependencies.repository);
}
