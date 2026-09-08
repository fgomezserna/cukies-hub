jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/uki-marketplace/repository', () => ({
  MongoUkiMarketplaceRepository: jest.fn(),
}));
jest.mock('@/lib/uki-marketplace/live', () => ({
  ViemUkiMarketplaceLiveReader: jest.fn(),
}));

import {
  listPublicUkiMarketplacePage,
  listPublicUkiMarketplaceOrders,
  listSellerUkiMarketplaceOrders,
  UkiMarketplaceUnavailableError,
  UkiMarketplaceValidationError,
  type UkiMarketplaceServiceDependencies,
} from '@/lib/uki-marketplace/service';
import { resolveUkiMarketplaceRuntime } from '@/lib/uki-marketplace/runtime';
import type {
  IndexedUkiMarketplaceOrder,
  UkiMarketplaceLiveInspection,
} from '@/lib/uki-marketplace/types';

const marketplace = '0x0000000000000000000000000000000000001001';
const collection = '0x0000000000000000000000000000000000001002';
const seller = '0x00000000000000000000000000000000000000aa';
const buyer = '0x00000000000000000000000000000000000000bb';
const now = new Date('2026-08-30T12:00:00.000Z');

function order(
  suffix: string,
  overrides: Partial<IndexedUkiMarketplaceOrder> = {},
): IndexedUkiMarketplaceOrder {
  const orderId = `0x${suffix.repeat(64)}` as `0x${string}`;
  return {
    _id: `97:${marketplace}:${orderId}`,
    orderId,
    chain: 'BSC',
    chainId: 97,
    marketplaceAddressNormalized: marketplace,
    collectionAddress: collection,
    collectionAddressNormalized: collection,
    tokenId: String(Number.parseInt(suffix, 16)),
    seller,
    sellerNormalized: seller,
    ukiPriceRaw: '1000000000000000000000',
    expiresAtRaw: '1800000000',
    expiresAt: new Date('2027-01-15T08:00:00.000Z'),
    nonceRaw: '1',
    feeBps: 1_000,
    status: 'active',
    listedAt: new Date('2026-08-30T10:00:00.000Z'),
    ...overrides,
  };
}

function inspection(
  overrides: Partial<UkiMarketplaceLiveInspection> = {},
): UkiMarketplaceLiveInspection {
  return {
    contractState: 1,
    ownerNormalized: seller,
    marketplaceApproved: true,
    ...overrides,
  };
}

function dependencies(input: {
  publicOrders?: IndexedUkiMarketplaceOrder[];
  sellerOrders?: IndexedUkiMarketplaceOrder[];
  inspections?: Map<string, UkiMarketplaceLiveInspection>;
  ready?: boolean;
} = {}) {
  const repository = {
    listPublicCandidates: jest.fn().mockResolvedValue(input.publicOrders ?? []),
    listSellerOrders: jest.fn().mockResolvedValue(input.sellerOrders ?? []),
  };
  const liveReader = {
    inspectOrders: jest.fn().mockResolvedValue(input.inspections ?? new Map()),
  };
  const runtime = input.ready === false
    ? { ready: false, chainId: null, marketplaceAddress: null, rpcUrls: [], issues: ['missing'] }
    : {
        ready: true,
        chainId: 97 as const,
        marketplaceAddress: marketplace as `0x${string}`,
        rpcUrls: ['https://rpc.test.invalid/'],
        issues: [],
      };
  return {
    dependencies: {
      repository,
      liveReader,
      runtime,
      now: () => now,
    } satisfies UkiMarketplaceServiceDependencies,
    repository,
    liveReader,
  };
}

