jest.mock('@/lib/treasure-hunt-competition/server/runtime', () => ({
  resolveCompetitionRuntime: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/default-service', () => ({
  getCompetitionService: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/settlement-mongo', () => ({
  MongoCompetitionSettlementSource: jest.fn(),
  MongoCompetitionSettlementRepository: jest.fn(),
}));
jest.mock('@/lib/treasure-hunt-competition/server/settlement-close', () => {
  const actual = jest.requireActual('@/lib/treasure-hunt-competition/server/settlement-close');
  return { ...actual, closeTreasureHuntCompetition: jest.fn() };
});

import { POST } from '@/app/api/internal/games/treasure-hunt/competition/settle/route';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { resolveCompetitionRuntime } from '@/lib/treasure-hunt-competition/server/runtime';
import {
  closeTreasureHuntCompetition,
  CompetitionSettlementCloseError,
} from '@/lib/treasure-hunt-competition/server/settlement-close';
import {
  MongoCompetitionSettlementRepository,
  MongoCompetitionSettlementSource,
} from '@/lib/treasure-hunt-competition/server/settlement-mongo';

const SECRET = 'treasure-hunt-settlement-secret-123456789';
const mockResolveRuntime = resolveCompetitionRuntime as jest.MockedFunction<
  typeof resolveCompetitionRuntime
>;
const mockGetCompetitionService = getCompetitionService as jest.MockedFunction<
  typeof getCompetitionService
>;
const mockClose = closeTreasureHuntCompetition as jest.MockedFunction<
  typeof closeTreasureHuntCompetition
>;
const mockSource = MongoCompetitionSettlementSource as jest.MockedClass<
  typeof MongoCompetitionSettlementSource
>;
const mockRepository = MongoCompetitionSettlementRepository as jest.MockedClass<
  typeof MongoCompetitionSettlementRepository
>;

function request(token?: string) {
  return new Request('https://hub.test/api/internal/games/treasure-hunt/competition/settle', {
    method: 'POST',
    headers: token === undefined ? undefined : { Authorization: `Bearer ${token}` },
  });
}

