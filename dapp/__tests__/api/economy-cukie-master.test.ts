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
  const completeness = {
    complete: true,
    warnings: ['internal warning must not leak'],
    presaleRaw: true,
    vestingRaw: true,
    stakingRaw: true,
    nftInventory: true,
    indexerHealth: true,
  };
  return {
    roundId: `${routeName}:v1`,
    ruleVersion: 'cukie-master-v1',
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
      sourceHash: 'secret-source-hash',
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
    source: routeName === 'uki' ? {
      route: 'uki' as const,
      totalUkiRaw: '25000000000000000000000',
      presaleLockedRaw: '20000000000000000000000',
      stakedUkiRaw: '5000000000000000000000',
      refs: [{ source: 'secret-ref', collection: 'secret', documentId: 'secret' }],
      completeness,
      sourceHash: 'secret-source-hash',
    } : {
      route: 'nft' as const,
      originalCukiePoints: 3,
      nftAssetIds: ['secret-asset-id'],
      assets: [],
      refs: [{ source: 'secret-ref', collection: 'secret', documentId: 'secret' }],
      completeness,
      sourceHash: 'secret-source-hash',
    },
    sourceCompleteness: completeness,
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
    mockInventory.mockResolvedValue([{
      assetId: 'cukies:42',
      canonicalAssetId: null,
      collectionAddress: null,
      tokenId: '42',
      imageUrl: 'https://cukies.s3.eu-west-3.amazonaws.com/png/tokens/v2/contract/42.png',
      rarity: 'rare',
      rarityPoints: 4,
      contributesToCukieMaster: true,
      contributionPoints: 4,
      state: 'soft_staked',
      custody: 'wallet',
      custodyMode: 'legacy',
      depositEpoch: null,
      blockers: [],
      lock: { lockId: 'lock-42', fencingToken: 2 },
      canSoftStake: false,
      canUnstake: true,
      canDeposit: false,
      canWithdraw: false,
    }]);
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
    expect(body.data.routes.uki.source).toEqual({
      complete: true,
      status: 'available',
      route: 'uki',
      totalUkiRaw: '25000000000000000000000',
      presaleLockedRaw: '20000000000000000000000',
      stakedUkiRaw: '5000000000000000000000',
    });
    expect(body.data.routes.uki.balanceQualifiedSlots).toBe(1);
    expect(body.data.nftInventory[0]).toEqual(expect.objectContaining({
      assetId: 'cukies:42',
      imageUrl: expect.stringContaining('/42.png'),
      contributesToCukieMaster: true,
      contributionPoints: 4,
    }));
    expect(JSON.stringify(body)).not.toMatch(/sourceHash|refs|internal warning|secret-asset-id/);
  });

  it('expone el Cukie Master derivado por saldo aunque el runtime no tenga ronda activa', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    const baseUki = route('uki');
    const uki = {
      ...baseUki,
      roundId: 'uki:cukie-master-v1-5-per-route',
      ruleVersion: 'cukie-master-v1-5-per-route',
      position: null,
      slots: [],
      source: {
        ...baseUki.source,
        totalUkiRaw: '20472512000000000000000',
        presaleLockedRaw: '0',
        stakedUkiRaw: '20472512000000000000000',
      },
      sourceCompleteness: {
        ...baseUki.sourceCompleteness,
        complete: false,
        warnings: ['No existe una ronda activa para la ruta uki.'],
      },
    };
    mockStatus.mockResolvedValue({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki, nft: route('nft') },
      totals: { desiredSlots: 0, allocatedSlots: 0, maxPotentialSlots: 10 },
    } as never);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.routes.uki).toEqual(expect.objectContaining({
      position: null,
      slots: [],
      projectionFresh: false,
      synchronizing: false,
      previewSlots: null,
      balanceQualifiedSlots: 1,
      source: expect.objectContaining({
        complete: true,
        totalUkiRaw: '20472512000000000000000',
        presaleLockedRaw: '0',
        stakedUkiRaw: '20472512000000000000000',
      }),
    }));
  });

  it('oculta Gen2 disponibles pero conserva posiciones custodiadas recuperables', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    const baseAsset = {
      canonicalAssetId: `97:0x${'a'.repeat(40)}:1`,
      collectionAddress: `0x${'a'.repeat(40)}`,
      imageUrl: null,
      rarity: 'rare',
      rarityPoints: 4,
      contributesToCukieMaster: false,
      contributionPoints: 0,
      state: 'blocked',
      custodyMode: 'custodial' as const,
      depositEpoch: null,
      lock: null,
      canSoftStake: false,
      canUnstake: false,
      canDeposit: false,
    };
    mockInventory.mockResolvedValue([
      {
        ...baseAsset,
        assetId: 'gen2-wallet',
        tokenId: '1',
        blockers: ['second_generation'],
        custody: 'wallet',
        canWithdraw: false,
      },
      {
        ...baseAsset,
        assetId: 'gen2-custodied',
        tokenId: '2',
        blockers: ['second_generation'],
        custody: 'cukie_master_nft_vault',
        canWithdraw: true,
      },
      {
        ...baseAsset,
        assetId: 'original-wallet',
        tokenId: '3',
        blockers: [],
        custody: 'wallet',
        canDeposit: true,
        canWithdraw: false,
      },
    ]);
    mockStatus.mockResolvedValue({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki: route('uki'), nft: route('nft') },
      totals: { desiredSlots: 2, allocatedSlots: 2, maxPotentialSlots: 10 },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body.data.nftInventory.map((asset: { assetId: string }) => asset.assetId)).toEqual([
      'gen2-custodied',
      'original-wallet',
    ]);
  });

  it('distingue una sincronización reintentable de una avería explícita del índice NFT', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    const syncingNft = route('nft');
    syncingNft.sourceCompleteness = {
      ...syncingNft.sourceCompleteness,
      complete: false,
      indexerHealth: false,
      warnings: ['Existen eventos NFT pendientes de proyeccion.'],
    };
    mockStatus.mockResolvedValueOnce({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki: route('uki'), nft: syncingNft },
      totals: { desiredSlots: 1, allocatedSlots: 1, maxPotentialSlots: 10 },
    });

    const syncingResponse = await GET(request());
    expect((await syncingResponse.json()).data.nftCustody.indexer.status).toBe('syncing');

    const unavailableNft = route('nft');
    unavailableNft.sourceCompleteness = {
      ...unavailableNft.sourceCompleteness,
      complete: false,
      indexerHealth: false,
      warnings: ['La configuracion publica del vault NFT de Cukie Master es invalida.'],
    };
    mockStatus.mockResolvedValueOnce({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki: route('uki'), nft: unavailableNft },
      totals: { desiredSlots: 1, allocatedSlots: 1, maxPotentialSlots: 10 },
    });

    const unavailableResponse = await GET(request());
    expect((await unavailableResponse.json()).data.nftCustody.indexer.status).toBe('unavailable');
  });

  it.each([
    ['sourceHash', 'stale-source'],
    ['roundId', 'uki:old-round'],
    ['ruleVersion', 'old-rule'],
  ] as const)('oculta posición, slots y totales con %s obsoleto', async (field, value) => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    const uki = route('uki');
    uki.position = { ...uki.position, [field]: value };
    mockStatus.mockResolvedValue({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki, nft: route('nft') },
      totals: { desiredSlots: 2, allocatedSlots: 2, maxPotentialSlots: 10 },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body.data.routes.uki).toEqual(expect.objectContaining({
      position: null,
      slots: [],
      deficitToPreserveSlots: null,
      countdownEndsAt: null,
      projectionFresh: false,
      synchronizing: true,
      previewSlots: 1,
    }));
    expect(body.data.totals).toEqual({
      desiredSlots: 1,
      allocatedSlots: 1,
      maxPotentialSlots: 10,
    });
  });

  it('oculta una posición 5/5 matemáticamente incompatible con la fuente actual', async () => {
    mockVerify.mockResolvedValue({ id: 'user-1' } as never);
    const uki = route('uki');
    uki.position = { ...uki.position, desiredSlots: 5, allocatedSlots: 5 };
    uki.slots = Array.from({ length: 5 }, (_, index) => ({
      ...uki.slots[0],
      _id: `${WALLET}:uki:${index + 1}`,
      ordinal: index + 1,
    }));
    mockStatus.mockResolvedValue({
      walletAddress: WALLET,
      walletNormalized: WALLET,
      routes: { uki, nft: route('nft') },
      totals: { desiredSlots: 6, allocatedSlots: 6, maxPotentialSlots: 10 },
    });

    const response = await GET(request());
    const body = await response.json();

    expect(body.data.routes.uki).toEqual(expect.objectContaining({
      position: null,
      slots: [],
      projectionFresh: false,
      synchronizing: true,
      previewSlots: 1,
    }));
    expect(body.data.totals).toEqual({
      desiredSlots: 1,
      allocatedSlots: 1,
      maxPotentialSlots: 10,
    });
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
