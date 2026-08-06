import { NextRequest } from 'next/server';

import { GET, POST } from '@/app/api/economy/v1/cukie-master/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import {
  getCukieMasterNftInventory,
  getCukieMasterWalletStatus,
  mutateCukieMasterNft,
} from '@/lib/uki-economy/cukie-master';

jest.mock('@/lib/auth-utils', () => ({ verifyWalletAuth: jest.fn() }));
jest.mock('@/lib/uki-economy/cukie-master', () => ({
  getCukieMasterWalletStatus: jest.fn(),
  getCukieMasterNftInventory: jest.fn(),
  mutateCukieMasterNft: jest.fn(),
}));

const WALLET = `0x${'1'.repeat(40)}`;
const mockVerify = verifyWalletAuth as jest.MockedFunction<typeof verifyWalletAuth>;
const mockStatus = getCukieMasterWalletStatus as jest.MockedFunction<
  typeof getCukieMasterWalletStatus
>;
const mockInventory = getCukieMasterNftInventory as jest.MockedFunction<
  typeof getCukieMasterNftInventory
>;
const mockMutate = mutateCukieMasterNft as jest.MockedFunction<typeof mutateCukieMasterNft>;

function request(walletAddress = WALLET) {
  return new NextRequest(
    `http://localhost/api/economy/v1/cukie-master?walletAddress=${walletAddress}`,
  );
}

function route(routeName: 'uki' | 'nft') {
  return {
    position: {
      _id: `${WALLET}:${routeName}`,
      walletAddress: WALLET,
      walletNormalized: WALLET,
      route: routeName,
      status: 'active' as const,
      desiredSlots: 1,
      allocatedSlots: 1,
      protectedSlots: 0,
      qualifiedSince: new Date('2026-07-09T12:00:00.000Z'),
      activeFrom: new Date('2026-07-10T12:00:00.000Z'),
      requirementSnapshot: routeName === 'uki'
        ? { route: 'uki' as const, ukiRaw: '20000000000000000000000' }
        : { route: 'nft' as const, nftPoints: 3 },
      source: {} as never,
      sourceHash: 'secret-source-hash',
      ruleVersion: 'cukie-master-v1',
      roundId: `${routeName}:v1`,
      revision: 1,
      createdAt: new Date('2026-07-09T12:00:00.000Z'),
      updatedAt: new Date('2026-07-10T12:00:00.000Z'),
    },
    slots: [{
      _id: `${WALLET}:${routeName}:1`,
      walletAddress: WALLET,
      walletNormalized: WALLET,
      route: routeName,
      ordinal: 1,
      eligibilityEpoch: 1,
      status: 'active' as const,
      qualifiedSince: new Date('2026-07-09T12:00:00.000Z'),
      creditEligibleFrom: new Date('2026-07-10T12:00:00.000Z'),
      roundId: `${routeName}:v1`,
      ruleVersion: 'cukie-master-v1',
      sourceHash: 'secret-slot-hash',
      revision: 1,
      createdAt: new Date('2026-07-09T12:00:00.000Z'),
      updatedAt: new Date('2026-07-10T12:00:00.000Z'),
    }],
    nextSlotRequirement: routeName === 'uki'
      ? { route: 'uki' as const, ukiRaw: '20000000000000000000000' }
      : { route: 'nft' as const, nftPoints: 3 },
    currentRequirement: routeName === 'uki'
      ? { route: 'uki' as const, ukiRaw: '20000000000000000000000' }
      : { route: 'nft' as const, nftPoints: 3 },
    pendingRequirement: null,
    requirementGraceEndsAt: null,
    deficitToNextSlot: routeName === 'uki'
      ? { route: 'uki' as const, ukiRaw: '20000000000000000000000' }
      : { route: 'nft' as const, nftPoints: 3 },
    deficitToPreserveSlots: null,
    countdownEndsAt: null,
    sourceCompleteness: {
      complete: true,
      warnings: ['internal warning must not leak'],
      presaleRaw: true,
      vestingRaw: true,
      stakingRaw: true,
      nftInventory: true,
      indexerHealth: true,
    },
  };
}

describe('GET /api/economy/v1/cukie-master', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInventory.mockResolvedValue([]);
  });

  it('requires the signed wallet session', async () => {
    mockVerify.mockRejectedValue(new Error('unauthorized'));
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'WALLET_SESSION_REQUIRED',
    });
    expect(mockStatus).not.toHaveBeenCalled();
  });

  it('returns a no-store public DTO without source refs or hashes', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    mockStatus.mockResolvedValue({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki: route('uki'), nft: route('nft') },
      totals: { desiredSlots: 2, allocatedSlots: 2, maxPotentialSlots: 10 },
    });

    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(body.data.totals.maxPotentialSlots).toBe(10);
    expect(body.data.routes.uki.slots[0]).not.toHaveProperty('_id');
    expect(JSON.stringify(body)).not.toMatch(/sourceHash|refs|internal warning/);
  });

  it('fails closed when the economy source is unavailable', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    mockStatus.mockRejectedValue(new Error('indexer stale'));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      status: 'error',
      code: 'CUKIE_MASTER_UNAVAILABLE',
    });
  });
});

describe('POST /api/economy/v1/cukie-master', () => {
  beforeEach(() => jest.clearAllMocks());

  function post(body: Record<string, unknown>) {
    return new NextRequest('http://localhost/api/economy/v1/cukie-master', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  const command = {
    walletAddress: WALLET,
    operation: 'soft_stake',
    assetId: 'cukies:1',
    idempotencyKey: 'cukie-master-ui:stake:1',
  } as const;

  it('requires the wallet session before any NFT mutation', async () => {
    mockVerify.mockRejectedValue(new Error('unauthorized'));
    const response = await POST(post(command));
    expect(response.status).toBe(401);
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('returns only the safe lock and recalculated NFT position', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    mockMutate.mockResolvedValue({
      operation: 'soft_stake',
      assetId: 'cukies:1',
      lock: { lockId: 'lock-1', status: 'active', fencingToken: 1 },
      nftPosition: {
        status: 'qualifying', desiredSlots: 1, allocatedSlots: 1, protectedSlots: 0,
      } as never,
    });
    const response = await POST(post(command));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mockMutate).toHaveBeenCalledWith(command);
    expect(body.data).toEqual({
      operation: 'soft_stake',
      assetId: 'cukies:1',
      lock: { lockId: 'lock-1', status: 'active', fencingToken: 1 },
      position: { status: 'qualifying', desiredSlots: 1, allocatedSlots: 1, protectedSlots: 0 },
    });
  });

  it('rejects unknown command fields before mutation', async () => {
    const response = await POST(post({ ...command, admin: true }));
    expect(response.status).toBe(400);
    expect(mockMutate).not.toHaveBeenCalled();
  });
});