describe('UKI marketplace Stage service', () => {
  it('publishes only orders proven active, owned and approved in the live contract state', async () => {
    const valid = order('1');
    const revoked = order('2');
    const transferred = order('3');
    const unavailable = order('4');
    const context = dependencies({
      publicOrders: [valid, revoked, transferred, unavailable],
      inspections: new Map([
        [valid.orderId, inspection()],
        [revoked.orderId, inspection({ contractState: 5, marketplaceApproved: false })],
        [transferred.orderId, inspection({ contractState: 5, ownerNormalized: buyer })],
        [unavailable.orderId, inspection({
          contractState: null,
          ownerNormalized: null,
          marketplaceApproved: null,
        })],
      ]),
    });

    const result = await listPublicUkiMarketplaceOrders(
      { limit: 10 },
      context.dependencies,
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      orderId: valid.orderId,
      chainId: 97,
      seller,
      status: 'active',
      ukiPriceRaw: valid.ukiPriceRaw,
    });
    expect(context.repository.listPublicCandidates).toHaveBeenCalledWith({
      chainId: 97,
      marketplaceAddress: marketplace,
      now,
      limit: 10,
    });
    expect(context.liveReader.inspectOrders).toHaveBeenCalledWith([
      valid,
      revoked,
      transferred,
      unavailable,
    ]);
  });

  it('never publishes expired index data even if a repository returns it', async () => {
    const stale = order('5', { expiresAt: new Date('2026-08-30T11:59:59.000Z') });
    const context = dependencies({
      publicOrders: [stale],
      inspections: new Map([[stale.orderId, inspection()]]),
    });
    await expect(
      listPublicUkiMarketplaceOrders({}, context.dependencies),
    ).resolves.toEqual([]);
  });

  it('reports the public feed unavailable when no indexed candidate can be verified live', async () => {
    const candidate = order('a');
    const context = dependencies({
      publicOrders: [candidate],
      inspections: new Map([[candidate.orderId, inspection({
        contractState: null,
        ownerNormalized: null,
        marketplaceApproved: null,
      })]]),
    });

    await expect(
      listPublicUkiMarketplaceOrders({}, context.dependencies),
    ).rejects.toBeInstanceOf(UkiMarketplaceUnavailableError);
  });

  it('avanza el cursor después de candidatos live inválidos sin duplicar la página', async () => {
    const invalid = order('b');
    const validOne = order('c', { listedAt: new Date('2026-08-30T09:00:00.000Z') });
    const validTwo = order('d', { listedAt: new Date('2026-08-30T08:00:00.000Z') });
    const context = dependencies({
      publicOrders: [invalid, validOne, validTwo],
      inspections: new Map([
        [invalid.orderId, inspection({ contractState: 5, ownerNormalized: buyer })],
        [validOne.orderId, inspection()],
        [validTwo.orderId, inspection()],
      ]),
    });
    context.repository.listPublicCandidates
      .mockImplementationOnce(async () => [invalid, validOne])
      .mockImplementationOnce(async () => [validTwo]);

    const result = await listPublicUkiMarketplacePage({ limit: 2 }, context.dependencies);

    expect(result.orders.map(({ orderId }) => orderId)).toEqual([validOne.orderId, validTwo.orderId]);
    expect(result.nextCursor).toBeTruthy();
    expect(context.repository.listPublicCandidates).toHaveBeenCalledTimes(2);
  });

  it('continúa con el cursor cuando agota el presupuesto de lotes antes de un anuncio válido', async () => {
    const invalid = Array.from({ length: 193 }, (_, index) =>
      order((index + 1).toString(16).padStart(2, '0')),
    );
    const valid = order('fff', { listedAt: new Date('2026-08-29T08:00:00.000Z') });
    const context = dependencies({
      inspections: new Map([
        ...invalid.map((candidate) => [candidate.orderId, inspection({ contractState: 5, ownerNormalized: buyer })] as const),
        [valid.orderId, inspection()],
      ]),
    });
    let call = 0;
    context.repository.listPublicCandidates.mockImplementation(async ({ limit }: { limit: number }) => {
      if (call < 8) {
        const batch = invalid.slice(call * limit, (call + 1) * limit);
        call += 1;
        return batch;
      }
      call += 1;
      return [valid];
    });

    const first = await listPublicUkiMarketplacePage({ limit: 24 }, context.dependencies);
    expect(first.orders).toEqual([]);
    expect(first.hasMore).toBe(true);
    expect(first.nextCursor).toBeTruthy();

    const second = await listPublicUkiMarketplacePage(
      { limit: 24, cursor: first.nextCursor ?? undefined },
      context.dependencies,
    );
    expect(second.orders.map(({ orderId }) => orderId)).toEqual([valid.orderId]);
    expect(second.hasMore).toBe(false);
    expect(call).toBe(9);
  });

  it('conserva la continuación después de más de ocho candidatos inválidos entre páginas', async () => {
    const first = order('10');
    const invalid = Array.from({ length: 8 }, (_, index) =>
      order((0x20 + index).toString(16)),
    );
    const second = order('30', {
      listedAt: new Date('2026-08-30T09:00:00.000Z'),
    });
    const context = dependencies({
      inspections: new Map([
        [first.orderId, inspection()],
        ...invalid.map((candidate) => [
          candidate.orderId,
          inspection({ contractState: 5, ownerNormalized: buyer }),
        ] as const),
        [second.orderId, inspection()],
      ]),
    });
    let call = 0;
    context.repository.listPublicCandidates.mockImplementation(async () => {
      if (call === 0) {
        call += 1;
        return [first];
      }
      if (call <= invalid.length) {
        const candidate = invalid[call - 1];
        call += 1;
        return [candidate];
      }
      if (call === 10) {
        call += 1;
        return [];
      }
      call += 1;
      return [second];
    });

    const firstPage = await listPublicUkiMarketplacePage(
      { limit: 1 },
      context.dependencies,
    );
    expect(firstPage.orders.map(({ orderId }) => orderId)).toEqual([first.orderId]);
    expect(firstPage.hasMore).toBe(true);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await listPublicUkiMarketplacePage(
      { limit: 1, cursor: firstPage.nextCursor ?? undefined },
      context.dependencies,
    );
    expect(secondPage.orders.map(({ orderId }) => orderId)).toEqual([second.orderId]);
    expect(secondPage.hasMore).toBe(false);
    expect(context.repository.listPublicCandidates).toHaveBeenCalledTimes(11);
  });

  it('shows approval loss as requires_attention only in the authenticated seller view', async () => {
    const revoked = order('6');
    const transferred = order('7');
    const unavailable = order('8');
    const sold = order('9', {
      status: 'sold',
      buyer,
      buyerNormalized: buyer,
      soldAt: new Date('2026-08-30T11:00:00.000Z'),
    });
    const context = dependencies({
      sellerOrders: [revoked, transferred, unavailable, sold],
      inspections: new Map([
        [revoked.orderId, inspection({ contractState: 5, marketplaceApproved: false })],
        [transferred.orderId, inspection({ contractState: 5, ownerNormalized: buyer })],
        [unavailable.orderId, inspection({
          contractState: null,
          ownerNormalized: null,
          marketplaceApproved: null,
        })],
      ]),
    });

    const result = await listSellerUkiMarketplaceOrders(
      { walletAddress: seller.toUpperCase().replace('0X', '0x') },
      context.dependencies,
    );

    expect(result.map(({ status, attentionReason }) => ({ status, attentionReason }))).toEqual([
      { status: 'requires_attention', attentionReason: 'approval_required' },
      { status: 'invalid', attentionReason: null },
      { status: 'invalid', attentionReason: 'verification_unavailable' },
      { status: 'sold', attentionReason: null },
    ]);
    expect(context.liveReader.inspectOrders).toHaveBeenCalledWith([
      revoked,
      transferred,
      unavailable,
    ]);
  });

  it('fails closed for an unconfigured runtime and rejects unbounded input', async () => {
    const unconfigured = dependencies({ ready: false });
    await expect(
      listPublicUkiMarketplaceOrders({}, unconfigured.dependencies),
    ).rejects.toBeInstanceOf(UkiMarketplaceUnavailableError);

    const ready = dependencies();
    await expect(
      listPublicUkiMarketplaceOrders({ limit: 51 }, ready.dependencies),
    ).rejects.toBeInstanceOf(UkiMarketplaceValidationError);
    await expect(
      listSellerUkiMarketplaceOrders(
        { walletAddress: 'not-a-wallet' },
        ready.dependencies,
      ),
    ).rejects.toBeInstanceOf(UkiMarketplaceValidationError);
  });
});

