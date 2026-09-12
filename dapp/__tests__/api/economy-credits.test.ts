jest.mock('@/lib/auth-utils', () => ({ verifyWalletAuth: jest.fn() }));
jest.mock('@/lib/uki-economy/credits', () => ({
  competitionCreditService: { configurePool: jest.fn() },
  CREDIT_HISTORY_PAGE_SIZE: 20,
  getCompetitionCreditWalletHistory: jest.fn(),
  getCompetitionCreditWalletStatus: jest.fn(),
}));
jest.mock('@/lib/uki-economy/own-cukie', () => ({
  OWN_CUKIE_DAILY_QUOTA_POLICY_VERSION: 'own-cukie-daily-v1',
  ownCukieService: { availability: jest.fn() },
}));

import { NextRequest } from 'next/server';

import { GET, POST } from '@/app/api/economy/v1/credits/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import {
  competitionCreditService,
  getCompetitionCreditWalletHistory,
  getCompetitionCreditWalletStatus,
} from '@/lib/uki-economy/credits';
import { ownCukieService } from '@/lib/uki-economy/own-cukie';
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
    (ownCukieService.availability as jest.Mock).mockResolvedValue({
      status: 'ready',
      periodId: 'th-day:2026-09-12T14:00:00.000Z',
      periodStartsAt: new Date('2026-09-12T14:00:00.000Z'),
      periodEndsAt: new Date('2026-09-13T14:00:00.000Z'),
      totalGamesRemaining: 6,
      eligibleCukies: 2,
      unknownCukies: 0,
    });
  });

  it('returns only the authenticated wallet status without caching', async () => {
    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store, max-age=0');
    expect(verifyWalletAuth).toHaveBeenCalledWith(wallet);
    expect(getCompetitionCreditWalletStatus).toHaveBeenCalledWith(wallet);
    expect(getCompetitionCreditWalletHistory).toHaveBeenCalledWith(wallet, 0);
    expect(ownCukieService.availability).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: {
        ownCukie: null,
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

  it('incluye la disponibilidad OWN solo cuando el consumidor la solicita', async () => {
    const response = await GET(new NextRequest(
      `http://localhost/api/economy/v1/credits?walletAddress=${wallet}&includeOwnCukie=1`,
    ));

    expect(response.status).toBe(200);
    expect(ownCukieService.availability).toHaveBeenCalledWith(expect.objectContaining({
      walletAddress: wallet,
      quotaPeriod: expect.objectContaining({
        policyVersion: 'own-cukie-daily-v1',
      }),
    }));
    expect(await response.json()).toMatchObject({
      status: 'ok',
      data: {
        ownCukie: {
          status: 'ready',
          totalGamesRemaining: 6,
          eligibleCukies: 2,
        },
      },
    });
  });

  it('no inventa un periodo diario si el calendario acelerado es invalido', async () => {
    const environmentKeys = [
      'APP_ENV',
      'ECONOMY_CYCLE_SECONDS',
      'ECONOMY_CYCLE_ANCHOR_AT',
      'STAGING_ONLY_GUARD',
      'NEXT_PUBLIC_UKI_CHAIN_ID',
      'CHAIN_INDEXER_BSC_EXPECTED_CHAIN_ID',
      'CHAIN_INDEXER_DB_NAME',
    ] as const;
    const previous = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
    process.env.APP_ENV = 'production';
    process.env.ECONOMY_CYCLE_SECONDS = '1800';
    delete process.env.ECONOMY_CYCLE_ANCHOR_AT;
    try {
      const response = await GET(new NextRequest(
        `http://localhost/api/economy/v1/credits?walletAddress=${wallet}&includeOwnCukie=1`,
      ));

      expect(response.status).toBe(200);
      expect(ownCukieService.availability).not.toHaveBeenCalled();
      expect(await response.json()).toMatchObject({
        status: 'ok',
        data: {
          ownCukie: {
            status: 'unknown',
            periodId: null,
            periodStartsAt: null,
            periodEndsAt: null,
            totalGamesRemaining: null,
            eligibleCukies: null,
          },
        },
      });
    } finally {
      for (const key of environmentKeys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
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
