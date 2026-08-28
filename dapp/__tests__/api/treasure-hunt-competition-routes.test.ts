import { cookies } from 'next/headers';

import { readWalletSession } from '@/lib/wallet-auth';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { buildCompetitionLeaderboardWithRewards } from '@/lib/treasure-hunt-competition/server/leaderboard-rewards';
import { getCompetitionRateLimiter } from '@/lib/treasure-hunt-competition/server/rate-limit';
import { POST as startAttempt } from '@/app/api/games/treasure-hunt/competition/attempts/route';
import { POST as checkpointAttempt } from '@/app/api/games/treasure-hunt/competition/attempts/[attemptId]/checkpoint/route';
import { POST as abandonAttempt } from '@/app/api/games/treasure-hunt/competition/attempts/[attemptId]/abandon/route';
import { GET as getLeaderboard } from '@/app/api/games/treasure-hunt/competition/leaderboard/route';

jest.mock('next/headers', () => ({
  cookies: jest.fn(),
}));
jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/default-service', () => ({
  getCompetitionService: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/leaderboard-rewards', () => ({
  buildCompetitionLeaderboardWithRewards: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/leaderboard-rewards-mongo', () => ({
  MongoCompetitionRewardSource: jest.fn(() => ({ source: 'mongo' })),
}));

const mockReadWalletSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockGetCompetitionService = getCompetitionService as jest.MockedFunction<typeof getCompetitionService>;
const mockBuildCompetitionLeaderboardWithRewards =
  buildCompetitionLeaderboardWithRewards as jest.MockedFunction<
    typeof buildCompetitionLeaderboardWithRewards
  >;
const mockCookies = cookies as jest.MockedFunction<typeof cookies>;

const signedWallet = '0x1111111111111111111111111111111111111111';
const service = {
  startAttempt: jest.fn(),
  recordCheckpoint: jest.fn(),
  abandonAttempt: jest.fn(),
  getLeaderboard: jest.fn(),
  getLeaderboardAllocationInput: jest.fn(),
};

function walletSession(walletType: 'evm' | 'tron' = 'evm') {
  return {
    userId: 'user-1',
    walletAddress: signedWallet,
    signedWalletAddress: signedWallet,
    walletType,
    issuedAt: '2026-07-10T00:00:00.000Z',
    expiresAt: '2026-08-10T00:00:00.000Z',
  };
}

describe('Treasure Hunt competition API identity boundaries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCompetitionRateLimiter().reset();
    mockGetCompetitionService.mockReturnValue(service as never);
    mockCookies.mockResolvedValue({
      get: jest.fn(() => ({ value: 'uki-sponsor' })),
    } as never);
    service.startAttempt.mockResolvedValue({ attemptId: 'attempt-1' });
    service.recordCheckpoint.mockResolvedValue({ accepted: true, nextSequence: 1 });
    service.abandonAttempt.mockResolvedValue({ accepted: true, status: 'abandoned' });
    service.getLeaderboard.mockResolvedValue({ campaignId: 'campaign', entries: [] });
    service.getLeaderboardAllocationInput.mockResolvedValue({
      campaign: { campaignId: 'campaign' },
      entries: [],
    });
    mockBuildCompetitionLeaderboardWithRewards.mockResolvedValue({
      campaignId: 'campaign',
      entries: [],
    } as never);
  });

  it('rejects attempt creation without a signed EVM wallet session', async () => {
    mockReadWalletSession.mockResolvedValue(null);

    const response = await startAttempt(new Request('https://hub.test/api', {
      method: 'POST',
      body: JSON.stringify({ gameSessionId: 'game-session-1' }),
    }));

    expect(response.status).toBe(401);
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  it('rejects a TRON session for the BSC competition', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession('tron'));

    const response = await startAttempt(new Request('https://hub.test/api', {
      method: 'POST',
      body: JSON.stringify({ gameSessionId: 'game-session-1' }),
    }));

    expect(response.status).toBe(401);
    expect(service.startAttempt).not.toHaveBeenCalled();
  });

  it('derives attempt identity only from the signed cookie and carries the referral cookie', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession());

    const response = await startAttempt(new Request('https://hub.test/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gameSessionId: 'game-session-1',
        walletAddress: '0x9999999999999999999999999999999999999999',
      }),
    }));

    expect(response.status).toBe(201);
    expect(service.startAttempt).toHaveBeenCalledWith({
      userId: 'user-1',
      walletAddress: signedWallet,
      gameSessionId: 'game-session-1',
      referralCode: 'uki-sponsor',
    });
  });

  it('binds checkpoint evidence to the signed wallet and route attempt id', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession());
    const response = await checkpointAttempt(
      new Request('https://hub.test/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt: 'receipt', sequence: 0, score: 10, gameTimeMs: 5_000 }),
      }),
      { params: Promise.resolve({ attemptId: 'attempt-route' }) },
    );

    expect(response.status).toBe(200);
    expect(service.recordCheckpoint).toHaveBeenCalledWith({
      walletAddress: signedWallet,
      attemptId: 'attempt-route',
      receipt: 'receipt',
      sequence: 0,
      score: 10,
      gameTimeMs: 5_000,
      clientTimestampMs: null,
    });
  });

  it('rejects oversized checkpoint receipts before invoking the service', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession());
    const response = await checkpointAttempt(
      new Request('https://hub.test/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receipt: 'r'.repeat(4_097),
          sequence: 0,
          score: 10,
          gameTimeMs: 5_000,
        }),
      }),
      { params: Promise.resolve({ attemptId: 'attempt-route' }) },
    );

    expect(response.status).toBe(400);
    expect(service.recordCheckpoint).not.toHaveBeenCalled();
  });

  it('binds abandonment to the signed wallet, route attempt and current receipt', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession());
    const response = await abandonAttempt(
      new Request('https://hub.test/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receipt: 'receipt-current', sequence: 3 }),
      }),
      { params: Promise.resolve({ attemptId: 'attempt-abandon' }) },
    );

    expect(response.status).toBe(200);
    expect(service.abandonAttempt).toHaveBeenCalledWith({
      walletAddress: signedWallet,
      attemptId: 'attempt-abandon',
      receipt: 'receipt-current',
      sequence: 3,
    });
  });

  it('builds the public leaderboard preview with bounded pagination and no unsigned identity', async () => {
    mockReadWalletSession.mockResolvedValue(null);
    const response = await getLeaderboard(
      new Request('https://hub.test/api?page=2&pageSize=25&mine=1'),
    );

    expect(response.status).toBe(200);
    expect(service.getLeaderboardAllocationInput).toHaveBeenCalledWith();
    expect(mockBuildCompetitionLeaderboardWithRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        currentWalletAddress: undefined,
        page: 2,
        pageSize: 25,
        mineOnly: true,
      }),
    );
  });

  it('rate-limits repeated attempt starts before invoking the service again', async () => {
    mockReadWalletSession.mockResolvedValue(walletSession());
    const createRequest = () => new Request('https://hub.test/api', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameSessionId: 'game-session-1' }),
    });

    for (let index = 0; index < 10; index += 1) {
      const response = await startAttempt(createRequest());
      expect(response.status).toBe(201);
    }
    const limited = await startAttempt(createRequest());

    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({
      success: false,
      error: 'RATE_LIMITED',
    });
    expect(service.startAttempt).toHaveBeenCalledTimes(10);
  });
});