describe('UKI marketplace runtime boundary', () => {
  const base = {
    APP_ENV: 'staging',
    NEXT_PUBLIC_APP_ENV: 'staging',
    NEXT_PUBLIC_UKI_CHAIN_ID: '97',
    CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID: '97',
    NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: marketplace,
    CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: marketplace,
    CHAIN_INDEXER_BSC_RPC_URL: 'https://rpc.test.invalid',
  };

  it('accepts only a coherent Stage/Testnet 97 configuration', () => {
    expect(resolveUkiMarketplaceRuntime(base)).toEqual({
      ready: true,
      chainId: 97,
      marketplaceAddress: marketplace,
      rpcUrls: ['https://rpc.test.invalid/'],
      issues: [],
    });
  });

  it('preserves the fallback endpoints when the first RPC is unavailable', () => {
    expect(resolveUkiMarketplaceRuntime({
      ...base,
      CHAIN_INDEXER_BSC_RPC_URLS: 'https://primary.invalid,https://secondary.invalid',
    })).toMatchObject({
      ready: true,
      rpcUrls: ['https://primary.invalid/', 'https://secondary.invalid/'],
    });
  });

  it.each([
    [{ ...base, NEXT_PUBLIC_UKI_CHAIN_ID: '56' }, 'chain'],
    [{ ...base, APP_ENV: 'production', NEXT_PUBLIC_APP_ENV: 'production' }, 'Production'],
    [{ ...base, CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: collection }, 'address'],
    [{ ...base, NEXT_PUBLIC_UKI_MARKETPLACE_ADDRESS: '' }, 'address'],
    [{ ...base, CHAIN_INDEXER_UKI_MARKETPLACE_ADDRESS: '' }, 'address'],
    [{ ...base, CHAIN_INDEXER_BSC_RPC_URL: '' }, 'RPC'],
  ])('fails closed on a mismatched boundary', (environment, expectedIssue) => {
    const runtime = resolveUkiMarketplaceRuntime(environment);
    expect(runtime.ready).toBe(false);
    expect(runtime.issues.join(' ')).toContain(expectedIssue);
  });
});
