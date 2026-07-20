jest.mock('@/lib/treasure-hunt-competition/server/default-service', () => ({
  getCompetitionService: jest.fn(),
}));

import {
  GET as getReviewAttempt,
  POST as adjudicateReviewAttempt,
} from '@/app/api/internal/games/treasure-hunt/competition/review/[attemptId]/route';
import { GET as listReviewAttemptsRoute } from '@/app/api/internal/games/treasure-hunt/competition/review/route';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { CompetitionServiceError } from '@/lib/treasure-hunt-competition/server/service';

const SECRET = 'treasure-hunt-review-secret-1234567890123';
const REVIEW_ACTOR = 'review-key:e42d697f4de39a9c';
const mockGetCompetitionService = getCompetitionService as jest.MockedFunction<
  typeof getCompetitionService
>;

function request(path: string, options: RequestInit = {}, token = SECRET) {
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return new Request(`https://hub.test${path}`, { ...options, headers });
}

const context = { params: Promise.resolve({ attemptId: 'attempt-1' }) };

describe('internal Treasure Hunt review routes', () => {
  const previousSecret = process.env.TREASURE_HUNT_COMPETITION_REVIEW_SECRET;
  const listReviewAttempts = jest.fn();
  const getAttemptForReview = jest.fn();
  const adjudicateAttempt = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TREASURE_HUNT_COMPETITION_REVIEW_SECRET = SECRET;
    listReviewAttempts.mockResolvedValue([]);
    getAttemptForReview.mockResolvedValue({
      attemptId: 'attempt-1',
      status: 'review',
      evidence: [{ sequence: 1, kind: 'finish', digest: 'digest-2' }],
    });
    adjudicateAttempt.mockResolvedValue({
      idempotent: false,
      attempt: {
        attemptId: 'attempt-1',
        status: 'valid',
        reviewDecision: 'valid',
        reviewReason: 'Evidence verified',
        reviewer: REVIEW_ACTOR,
        reviewedAt: '2026-07-21T00:00:00.000Z',
      },
    });
    mockGetCompetitionService.mockReturnValue({
      listReviewAttempts,
      getAttemptForReview,
      adjudicateAttempt,
    } as never);
  });

  afterAll(() => {
    if (previousSecret === undefined) {
      delete process.env.TREASURE_HUNT_COMPETITION_REVIEW_SECRET;
    } else {
      process.env.TREASURE_HUNT_COMPETITION_REVIEW_SECRET = previousSecret;
    }
  });

  it('fails closed when the shared internal secret is missing', async () => {
    delete process.env.TREASURE_HUNT_COMPETITION_REVIEW_SECRET;

    const response = await listReviewAttemptsRoute(request(
      '/api/internal/games/treasure-hunt/competition/review',
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(mockGetCompetitionService).not.toHaveBeenCalled();
  });

  it('rejects a request without the exact Bearer secret', async () => {
    const response = await listReviewAttemptsRoute(request(
      '/api/internal/games/treasure-hunt/competition/review',
      {},
      'wrong-secret',
    ));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
    });
    expect(mockGetCompetitionService).not.toHaveBeenCalled();
  });

  it('lists review records with their internal evidence', async () => {
    listReviewAttempts.mockResolvedValueOnce([{
      attemptId: 'attempt-1',
      status: 'review',
      evidence: [{ sequence: 1, kind: 'finish', digest: 'digest-2' }],
    }]);

    const response = await listReviewAttemptsRoute(request(
      '/api/internal/games/treasure-hunt/competition/review?limit=25',
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attempts: [{
        attemptId: 'attempt-1',
        evidence: [{ kind: 'finish', digest: 'digest-2' }],
      }],
    });
    expect(listReviewAttempts).toHaveBeenCalledWith(25);
  });

  it('returns a single attempt and full evidence for review', async () => {
    const response = await getReviewAttempt(request(
      '/api/internal/games/treasure-hunt/competition/review/attempt-1',
    ), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      attempt: { attemptId: 'attempt-1', status: 'review', evidence: expect.any(Array) },
    });
    expect(getAttemptForReview).toHaveBeenCalledWith('attempt-1');
  });

  it('adjudicates through the service and reports exact idempotency', async () => {
    const body = {
      decision: 'valid',
      reason: 'Evidence verified',
    };
    const response = await adjudicateReviewAttempt(request(
      '/api/internal/games/treasure-hunt/competition/review/attempt-1',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    ), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      idempotent: false,
      attempt: { status: 'valid', reviewReason: body.reason },
    });
    expect(adjudicateAttempt).toHaveBeenCalledWith({
      attemptId: 'attempt-1',
      ...body,
      reviewer: REVIEW_ACTOR,
    });
  });

  it('rejects malformed JSON before invoking adjudication', async () => {
    const response = await adjudicateReviewAttempt(request(
      '/api/internal/games/treasure-hunt/competition/review/attempt-1',
      { method: 'POST', body: '{' },
    ), context);

    expect(response.status).toBe(400);
    expect(adjudicateAttempt).not.toHaveBeenCalled();
  });

  it('maps review conflicts without exposing another audit payload', async () => {
    adjudicateAttempt.mockRejectedValueOnce(new CompetitionServiceError(
      'REVIEW_CONFLICT',
      'Competition attempt review has already been decided or is not reviewable',
      409,
    ));

    const response = await adjudicateReviewAttempt(request(
      '/api/internal/games/treasure-hunt/competition/review/attempt-1',
      {
        method: 'POST',
        body: JSON.stringify({
          decision: 'invalid',
          reason: 'Different decision',
          reviewer: 'ops@example.test',
        }),
      },
    ), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'REVIEW_CONFLICT' },
    });
  });
});