describe('POST internal Treasure Hunt settlement', () => {
  const previousSecret = process.env.TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET;
  const recoverPendingFinishes = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET = SECRET;
    mockResolveRuntime.mockReturnValue({
      configured: true,
      enabled: true,
      phase: 'closed',
      campaign: null,
      issues: [],
    });
    recoverPendingFinishes.mockResolvedValue({
      scanned: 0,
      recovered: 0,
      alreadyFinalized: 0,
      failed: 0,
      remainingPending: 0,
      complete: true,
    });
    mockGetCompetitionService.mockReturnValue({
      recoverPendingFinishes,
    } as never);
    mockClose.mockImplementation(async (input) => {
      await input.prepareSource?.();
      return {
        created: true,
        snapshot: { campaignId: 'uki-presale-2026', manifest: { inputHash: 'sha256:abc' } },
      } as never;
    });
  });

  afterAll(() => {
    if (previousSecret === undefined) {
      delete process.env.TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET;
    } else {
      process.env.TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET = previousSecret;
    }
  });

  it.each([undefined, 'short-secret'])('fails closed with 503 when the dedicated secret is %s', async (secret) => {
    if (secret === undefined) delete process.env.TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET;
    else process.env.TREASURE_HUNT_COMPETITION_SETTLEMENT_SECRET = secret;

    const response = await POST(request(SECRET));

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'SETTLEMENT_NOT_CONFIGURED',
        message: 'Competition settlement is not configured',
      },
    });
    expect(recoverPendingFinishes).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it.each([undefined, 'wrong-secret'])('returns 401 without the exact Bearer credential', async (token) => {
    const response = await POST(request(token));

    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    });
    expect(mockResolveRuntime).not.toHaveBeenCalled();
    expect(recoverPendingFinishes).not.toHaveBeenCalled();
    expect(mockClose).not.toHaveBeenCalled();
  });

  it('closes through the resolved runtime and returns the newly persisted snapshot', async () => {
    const response = await POST(request(SECRET));

    expect(response.status).toBe(201);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({
      created: true,
      idempotent: false,
      snapshot: { campaignId: 'uki-presale-2026', manifest: { inputHash: 'sha256:abc' } },
    });
    expect(mockResolveRuntime).toHaveBeenCalledTimes(1);
    expect(recoverPendingFinishes).toHaveBeenCalledTimes(1);
    expect(mockSource).toHaveBeenCalledTimes(1);
    expect(mockRepository).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledWith(expect.objectContaining({
      runtime: expect.objectContaining({ phase: 'closed' }),
      source: expect.anything(),
      repository: expect.anything(),
      now: expect.any(Date),
    }));
  });

  it('recovers pending finishes before entering settlement source readiness', async () => {
    const order: string[] = [];
    recoverPendingFinishes.mockImplementationOnce(async () => {
      order.push('recover');
      return {
        scanned: 1,
        recovered: 1,
        alreadyFinalized: 0,
        failed: 0,
        remainingPending: 0,
        complete: true,
      };
    });
    mockClose.mockImplementationOnce(async (input) => {
      await input.prepareSource?.();
      order.push('close');
      return {
        created: true,
        snapshot: { campaignId: 'uki-presale-2026' },
      } as never;
    });

    const response = await POST(request(SECRET));

    expect(response.status).toBe(201);
    expect(order).toEqual(['recover', 'close']);
  });

  it('blocks settlement while finish authority remains unresolved', async () => {
    recoverPendingFinishes.mockResolvedValueOnce({
      scanned: 1,
      recovered: 0,
      alreadyFinalized: 0,
      failed: 1,
      remainingPending: 1,
      complete: false,
    });

    const response = await POST(request(SECRET));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'SETTLEMENT_SOURCE_NOT_READY',
        message: 'Competition settlement source is not ready',
      },
    });
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('does not enter settlement when finish recovery fails unexpectedly', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    recoverPendingFinishes.mockRejectedValueOnce(new Error('sensitive authority failure'));

    const response = await POST(request(SECRET));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(body)).not.toContain('sensitive authority failure');
    expect(mockClose).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it('reports a replay as idempotent without submitting any transaction', async () => {
    mockClose.mockResolvedValueOnce({
      created: false,
      snapshot: { campaignId: 'uki-presale-2026', vestingPlan: [{ transactionStatus: 'not_submitted' }] },
    } as never);

    const response = await POST(request(SECRET));

    expect(response.status).toBe(200);
    expect(recoverPendingFinishes).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      created: false,
      idempotent: true,
      snapshot: {
        campaignId: 'uki-presale-2026',
        vestingPlan: [{ transactionStatus: 'not_submitted' }],
      },
    });
  });

  it.each([
    ['competition_not_closed', 409, 'COMPETITION_NOT_CLOSED'],
    ['invalid_settlement_input', 422, 'INVALID_SETTLEMENT_INPUT'],
    ['settlement_source_not_ready', 409, 'SETTLEMENT_SOURCE_NOT_READY'],
    ['settlement_input_conflict', 409, 'SETTLEMENT_INPUT_CONFLICT'],
  ] as const)('maps the safe close error %s', async (code, status, publicCode) => {
    mockClose.mockRejectedValueOnce(new CompetitionSettlementCloseError(code, 'sensitive detail'));

    const response = await POST(request(SECRET));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(body).toEqual({
      error: { code: publicCode, message: expect.any(String) },
    });
    expect(JSON.stringify(body).includes('sensitive detail')).toBe(false);
  });

  it('does not expose unexpected server errors', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockClose.mockRejectedValueOnce(new Error('database password leaked'));

    const response = await POST(request(SECRET));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    });
    expect(JSON.stringify(body).includes('database password')).toBe(false);
    errorSpy.mockRestore();
  });
});
