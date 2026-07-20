import {
  CompetitionServiceError,
  createCompetitionService,
  verifyCheckpointReceipt,
  type CompetitionAttemptRecord,
  type CompetitionParticipantRecord,
  type CompetitionRepository,
  type CompetitionStoredEvidencePoint,
} from '@/lib/treasure-hunt-competition/server';

const campaignEnv = {
  TREASURE_HUNT_COMPETITION_ENABLED: 'true',
  TREASURE_HUNT_COMPETITION_ID: 'uki-presale-2026',
  TREASURE_HUNT_COMPETITION_RULES_VERSION: '1',
  TREASURE_HUNT_COMPETITION_PRESALE_ADDRESS: `0x${'9'.repeat(40)}`,
  TREASURE_HUNT_COMPETITION_STARTS_AT: '2026-07-10T00:00:00.000Z',
  TREASURE_HUNT_COMPETITION_ENDS_AT: '2026-07-20T00:00:00.000Z',
};

class MemoryCompetitionRepository implements CompetitionRepository {
  participants = new Map<string, CompetitionParticipantRecord>();
  attempts = new Map<string, CompetitionAttemptRecord>();

  async ensureIndexes() {}
  async syncCampaign() {}
  async assertReadyForParticipantWrites() {}

  async getOrCreateParticipant(input: {
    campaignId: string;
    walletAddress: string;
    generatedAlias: string;
    now: string;
  }) {
    const key = `${input.campaignId}:${input.walletAddress}`;
    const existing = this.participants.get(key);
    if (existing) return existing;
    const created: CompetitionParticipantRecord = {
      campaignId: input.campaignId,
      walletAddress: input.walletAddress,
      alias: input.generatedAlias,
      canonicalAlias: input.generatedAlias.toLowerCase(),
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.participants.set(key, created);
    return created;
  }

  async findParticipant(campaignId: string, walletAddress: string) {
    return this.participants.get(`${campaignId}:${walletAddress}`) ?? null;
  }

  async updateParticipantAlias(input: {
    campaignId: string;
    walletAddress: string;
    alias: string;
    canonicalAlias: string;
    now: string;
  }) {
    if ([...this.participants.values()].some((participant) =>
      participant.campaignId === input.campaignId &&
      participant.walletAddress !== input.walletAddress &&
      participant.canonicalAlias === input.canonicalAlias)) {
      return null;
    }
    const participant = await this.getOrCreateParticipant({
      campaignId: input.campaignId,
      walletAddress: input.walletAddress,
      generatedAlias: input.alias,
      now: input.now,
    });
    const updated = {
      ...participant,
      alias: input.alias,
      canonicalAlias: input.canonicalAlias,
      aliasChangedAt: input.now,
      updatedAt: input.now,
    };
    this.participants.set(`${input.campaignId}:${input.walletAddress}`, updated);
    return updated;
  }

  async updateAttemptsAlias(input: {
    campaignId: string;
    walletAddress: string;
    alias: string;
    now: string;
  }) {
    for (const [attemptId, attempt] of this.attempts) {
      if (attempt.campaignId === input.campaignId && attempt.walletAddress === input.walletAddress) {
        this.attempts.set(attemptId, {
          ...attempt,
          playerAlias: input.alias,
          updatedAt: input.now,
        });
      }
    }
  }

  async findActiveAttempt(campaignId: string, walletAddress: string) {
    return [...this.attempts.values()].find((attempt) =>
      attempt.campaignId === campaignId &&
      attempt.walletAddress === walletAddress &&
      attempt.status === 'active') ?? null;
  }

  async abandonActiveAttempts(campaignId: string, walletAddress: string, now: string) {
    for (const [attemptId, attempt] of this.attempts) {
      if (
        attempt.campaignId === campaignId &&
        attempt.walletAddress === walletAddress &&
        attempt.status === 'active' &&
        attempt.finishPendingAuthority !== true
      ) {
        this.attempts.set(attemptId, { ...attempt, status: 'abandoned', finishedAt: now });
      }
    }
  }

  async listPendingFinishAttempts(campaignId: string, limit: number) {
    return [...this.attempts.values()]
      .filter((attempt) =>
        attempt.campaignId === campaignId &&
        attempt.status === 'active' &&
        attempt.finishPendingAuthority === true)
      .slice(0, limit);
  }

  async createAttempt(attempt: CompetitionAttemptRecord) {
    this.attempts.set(attempt.attemptId, attempt);
    return attempt;
  }

  async findAttempt(attemptId: string) {
    return this.attempts.get(attemptId) ?? null;
  }

  async appendEvidence(input: {
    attemptId: string;
    walletAddress: string;
    expectedSequence: number;
    expectedPreviousDigest: string;
    point: CompetitionStoredEvidencePoint;
    finishPendingAuthority?: true;
  }) {
    const attempt = this.attempts.get(input.attemptId);
    if (
      !attempt ||
      attempt.status !== 'active' ||
      attempt.finishPendingAuthority === true ||
      attempt.walletAddress !== input.walletAddress ||
      attempt.nextSequence !== input.expectedSequence ||
      attempt.lastDigest !== input.expectedPreviousDigest
    ) return null;

    const updated: CompetitionAttemptRecord = {
      ...attempt,
      finishPendingAuthority: input.finishPendingAuthority ?? false,
      score: input.point.score,
      gameTimeMs: input.point.gameTimeMs,
      lastScore: input.point.score,
      lastGameTimeMs: input.point.gameTimeMs,
      lastDigest: input.point.digest,
      lastEvidenceAt: input.point.receivedAt,
      nextSequence: input.expectedSequence + 1,
      evidence: [...attempt.evidence, input.point],
      finishedAt: input.finishPendingAuthority ? input.point.receivedAt : attempt.finishedAt,
      updatedAt: input.point.receivedAt,
    };
    this.attempts.set(input.attemptId, updated);
    return updated;
  }

  async finalizeAttemptForReview(input: {
    attemptId: string;
    walletAddress: string;
    expectedSequence: number;
    expectedPreviousDigest: string;
    now: string;
  }) {
    const attempt = this.attempts.get(input.attemptId);
    if (
      !attempt ||
      attempt.status !== 'active' ||
      attempt.finishPendingAuthority !== true ||
      attempt.walletAddress !== input.walletAddress ||
      attempt.nextSequence !== input.expectedSequence ||
      attempt.lastDigest !== input.expectedPreviousDigest
    ) return null;

    const updated: CompetitionAttemptRecord = {
      ...attempt,
      status: 'review',
      finishPendingAuthority: false,
      reviewQueuedAt: input.now,
      updatedAt: input.now,
    };
    this.attempts.set(input.attemptId, updated);
    return updated;
  }

  async listReviewAttempts(campaignId: string, limit: number) {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.campaignId === campaignId && attempt.status === 'review')
      .slice(0, limit);
  }

