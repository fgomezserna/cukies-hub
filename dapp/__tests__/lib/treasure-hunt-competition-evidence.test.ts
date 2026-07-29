import {
  validateCompetitionEvidence,
  type CompetitionEvidenceState,
} from '@/lib/treasure-hunt-competition/server';

const state: CompetitionEvidenceState = {
  campaignId: 'uki-presale-2026',
  attemptId: 'attempt-1',
  walletAddress: '0x1111111111111111111111111111111111111111',
  gameSessionId: 'game-session-1',
  startedAt: '2026-07-10T00:00:00.000Z',
  expiresAt: '2026-07-10T02:00:00.000Z',
  nextSequence: 1,
  lastDigest: 'genesis-digest',
  lastScore: 100,
  lastGameTimeMs: 5_000,
  lastEvidenceAt: '2026-07-10T00:00:05.000Z',
};

describe('Treasure Hunt competition evidence validation', () => {
  it('accepts monotonic plausible evidence and creates a chained digest', () => {
    const result = validateCompetitionEvidence({
      state,
      evidence: {
        sequence: 1,
        kind: 'checkpoint',
        score: 250,
        gameTimeMs: 10_000,
        clientTimestampMs: Date.parse('2026-07-10T00:00:10.000Z'),
      },
      receivedAt: new Date('2026-07-10T00:00:10.000Z'),
      secret: 'competition-proof-secret',
    });

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(result.reason);
    expect(result.point).toMatchObject({
      sequence: 1,
      previousDigest: 'genesis-digest',
      score: 250,
      gameTimeMs: 10_000,
    });
    expect(result.point.digest).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([
    [{ sequence: 2 }, 'sequence_mismatch'],
    [{ score: 99 }, 'score_regression'],
    [{ gameTimeMs: 4_999 }, 'game_time_regression'],
    [{ score: 50_000 }, 'score_rate_exceeded'],
  ])('rejects invalid progression %#', (overrides, reason) => {
    expect(validateCompetitionEvidence({
      state,
      evidence: {
        sequence: 1,
        kind: 'checkpoint',
        score: 250,
        gameTimeMs: 10_000,
        ...overrides,
      },
      receivedAt: new Date('2026-07-10T00:00:10.000Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason });
  });

  it('rejects evidence after the attempt lease expires', () => {
    expect(validateCompetitionEvidence({
      state,
      evidence: {
        sequence: 1,
        kind: 'checkpoint',
        score: 250,
        gameTimeMs: 10_000,
      },
      receivedAt: new Date('2026-07-10T02:00:00.001Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason: 'attempt_expired' });
  });

  it('requires prior checkpoint evidence and accepts a legitimate short finish', () => {
    expect(validateCompetitionEvidence({
      state: { ...state, nextSequence: 0, lastScore: 0, lastGameTimeMs: 0 },
      evidence: { sequence: 0, kind: 'finish', score: 0, gameTimeMs: 10_000 },
      receivedAt: new Date('2026-07-10T00:00:10.000Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason: 'finish_without_checkpoint' });

    expect(validateCompetitionEvidence({
      state,
      evidence: { sequence: 1, kind: 'finish', score: 125, gameTimeMs: 5_007 },
      receivedAt: new Date('2026-07-10T00:00:05.007Z'),
      secret: 'competition-proof-secret',
    })).toMatchObject({ valid: true });

    expect(validateCompetitionEvidence({
      state,
      evidence: { sequence: 1, kind: 'finish', score: 250, gameTimeMs: 9_999 },
      receivedAt: new Date('2026-07-10T00:00:10.000Z'),
      secret: 'competition-proof-secret',
      rules: {
        maxScorePerSecond: 500,
        scoreBurstAllowance: 250,
        serverTimeToleranceMs: 5_000,
        minimumFinishedGameTimeMs: 10_000,
        minimumCheckpointIntervalMs: 4_000,
        maxEvidencePoints: 720,
      },
    })).toEqual({ valid: false, reason: 'game_too_short' });
  });

  it('grants the score burst once per attempt instead of once per checkpoint', () => {
    const zeroTimeState = {
      ...state,
      nextSequence: 8,
      lastScore: 250,
      lastGameTimeMs: 0,
      lastEvidenceAt: '2026-07-10T00:00:08.000Z',
    };
    expect(validateCompetitionEvidence({
      state: zeroTimeState,
      evidence: { sequence: 8, kind: 'checkpoint', score: 251, gameTimeMs: 0 },
      receivedAt: new Date('2026-07-10T00:00:12.500Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason: 'game_time_not_advanced' });

    expect(validateCompetitionEvidence({
      state: { ...zeroTimeState, lastScore: 0 },
      evidence: { sequence: 8, kind: 'checkpoint', score: 751, gameTimeMs: 1_000 },
      receivedAt: new Date('2026-07-10T00:00:12.500Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason: 'score_rate_exceeded' });
  });

  it('can enforce a configured minimum of real server time before accepting a finish', () => {
    expect(validateCompetitionEvidence({
      state,
      evidence: { sequence: 1, kind: 'finish', score: 250, gameTimeMs: 10_000 },
      receivedAt: new Date('2026-07-10T00:00:01.000Z'),
      secret: 'competition-proof-secret',
      rules: {
        maxScorePerSecond: 500,
        scoreBurstAllowance: 250,
        serverTimeToleranceMs: 5_000,
        minimumFinishedGameTimeMs: 10_000,
        minimumCheckpointIntervalMs: 4_000,
        maxEvidencePoints: 720,
      },
    })).toEqual({ valid: false, reason: 'server_game_too_short' });
  });

  it('caps checkpoint frequency and evidence document growth', () => {
    expect(validateCompetitionEvidence({
      state,
      evidence: { sequence: 1, kind: 'checkpoint', score: 100, gameTimeMs: 5_000 },
      receivedAt: new Date('2026-07-10T00:00:05.500Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason: 'checkpoint_too_frequent' });

    expect(validateCompetitionEvidence({
      state: { ...state, nextSequence: 720 },
      evidence: { sequence: 720, kind: 'checkpoint', score: 100, gameTimeMs: 5_000 },
      receivedAt: new Date('2026-07-10T00:00:06.000Z'),
      secret: 'competition-proof-secret',
    })).toEqual({ valid: false, reason: 'too_many_evidence_points' });
  });
});
