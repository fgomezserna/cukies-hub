jest.mock('@/lib/prisma', () => ({
  prisma: {
    telegramLinkChallenge: { upsert: jest.fn() },
  },
}));

jest.mock('@/lib/auth-utils', () => ({
  verifyWalletAuth: jest.fn(),
}));

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';

import { POST as generateChallenge } from '@/app/api/telegram/generate-code/route';
import { POST as retiredById } from '@/app/api/telegram/verify-by-id/route';
import { POST as retiredMembership } from '@/app/api/telegram/verify-membership/route';
import { POST as retiredSimple } from '@/app/api/telegram/verify-simple/route';
import { verifyWalletAuth } from '@/lib/auth-utils';
import { prisma } from '@/lib/prisma';

const mockVerifyWalletAuth = verifyWalletAuth as jest.Mock;
const mockUpsertChallenge = prisma.telegramLinkChallenge.upsert as jest.Mock;

function challengeRequest() {
  return new NextRequest('http://localhost/api/telegram/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ walletAddress: '0xAuthenticatedWallet' }),
  });
}

describe('POST /api/telegram/generate-code', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyWalletAuth.mockResolvedValue({
      id: '507f1f77bcf86cd799439011',
      walletAddress: '0xAuthenticatedWallet',
    });
    mockUpsertChallenge.mockResolvedValue({ id: 'challenge-id' });
  });

  it('creates a 256-bit challenge, persists only its hash, and expires it after ten minutes', async () => {
    const before = Date.now();
    const response = await generateChallenge(challengeRequest());
    const after = Date.now();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body.verificationCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.verificationCommand).toBe(`/verify ${body.verificationCode}`);
    expect(body.expiresAt).toBeGreaterThanOrEqual(before + 10 * 60 * 1000);
    expect(body.expiresAt).toBeLessThanOrEqual(after + 10 * 60 * 1000);

    const persisted = mockUpsertChallenge.mock.calls[0][0];
    const expectedHash = createHash('sha256')
      .update(body.verificationCode, 'utf8')
      .digest('hex');
    expect(persisted).toEqual({
      where: { userId: '507f1f77bcf86cd799439011' },
      create: {
        userId: '507f1f77bcf86cd799439011',
        tokenHash: expectedHash,
        expiresAt: expect.any(Date),
      },
      update: {
        tokenHash: expectedHash,
        expiresAt: expect.any(Date),
        consumedAt: null,
        consumedTelegramUserId: null,
        consumedTelegramUsername: null,
        consumedTelegramDisplay: null,
      },
    });
    expect(JSON.stringify(persisted)).not.toContain(body.verificationCode);
  });

  it('replaces the previous user challenge with a fresh unpredictable token', async () => {
    const first = await (await generateChallenge(challengeRequest())).json();
    const second = await (await generateChallenge(challengeRequest())).json();

    expect(first.verificationCode).not.toBe(second.verificationCode);
    expect(mockUpsertChallenge).toHaveBeenCalledTimes(2);
  });
});

describe('retired Telegram verification routes', () => {
  it.each([
    ['verify-by-id', retiredById],
    ['verify-simple', retiredSimple],
    ['verify-membership', retiredMembership],
  ])('returns 410 from %s without parsing input or making network calls', async (_name, handler) => {
    const json = jest.fn();
    const fetchSpy = jest.fn();
    const previousFetch = global.fetch;
    global.fetch = fetchSpy as typeof fetch;

    try {
      const response = await handler({ json } as unknown as Request);
      expect(response.status).toBe(410);
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(json).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      global.fetch = previousFetch;
    }
  });
});