  async adjudicateAttempt(input: {
    campaignId: string;
    attemptId: string;
    decision: 'valid' | 'invalid';
    reason: string;
    reviewer: string;
    reviewedAt: string;
  }) {
    const attempt = this.attempts.get(input.attemptId);
    if (
      !attempt ||
      attempt.campaignId !== input.campaignId ||
      attempt.status !== 'review' ||
      attempt.reviewDecision != null
    ) return null;
    const updated: CompetitionAttemptRecord = {
      ...attempt,
      status: input.decision,
      reviewDecision: input.decision,
      reviewReason: input.reason,
      reviewedAt: input.reviewedAt,
      reviewer: input.reviewer,
      updatedAt: input.reviewedAt,
    };
    this.attempts.set(input.attemptId, updated);
    return updated;
  }

  async listAttempts(campaignId: string, walletAddress: string, limit: number) {
    return [...this.attempts.values()]
      .filter((attempt) => attempt.campaignId === campaignId && attempt.walletAddress === walletAddress)
      .slice(0, limit);
  }

  async listValidAttempts(campaignId: string, limit: number) {
    return [...this.attempts.values()]
      .filter((attempt) =>
        attempt.campaignId === campaignId &&
        (attempt.status === 'review' || attempt.status === 'valid'))
      .slice(0, limit);
  }
}

