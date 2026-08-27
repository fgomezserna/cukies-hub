jest.mock('@/lib/auth-utils', () => ({ verifyWalletAuth: jest.fn() }));
jest.mock('@/lib/uki-economy/cukie-pool', () => ({
  depositCukiePoolPosition: jest.fn(),
  getCukiePoolNftVaultMode: jest.fn(),
  listCukiePoolWalletPositions: jest.fn(),
  requestCukiePoolWithdrawal: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET, POST } from '@/app/api/economy/v1/cukie-pool/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import {
  depositCukiePoolPosition,
  getCukiePoolNftVaultMode,
  listCukiePoolWalletPositions,
  requestCukiePoolWithdrawal,
} from '@/lib/uki-economy/cukie-pool';

const wallet = '0x1111111111111111111111111111111111111111';
const publicPosition = {
  positionId: 'position-1',
  assetId: 'bsc:0x2222222222222222222222222222222222222222:1',
  tokenId: '1',
  generation: 'original',
  rarity: 'rare',
  gamesQuota: 6,
  gamesRemaining: 6,
  status: 'active',
  lifecycleOpen: true,
  stakedAt: new Date('2026-07-10T10:00:00.000Z'),
  eligibleAt: new Date('2026-07-11T10:00:00.000Z'),
  lockId: 'private-lock',
  lockFencingToken: 3,
  idempotencyKey: 'private-idempotency',
  requestHash: 'private-hash',
  revision: 0,
};

function post(body: unknown) {
  return new NextRequest('http://localhost/api/economy/v1/cukie-pool', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'pool:test-1' },
    body: JSON.stringify(body),
  });
}

describe('/api/economy/v1/cukie-pool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCukiePoolNftVaultMode as jest.Mock).mockReturnValue('legacy');
    (verifyWalletAuth as jest.Mock).mockResolvedValue({ id: 'user-1' });
    (listCukiePoolWalletPositions as jest.Mock).mockResolvedValue({
      walletNormalized: wallet,
      positions: [{ positionId: 'position-1', status: 'active' }],
      nextCursor: null,
      sourceHealthy: true,
    });
    (depositCukiePoolPosition as jest.Mock).mockResolvedValue(publicPosition);
    (requestCukiePoolWithdrawal as jest.Mock).mockResolvedValue({
      ...publicPosition,
      status: 'withdrawn',
      lifecycleOpen: false,
      revision: 1,
    });
  });

  it('lists only positions for the authenticated wallet with no-store', async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/cukie-pool?walletAddress=${wallet}&limit=50`,
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(listCukiePoolWalletPositions).toHaveBeenCalledWith({
      walletAddress: wallet,
      cursor: null,
      limit: 50,
    });
  });

  it('deposits through the service and strips lock/fencing internals', async () => {
    const response = await POST(post({
      action: 'deposit',
      walletAddress: wallet,
      assetId: publicPosition.assetId,
    }));

    expect(response.status).toBe(200);
    expect(depositCukiePoolPosition).toHaveBeenCalledWith({
      walletAddress: wallet,
      assetId: publicPosition.assetId,
      idempotencyKey: 'pool:test-1',
    });
    const body = await response.json();
    expect(body.data.positionId).toBe('position-1');
    expect(body.data.lockId).toBeUndefined();
    expect(body.data.lockFencingToken).toBeUndefined();
    expect(body.data.requestHash).toBeUndefined();
  });

  it('withdraws with an explicit revision and rejects client-controlled extra fields', async () => {
    const withdrawn = await POST(post({
      action: 'withdraw',
      walletAddress: wallet,
      positionId: 'position-1',
      expectedRevision: 0,
    }));
    expect(withdrawn.status).toBe(200);
    expect(requestCukiePoolWithdrawal).toHaveBeenCalledWith(expect.objectContaining({
      positionId: 'position-1',
      expectedRevision: 0,
    }));

    const invalid = await POST(post({
      action: 'deposit',
      walletAddress: wallet,
      assetId: publicPosition.assetId,
      now: 'client-controlled',
    }));
    expect(invalid.status).toBe(400);
    expect(depositCukiePoolPosition).toHaveBeenCalledTimes(0);
  });

  it('retires both legacy Mongo mutations while the custodial vault is active', async () => {
    (getCukiePoolNftVaultMode as jest.Mock).mockReturnValue('custodial');

    const deposit = await POST(post({
      action: 'deposit',
      walletAddress: wallet,
      assetId: publicPosition.assetId,
    }));
    const withdraw = await POST(post({
      action: 'withdraw',
      walletAddress: wallet,
      positionId: 'position-1',
      expectedRevision: 0,
    }));

    expect(deposit.status).toBe(410);
    await expect(deposit.json()).resolves.toEqual({
      status: 'error',
      code: 'CUKIE_POOL_LEGACY_MUTATIONS_DISABLED',
      mode: 'custodial_vault',
    });
    expect(withdraw.status).toBe(410);
    expect(depositCukiePoolPosition).not.toHaveBeenCalled();
    expect(requestCukiePoolWithdrawal).not.toHaveBeenCalled();
    expect(verifyWalletAuth).not.toHaveBeenCalled();
  });

  it('returns 503 instead of falling back to legacy when vault config is invalid', async () => {
    (getCukiePoolNftVaultMode as jest.Mock).mockReturnValue('invalid');
    const response = await POST(post({
      action: 'deposit',
      walletAddress: wallet,
      assetId: publicPosition.assetId,
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'error',
      code: 'CUKIE_POOL_UNAVAILABLE',
    });
    expect(depositCukiePoolPosition).not.toHaveBeenCalled();
  });
});
