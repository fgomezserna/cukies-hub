jest.mock('@/lib/auth-utils', () => ({ verifyWalletAuth: jest.fn() }));
jest.mock('@/lib/uki-economy/credits', () => ({
  competitionCreditService: { configurePool: jest.fn() },
  CREDIT_HISTORY_PAGE_SIZE: 20,
  getCompetitionCreditWalletHistory: jest.fn(),
  getCompetitionCreditWalletStatus: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { GET, POST } from '@/app/api/economy/v1/credits/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import {
  competitionCreditService,
  getCompetitionCreditWalletHistory,
  getCompetitionCreditWalletStatus,
} from '@/lib/uki-economy/credits';
import { DomainConflictError } from '@/lib/uki-economy/errors';

const wallet = '0x1111111111111111111111111111111111111111';

function getRequest() {
  return new NextRequest(`http://localhost/api/economy/v1/credits?walletAddress=${wallet}`);
}

function postRequest(body: unknown, idempotencyKey = 'credit-config:test-1') {
  return new NextRequest('http://localhost/api/economy/v1/credits', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('/api/economy/v1/credits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyWalletAuth as jest.Mock).mockResolvedValue({ id: 'user-1' });
    (getCompetitionCreditWalletStatus as jest.Mock).mockResolvedValue({
      walletNormalized: wallet,
      balance: { availableCredits: 100, blocked: false },
      configurations: [],
    });
    (getCompetitionCreditWalletHistory as jest.Mock).mockResolvedValue({
      page: 0,
      pageSize: 20,
      hasMore: false,
      totals: {
        receivedCredits: 100,
        spentCredits: 10,
        poolContributedCredits: 20,
        expiredCredits: 0,
      },
      nextExpiry: { credits: 70, at: new Date('2026-07-11T12:00:00.000Z') },
      entries: [],
    });
    (competitionCreditService.configurePool as jest.Mock).mockResolvedValue({
      configId: 'config-1',
      slotId: 'slot-1',
      eligibilityEpoch: 1,
      poolCreditsPerSlot: 20,
      requestedAt: new Date('2026-07-10T10:00:00.000Z'),
      effectiveCutoff: new Date('2026-07-11T12:00:00.000Z'),
      ruleVersion: 'credits-v1',
    });
  });

  it('returns only the authenticated wallet status without caching', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(verifyWalletAuth).toHaveBeenCalledWith(wallet);
    expect(getCompetitionCreditWalletStatus).toHaveBeenCalledWith(wallet);
    expect(getCompetitionCreditWalletHistory).toHaveBeenCalledWith(wallet, 0);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: {
        history: {
          available: true,
          totals: { receivedCredits: 100, spentCredits: 10 },
        },
      },
    });
  });

  it('keeps the balance available when the optional history cannot be loaded', async () => {
    (getCompetitionCreditWalletHistory as jest.Mock).mockRejectedValue(new Error('history unavailable'));

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: {
        balance: { availableCredits: 100 },
        history: { available: false, page: 0, entries: [] },
      },
    });
  });

  it('rejects an invalid history page before reading private wallet data', async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/credits?walletAddress=${wallet}&historyPage=101`,
    ));

    expect(response.status).toBe(400);
    expect(verifyWalletAuth).not.toHaveBeenCalled();
    expect(getCompetitionCreditWalletStatus).not.toHaveBeenCalled();
  });

  it('configures one owned slot with a required idempotency key', async () => {
    const response = await POST(postRequest({
      walletAddress: wallet,
      slotId: 'slot-1',
      poolCreditsPerSlot: 20,
    }));

    expect(response.status).toBe(200);
    expect(competitionCreditService.configurePool).toHaveBeenCalledWith(expect.objectContaining({
      walletAddress: wallet,
      slotId: 'slot-1',
      poolCreditsPerSlot: 20,
      idempotencyKey: 'credit-config:test-1',
    }));
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: { configId: 'config-1', poolCreditsPerSlot: 20 },
    });
  });

  it('rejects extra fields and missing idempotency before mutation', async () => {
    const extra = await POST(postRequest({
      walletAddress: wallet,
      slotId: 'slot-1',
      poolCreditsPerSlot: 20,
      now: 'client-controlled',
    }));
    expect(extra.status).toBe(400);

    const missingKey = await POST(postRequest({
      walletAddress: wallet,
      slotId: 'slot-1',
      poolCreditsPerSlot: 20,
    }, ''));
    expect(missingKey.status).toBe(400);
    expect(competitionCreditService.configurePool).not.toHaveBeenCalled();
  });

  it('maps domain conflicts to a stable code without leaking details', async () => {
    (competitionCreditService.configurePool as jest.Mock).mockRejectedValue(
      new DomainConflictError('internal slot and rule details'),
    );
    const response = await POST(postRequest({
      walletAddress: wallet,
      slotId: 'slot-1',
      poolCreditsPerSlot: 20,
    }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ status: 'error', code: 'CREDIT_STATE_CONFLICT' });
  });
});