function createHarness(options: {
  repository?: MemoryCompetitionRepository;
  claimGameSession?: jest.Mock;
  finishGameSession?: jest.Mock;
  releaseGameSession?: jest.Mock;
  createId?: () => string;
} = {}) {
  const repository = options.repository ?? new MemoryCompetitionRepository();
  let now = new Date('2026-07-12T12:00:00.000Z');
  const proofSecret = 'competition-proof-secret-with-enough-length';
  const applyReferral = jest.fn(async () => ({ applied: true as const }));
  const claimGameSession = options.claimGameSession ?? jest.fn(async () => true);
  const finishGameSession = options.finishGameSession ?? jest.fn(async () => true);
  const releaseGameSession = options.releaseGameSession ?? jest.fn(async () => true);
  const service = createCompetitionService({
    repository,
    environment: campaignEnv,
    proofSecret,
    now: () => now,
    createId: options.createId ?? (() => 'attempt-1'),
    createSeed: () => 'server-seed-1',
    findGameSession: async (gameSessionId) => ({
      gameSessionId,
      userId: 'user-1',
      gameId: 'sybil-slayer',
      isActive: true,
      mode: 'standard',
      rewardEligible: true,
    }),
    applyReferral,
    claimGameSession,
    finishGameSession,
    releaseGameSession,
  });

  return {
    repository,
    service,
    proofSecret,
    applyReferral,
    claimGameSession,
    finishGameSession,
    releaseGameSession,
    setNow(value: string) { now = new Date(value); },
  };
}

const wallet = '0x1111111111111111111111111111111111111111';

