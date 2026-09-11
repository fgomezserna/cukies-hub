import { readWalletSession } from '@/lib/wallet-auth';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { getCompetitionRateLimiter } from '@/lib/treasure-hunt-competition/server/rate-limit';
import {
  GET,
  PATCH,
} from '@/app/api/games/treasure-hunt/competition/participant/route';

jest.mock('@/lib/wallet-auth', () => ({
  readWalletSession: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/default-service', () => ({
  getCompetitionService: jest.fn(),
}));

const mockReadWalletSession = readWalletSession as jest.MockedFunction<typeof readWalletSession>;
const mockGetCompetitionService = getCompetitionService as jest.MockedFunction<typeof getCompetitionService>;

const wallet = '0x1111111111111111111111111111111111111111';
const participant = {
  alias: 'WeeklyRunner',
  canonicalAlias: 'weeklyrunner',
  aliasChangedAt: '2026-09-11T12:00:00.000Z',
  createdAt: '2026-09-11T11:00:00.000Z',
};

const service = {
  getParticipant: jest.fn(),
  getWeeklyParticipant: jest.fn(),
  getStakingEligibility: jest.fn(),
  updateAlias: jest.fn(),
  updateWeeklyAlias: jest.fn(),
};

function signedSession() {
  return {
    userId: 'user-1',
    walletAddress: wallet,
    signedWalletAddress: wallet,
    walletType: 'evm' as const,
    issuedAt: '2026-09-11T11:00:00.000Z',
    expiresAt: '2026-09-11T13:00:00.000Z',
  };
}

function jsonBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe('Treasure Hunt participant alias scopes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCompetitionRateLimiter().reset();
    mockReadWalletSession.mockResolvedValue(signedSession());
    mockGetCompetitionService.mockReturnValue(service as never);
    service.getParticipant.mockResolvedValue(participant);
    service.getWeeklyParticipant.mockResolvedValue(participant);
    service.getStakingEligibility.mockResolvedValue(null);
    service.updateAlias.mockResolvedValue(participant);
    service.updateWeeklyAlias.mockResolvedValue(participant);
  });

  it('uses the weekly alias scope without reading staking eligibility', async () => {
    const response = await GET(new Request(
      'https://hub.test/api/games/treasure-hunt/competition/participant?scope=weekly',
    ));

    expect(response.status).toBe(200);
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: true,
      participant,
      eligibility: null,
    });
    expect(service.getWeeklyParticipant).toHaveBeenCalledWith(wallet);
    expect(service.getParticipant).not.toHaveBeenCalled();
    expect(service.getStakingEligibility).not.toHaveBeenCalled();
  });

  it('writes weekly aliases through the signed wallet and keeps the default method separate', async () => {
    const response = await PATCH(new Request(
      'https://hub.test/api/games/treasure-hunt/competition/participant?scope=weekly',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: 'WeeklyRunner' }),
      },
    ));

    expect(response.status).toBe(200);
    expect(service.updateWeeklyAlias).toHaveBeenCalledWith(wallet, 'WeeklyRunner');
    expect(service.updateAlias).not.toHaveBeenCalled();
  });

  it('rejects writes without a signed EVM session before selecting a scope', async () => {
    mockReadWalletSession.mockResolvedValue(null);

    const response = await PATCH(new Request(
      'https://hub.test/api/games/treasure-hunt/competition/participant?scope=weekly',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: 'WeeklyRunner' }),
      },
    ));

    expect(response.status).toBe(401);
    expect(service.updateWeeklyAlias).not.toHaveBeenCalled();
    await expect(jsonBody(response)).resolves.toMatchObject({
      success: false,
      error: 'INVALID_WALLET',
    });
  });
});
