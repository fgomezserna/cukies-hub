jest.mock('server-only', () => ({}), { virtual: true });
jest.mock('@/lib/uki-marketplace/repository', () => ({
  MongoUkiMarketplaceRepository: jest.fn(),
}));
jest.mock('@/lib/uki-marketplace/live', () => ({
  ViemUkiMarketplaceLiveReader: jest.fn(),
}));

import {
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
    ? { ready: false, chainId: null, marketplaceAddress: null, rpcUrl: null, issues: ['missing'] }
    : {
        ready: true,
        chainId: 97 as const,
        marketplaceAddress: marketplace as `0x${string}`,
        rpcUrl: 'https://rpc.test.invalid/',
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
      rpcUrl: 'https://rpc.test.invalid/',
      issues: [],
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