describe('Treasure Hunt competition service', () => {
  it('keeps the public runtime fail-closed without requiring a proof secret', () => {
    const service = createCompetitionService({
      repository: new MemoryCompetitionRepository(),
      environment: { NODE_ENV: 'production', TREASURE_HUNT_COMPETITION_ENABLED: 'false' },
      findGameSession: async () => null,
    });

    expect(service.getRuntime()).toMatchObject({
      configured: false,
      enabled: false,
      phase: 'unconfigured',
    });
  });

  it('fails before persistence or authority changes when the proof secret is missing', async () => {
    const repository = new MemoryCompetitionRepository();
    const ensureIndexes = jest.spyOn(repository, 'ensureIndexes');
    const syncCampaign = jest.spyOn(repository, 'syncCampaign');
    const findGameSession = jest.fn(async () => null);
    const service = createCompetitionService({
      repository,
      environment: { ...campaignEnv, NODE_ENV: 'production' },
      now: () => new Date('2026-07-15T12:00:00.000Z'),
      findGameSession,
    });

    await expect(service.startAttempt({
      userId: 'user-1',
      walletAddress: wallet,
      gameSessionId: 'game-session-1',
    })).rejects.toMatchObject({
      code: 'COMPETITION_NOT_CONFIGURED',
      status: 503,
    });

    expect(ensureIndexes).not.toHaveBeenCalled();
    expect(syncCampaign).not.toHaveBeenCalled();
    expect(findGameSession).not.toHaveBeenCalled();
    expect(repository.participants.size).toBe(0);
    expect(repository.attempts.size).toBe(0);
  });

  it('fails participant writes closed when alias generation is not configured', async () => {
    const repository = new MemoryCompetitionRepository();
    const readiness = jest
      .spyOn(repository, 'assertReadyForParticipantWrites')
      .mockRejectedValue(new Error('missing alias secret'));
    const getOrCreateParticipant = jest.spyOn(repository, 'getOrCreateParticipant');
    const service = createCompetitionService({
      repository,
      environment: campaignEnv,
      proofSecret: 'competition-proof-secret-with-enough-length',
      findGameSession: async () => null,
    });

    await expect(service.getParticipant(wallet)).rejects.toMatchObject({
      code: 'COMPETITION_NOT_CONFIGURED',
      status: 503,
    });

    expect(readiness).toHaveBeenCalledTimes(1);
    expect(getOrCreateParticipant).not.toHaveBeenCalled();
    expect(repository.participants.size).toBe(0);
  });

  it('starts one auditable attempt for the signed wallet and replays it idempotently', async () => {
    const harness = createHarness();
    const input = {
      userId: 'user-1',
      walletAddress: wallet,
      gameSessionId: 'game-session-1',
      referralCode: 'uki-sponsor',
    };

    const first = await harness.service.startAttempt(input);
    const replay = await harness.service.startAttempt(input);

    expect(first).toMatchObject({
      attemptId: 'attempt-1',
      gameSessionId: 'game-session-1',
      seed: 'server-seed-1',
      nextSequence: 0,
      alias: expect.stringMatching(/^Hunter-/),
    });
    expect(replay.attemptId).toBe(first.attemptId);
    expect(harness.repository.attempts.size).toBe(1);
    expect(harness.claimGameSession).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      gameSessionId: 'game-session-1',
      attemptId: 'attempt-1',
    });
    expect(harness.applyReferral).toHaveBeenCalledWith(wallet, 'uki-sponsor');
    expect(verifyCheckpointReceipt(
      first.receipt,
      harness.proofSecret,
      new Date('2026-07-12T12:00:00.000Z'),
    ))
      .toMatchObject({ attemptId: 'attempt-1', walletAddress: wallet, nextSequence: 0 });
  });

  it('recovers an acknowledged attempt insert without releasing its GameSession authority', async () => {
    const repository = new MemoryCompetitionRepository();
    const insertedThenErrored = jest.spyOn(repository, 'createAttempt').mockImplementationOnce(
      async (attempt) => {
        repository.attempts.set(attempt.attemptId, attempt);
        throw new Error('ambiguous insert acknowledgement');
      },
    );
    const releaseGameSession = jest.fn(async () => true);
    const harness = createHarness({ repository, releaseGameSession });

    await expect(harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    })).resolves.toMatchObject({ attemptId: 'attempt-1', status: 'active' });

    expect(insertedThenErrored).toHaveBeenCalledTimes(1);
    expect(releaseGameSession).not.toHaveBeenCalled();
  });

  it('fails closed when an existing active attempt cannot reclaim a standard GameSession', async () => {
    const claimGameSession = jest.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const harness = createHarness({ claimGameSession });
    const input = {
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    };
    await harness.service.startAttempt(input);

    await expect(harness.service.startAttempt(input)).rejects.toMatchObject({
      code: 'GAME_SESSION_NOT_ELIGIBLE',
      status: 409,
    });
    expect(harness.repository.attempts.size).toBe(1);
  });

  it('does not abandon an unexpired attempt when another GameSession tries to start', async () => {
    const harness = createHarness();
    await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });

    await expect(harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-2',
    })).rejects.toMatchObject({
      code: 'GAME_SESSION_NOT_ELIGIBLE',
      status: 409,
    });

    expect(harness.finishGameSession).not.toHaveBeenCalled();
    expect(harness.repository.attempts.get('attempt-1')?.status).toBe('active');
  });

  it('closes expired authority before replacing an attempt on a new GameSession', async () => {
    const createId = jest.fn()
      .mockReturnValueOnce('attempt-old')
      .mockReturnValueOnce('attempt-new');
    const harness = createHarness({ createId });
    await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-old',
    });
    harness.setNow('2026-07-12T14:00:00.001Z');

    await expect(harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-new',
    })).resolves.toMatchObject({ attemptId: 'attempt-new', status: 'active' });

    expect(harness.finishGameSession).toHaveBeenCalledWith({
      userId: 'user-1',
      gameSessionId: 'game-session-old',
      attemptId: 'attempt-old',
    });
    expect(harness.repository.attempts.get('attempt-old')?.status).toBe('abandoned');
    expect(harness.repository.attempts.get('attempt-new')?.status).toBe('active');
  });

  it('releases a claimed GameSession only after proving the attempt insert is absent', async () => {
    const repository = new MemoryCompetitionRepository();
    jest.spyOn(repository, 'createAttempt').mockRejectedValueOnce(new Error('insert rejected'));
    const releaseGameSession = jest.fn(async () => true);
    const harness = createHarness({ repository, releaseGameSession });

    await expect(harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    })).rejects.toThrow('insert rejected');

    expect(releaseGameSession).toHaveBeenCalledWith({
      userId: 'user-1', gameSessionId: 'game-session-1', attemptId: 'attempt-1',
    });
  });

  it('keeps the GameSession claimed when insert recovery cannot prove absence', async () => {
    const repository = new MemoryCompetitionRepository();
    jest.spyOn(repository, 'createAttempt').mockRejectedValueOnce(new Error('insert timed out'));
    jest.spyOn(repository, 'findAttempt').mockRejectedValueOnce(new Error('read timed out'));
    const releaseGameSession = jest.fn(async () => true);
    const harness = createHarness({ repository, releaseGameSession });

    await expect(harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    })).rejects.toThrow('insert timed out');

    expect(releaseGameSession).not.toHaveBeenCalled();
  });

  it('chains a checkpoint and queues the finished attempt for review', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    harness.setNow('2026-07-12T12:00:10.000Z');
    const finished = await harness.service.finishAttempt({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    });

    expect(checkpoint).toMatchObject({ accepted: true, nextSequence: 1 });
    expect(finished).toMatchObject({
      accepted: true,
      status: 'review',
      score: 200,
      receipt: null,
    });
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'review',
      finishPendingAuthority: false,
      reviewQueuedAt: '2026-07-12T12:00:10.000Z',
      score: 200,
      nextSequence: 2,
      evidence: [
        expect.objectContaining({ kind: 'checkpoint', sequence: 0 }),
        expect.objectContaining({ kind: 'finish', sequence: 1 }),
      ],
    });
  });

  it('bootstraps and replays a finish with no prior checkpoint in one request', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:10.000Z');
    const finishRequest = {
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 200,
      gameTimeMs: 10_000,
      clientTimestampMs: 2_000,
    };

    await expect(harness.service.finishAttempt(finishRequest)).resolves.toMatchObject({
      accepted: true,
      replayed: false,
      status: 'review',
      nextSequence: 2,
      receipt: null,
    });
    await expect(harness.service.finishAttempt(finishRequest)).resolves.toMatchObject({
      accepted: true,
      replayed: true,
      status: 'review',
      nextSequence: 2,
      receipt: null,
    });
    expect(harness.finishGameSession).toHaveBeenCalledTimes(1);
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'review',
      score: 200,
      nextSequence: 2,
      evidence: [
        expect.objectContaining({ kind: 'checkpoint', sequence: 0 }),
        expect.objectContaining({ kind: 'finish', sequence: 1 }),
      ],
    });
  });

  it('never exposes a ranking-valid attempt before GameSession finish authority succeeds', async () => {
    const finishGameSession = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const harness = createHarness({ finishGameSession });
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    const finishRequest = {
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    };
    harness.setNow('2026-07-12T12:00:10.000Z');

    await expect(harness.service.finishAttempt(finishRequest)).rejects.toMatchObject({
      code: 'EVIDENCE_CONFLICT',
      status: 409,
    });
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'active',
      finishPendingAuthority: true,
      nextSequence: 2,
    });
    await expect(harness.repository.listValidAttempts('uki-presale-2026', 100))
      .resolves.toHaveLength(0);

    await expect(harness.service.finishAttempt(finishRequest)).resolves.toMatchObject({
      accepted: true,
      replayed: true,
      status: 'review',
      score: 200,
    });
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'review',
      finishPendingAuthority: false,
      evidence: [
        expect.objectContaining({ kind: 'checkpoint' }),
        expect.objectContaining({ kind: 'finish' }),
      ],
    });
  });

  it('recovers idempotently when GameSession closes but attempt finalization times out', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    const finishRequest = {
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    };
    jest.spyOn(harness.repository, 'finalizeAttemptForReview')
      .mockRejectedValueOnce(new Error('finalization acknowledgement timed out'));
    harness.setNow('2026-07-12T12:00:10.000Z');

    await expect(harness.service.finishAttempt(finishRequest))
      .rejects.toThrow('finalization acknowledgement timed out');
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'active',
      finishPendingAuthority: true,
    });

    await expect(harness.service.finishAttempt(finishRequest)).resolves.toMatchObject({
      accepted: true,
      replayed: true,
      status: 'review',
    });
    expect(harness.finishGameSession).toHaveBeenCalledTimes(2);
    expect(harness.repository.attempts.get(started.attemptId)?.evidence).toHaveLength(2);
  });

  it('recovers an exact durable finish after the campaign and receipt have expired', async () => {
    const finishGameSession = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const harness = createHarness({ finishGameSession });
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    const finishRequest = {
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    };
    harness.setNow('2026-07-12T12:00:10.000Z');
    await expect(harness.service.finishAttempt(finishRequest)).rejects.toMatchObject({
      code: 'EVIDENCE_CONFLICT',
    });

    harness.setNow('2026-07-21T00:00:00.000Z');
    await expect(harness.service.finishAttempt({ ...finishRequest, score: 201 }))
      .rejects.toMatchObject({ code: 'COMPETITION_NOT_ACTIVE', status: 409 });
    expect(harness.repository.attempts.get(started.attemptId)?.evidence).toHaveLength(2);

    await expect(harness.service.finishAttempt(finishRequest)).resolves.toMatchObject({
      accepted: true,
      replayed: true,
      status: 'review',
      receipt: null,
    });
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'review',
      finishPendingAuthority: false,
    });
  });

  it('recovers pending GameSession authority server-side after campaign close', async () => {
    const finishGameSession = jest.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const harness = createHarness({ finishGameSession });
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    harness.setNow('2026-07-12T12:00:10.000Z');
    await expect(harness.service.finishAttempt({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    })).rejects.toMatchObject({ code: 'EVIDENCE_CONFLICT' });

    harness.setNow('2026-07-21T00:00:00.000Z');
    await expect(harness.service.recoverPendingFinishes()).resolves.toEqual({
      scanned: 1,
      recovered: 1,
      alreadyFinalized: 0,
      failed: 0,
      remainingPending: 0,
      complete: true,
    });
    await expect(harness.service.recoverPendingFinishes()).resolves.toMatchObject({
      scanned: 0,
      recovered: 0,
      remainingPending: 0,
      complete: true,
    });
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'review',
      finishPendingAuthority: false,
    });
  });

  it('never abandons a finish-pending attempt when another session tries to start', async () => {
    const finishGameSession = jest.fn(async () => false);
    const harness = createHarness({ finishGameSession });
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    harness.setNow('2026-07-12T12:00:10.000Z');
    await expect(harness.service.finishAttempt({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    })).rejects.toMatchObject({ code: 'EVIDENCE_CONFLICT' });

    await expect(harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-2',
    })).rejects.toMatchObject({ code: 'ATTEMPT_NOT_ACTIVE', status: 409 });
    expect(harness.repository.attempts.size).toBe(1);
    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      status: 'active',
      finishPendingAuthority: true,
    });
  });

  it('adjudicates review with immutable audit and exact idempotency', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    harness.setNow('2026-07-12T12:00:10.000Z');
    await harness.service.finishAttempt({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    });

    await expect(harness.service.adjudicateAttempt({
      attemptId: started.attemptId,
      decision: 'valid',
      reason: '   ',
      reviewer: 'ops@example.test',
    })).rejects.toMatchObject({ code: 'INVALID_REVIEW', status: 400 });

    const input = {
      attemptId: started.attemptId,
      decision: 'valid' as const,
      reason: 'Evidence chain and session closure verified',
      reviewer: 'ops@example.test',
    };
    await expect(harness.service.adjudicateAttempt(input)).resolves.toMatchObject({
      idempotent: false,
      attempt: {
        status: 'valid',
        reviewDecision: 'valid',
        reviewReason: input.reason,
        reviewer: input.reviewer,
        reviewedAt: '2026-07-12T12:00:10.000Z',
      },
    });
    await expect(harness.service.adjudicateAttempt(input)).resolves.toMatchObject({
      idempotent: true,
      attempt: { reviewedAt: '2026-07-12T12:00:10.000Z' },
    });
    await expect(harness.service.adjudicateAttempt({
      ...input,
      reason: 'A different audit must not overwrite the first',
    })).rejects.toMatchObject({ code: 'REVIEW_CONFLICT', status: 409 });
  });

  it('ranks review attempts provisionally with the public limit and marks approved ones', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });
    harness.setNow('2026-07-12T12:00:05.000Z');
    const checkpoint = await harness.service.recordCheckpoint({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 100,
      gameTimeMs: 5_000,
    });
    harness.setNow('2026-07-12T12:00:10.000Z');
    await harness.service.finishAttempt({
      walletAddress: wallet,
      attemptId: started.attemptId,
      receipt: checkpoint.receipt,
      sequence: 1,
      score: 200,
      gameTimeMs: 10_000,
    });
    const listSpy = jest.spyOn(harness.repository, 'listValidAttempts');

    await expect(harness.service.getLeaderboard(wallet, 7)).resolves.toMatchObject({
      entries: [expect.objectContaining({
        attemptId: started.attemptId,
        reviewStatus: 'pending',
        isMe: true,
      })],
    });
    expect(listSpy).toHaveBeenLastCalledWith('uki-presale-2026', 7);

    await harness.service.adjudicateAttempt({
      attemptId: started.attemptId,
      decision: 'valid',
      reason: 'Approved',
      reviewer: 'ops@example.test',
    });
    await expect(harness.service.getLeaderboard(wallet, 1)).resolves.toMatchObject({
      entries: [expect.objectContaining({ reviewStatus: 'approved' })],
    });
  });

  it('rejects a receipt replayed by another wallet', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });

    await expect(harness.service.recordCheckpoint({
      walletAddress: '0x2222222222222222222222222222222222222222',
      attemptId: started.attemptId,
      receipt: started.receipt,
      sequence: 0,
      score: 1,
      gameTimeMs: 5_000,
    })).rejects.toMatchObject({ code: 'INVALID_RECEIPT', status: 403 });
  });

  it('requires an active standard solo game session owned by the wallet user', async () => {
    const harness = createHarness();
    const service = createCompetitionService({
      repository: harness.repository,
      environment: campaignEnv,
      proofSecret: harness.proofSecret,
      now: () => new Date('2026-07-12T12:00:00.000Z'),
      findGameSession: async () => ({
        gameSessionId: 'game-session-1',
        userId: 'another-user',
        gameId: 'sybil-slayer',
        isActive: true,
        mode: 'standard',
        rewardEligible: true,
      }),
    });

    await expect(service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    })).rejects.toBeInstanceOf(CompetitionServiceError);
    await expect(service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    })).rejects.toMatchObject({ code: 'GAME_SESSION_NOT_ELIGIBLE', status: 403 });
  });

  it('updates an alias case-insensitively and prevents duplicates', async () => {
    const harness = createHarness();
    await harness.service.getParticipant(wallet);
    await harness.service.getParticipant('0x2222222222222222222222222222222222222222');
    await expect(harness.service.updateAlias(wallet, 'TreasureKing'))
      .resolves.toMatchObject({ alias: 'TreasureKing', canonicalAlias: 'treasureking' });
    await expect(harness.service.updateAlias(
      '0x2222222222222222222222222222222222222222',
      'treasureking',
    )).rejects.toMatchObject({ code: 'ALIAS_TAKEN', status: 409 });
  });

  it('propagates an alias change to every stored attempt in the campaign', async () => {
    const harness = createHarness();
    const started = await harness.service.startAttempt({
      userId: 'user-1', walletAddress: wallet, gameSessionId: 'game-session-1',
    });

    await harness.service.updateAlias(wallet, 'TreasureKing');

    expect(harness.repository.attempts.get(started.attemptId)).toMatchObject({
      playerAlias: 'TreasureKing',
    });
  });

  it('locks aliases after the competition closes', async () => {
    const harness = createHarness();
    harness.setNow('2026-07-20T00:00:00.001Z');

    await expect(harness.service.updateAlias(wallet, 'TooLate'))
      .rejects.toMatchObject({ code: 'ALIAS_LOCKED', status: 409 });
  });
});
