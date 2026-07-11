import {
  InMemoryMatchRepository,
  MatchNotFoundError,
  MatchRevisionConflictError,
  createMatchRules,
  createWaitingMatch,
  validatePlayerSnapshot,
  type MatchRules,
  type PlayerSnapshot,
} from '@/lib/treasure-hunt-multiplayer';
import {
  TreasureHuntMultiplayerService,
  type MultiplayerClock,
  type MultiplayerIdFactory,
} from '@/lib/treasure-hunt-multiplayer/service';

class TestClock implements MultiplayerClock {
  value = 0;
  now() {
    return this.value;
  }
}

function createIdFactory(): MultiplayerIdFactory {
  let match = 0;
  let player = 0;
  let seed = 0;
  return {
    createMatchId: () => `match-${++match}`,
    createPlayerId: () => `player-${++player}`,
    createSeed: () => `seed-${++seed}`,
  };
}

function createHarness(ruleOverrides: Partial<MatchRules> = {}) {
  const repository = new InMemoryMatchRepository();
  const clock = new TestClock();
  const service = new TreasureHuntMultiplayerService(repository, {
    clock,
    idFactory: createIdFactory(),
    rules: {
      initialCountdownMs: 1_000,
      offlineThresholdMs: 10_000,
      ...ruleOverrides,
    },
  });
  return { repository, clock, service };
}

const first = { roomCode: 'ROOM', userId: 'user-a', gameSessionId: 'session-a' };
const second = { roomCode: 'ROOM', userId: 'user-b', gameSessionId: 'session-b' };

describe('TreasureHuntMultiplayerService', () => {
  it('creates and joins idempotently, keeps config stable and exposes no internal identity', async () => {
    const { repository, clock, service } = createHarness();

    const created = await service.createOrJoin(first);
    const repeatedFirst = await service.createOrJoin(first);
    clock.value = 100;
    const joined = await service.createOrJoin(second);
    const repeatedSecond = await service.createOrJoin(second);

    expect(created.playerId).toBe(repeatedFirst.playerId);
    expect(joined.playerId).toBe(repeatedSecond.playerId);
    expect(joined.match.players).toHaveLength(2);
    expect(joined.match.config.seed).toBe('seed-1');
    expect(joined.match.config.startAt).toBe(1_100);
    expect(joined.match.rewardEligible).toBe(false);
    expect(joined.match.gameId).toBe('treasure-hunt');
    expect(joined.match.mode).toBe('staging_unranked');
    expect(joined.match.rulesVersion).toBeTruthy();
    expect(joined.match.config).toMatchObject({
      winDelta: 500,
      initialCountdownMs: 1_000,
      offlineThresholdMs: 10_000,
      reconnectBudgetMs: 15_000,
      reconnectCountdownMs: 3_000,
      eliminationResolutionDelayMs: 250,
      initialHearts: 3,
      maxHearts: 10,
      maxHeartsDelta: 1,
      maxScore: 10_000_000,
      maxElapsedMs: 86_400_000,
      scoreDeltaWindowMs: 1_000,
      maxScoreDeltaPerWindow: 1_000,
      snapshotTimeToleranceMs: 250,
    });

    const publicJson = JSON.stringify(joined.match);
    expect(publicJson).not.toContain('user-a');
    expect(publicJson).not.toContain('session-a');
    expect(publicJson).not.toContain('userId');
    expect(publicJson).not.toContain('gameSessionId');

    clock.value = 1_100;
    const running = await service.getForParticipant({
      matchId: created.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
    });
    expect(running.status).toBe('running');
    expect(running.config.seed).toBe(joined.match.config.seed);
    expect(running.config.startAt).toBe(joined.match.config.startAt);

    const internal = await repository.findByMatchId(created.match.matchId);
    expect(internal?.players.map((player) => player.slot)).toEqual([0, 1]);
  });

  it('authorizes participant reads by both wallet user and game session identity', async () => {
    const { repository, clock, service } = createHarness({ initialCountdownMs: 100 });
    const created = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 100;

    await expect(
      service.getForParticipant({
        matchId: created.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
      }),
    ).resolves.toMatchObject({ status: 'running' });

    const revisionAfterAuthorizedRead = (
      await repository.findByMatchId(created.match.matchId)
    )?.revision;

    await expect(
      service.getForParticipant({
        matchId: created.match.matchId,
        userId: first.userId,
        gameSessionId: second.gameSessionId,
      }),
    ).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND', statusCode: 404 });
    await expect(
      service.getForParticipant({
        matchId: created.match.matchId,
        userId: 'not-a-player',
        gameSessionId: first.gameSessionId,
      }),
    ).rejects.toMatchObject({ code: 'PLAYER_NOT_FOUND', statusCode: 404 });

    expect((await repository.findByMatchId(created.match.matchId))?.revision).toBe(
      revisionAfterAuthorizedRead,
    );
  });

  it('forms a healthy countdown after a long one-player lobby wait', async () => {
    const { repository, clock, service } = createHarness({
      initialCountdownMs: 1_000,
      offlineThresholdMs: 1_000,
      reconnectBudgetMs: 5_000,
    });
    const created = await service.createOrJoin(first);
    clock.value = 18_000;

    const joined = await service.createOrJoin(second);

    expect(joined.match.matchId).toBe(created.match.matchId);
    expect(joined.match.status).toBe('countdown');
    expect(joined.match.result).toBeNull();
    expect(joined.match.config.startAt).toBe(19_000);
    expect(joined.match.players).toEqual([
      expect.objectContaining({ presence: 'online', reconnectBudgetRemainingMs: 5_000 }),
      expect.objectContaining({ presence: 'online', reconnectBudgetRemainingMs: 5_000 }),
    ]);
    const stored = await repository.findByMatchId(created.match.matchId);
    expect(stored?.players.map((player) => player.lastHeartbeatAt)).toEqual([18_000, 18_000]);
    expect(stored?.players.map((player) => player.lastSnapshotAcceptedAt)).toEqual([null, null]);
  });

  it('uses CAS retries so concurrent joins never exceed two slots', async () => {
    const { repository, service } = createHarness();
    await service.createOrJoin(first);

    const results = await Promise.allSettled([
      service.createOrJoin(second),
      service.createOrJoin({ roomCode: 'ROOM', userId: 'user-c', gameSessionId: 'session-c' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({ code: 'MATCH_FULL', statusCode: 409 });
    expect((await repository.findByRoomCode('ROOM'))?.players).toHaveLength(2);
  });

  it('returns a 409-ready domain error for a third player', async () => {
    const { service } = createHarness();
    await service.createOrJoin(first);
    await service.createOrJoin(second);

    await expect(
      service.createOrJoin({ roomCode: 'ROOM', userId: 'user-c', gameSessionId: 'session-c' }),
    ).rejects.toMatchObject({ code: 'MATCH_FULL', statusCode: 409 });
  });

  it('rejects duplicate or reordered snapshot sequences', async () => {
    const { clock, service } = createHarness();
    const joinedFirst = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 1_000;
    await service.reconcile(joinedFirst.match.matchId);

    const snapshot = { seq: 1, score: 100, hearts: 3, elapsedMs: 0, lifecycle: 'playing' };
    const updated = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot,
    });
    expect(updated.players.find((player) => player.playerId === joinedFirst.playerId)?.seq).toBe(1);

    await expect(
      service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT', statusCode: 422 });

    await expect(
      service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: { ...snapshot, seq: 0 },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT', statusCode: 422 });
  });

  it('binds elapsed and score acceptance to the injected server clock', async () => {
    const { repository, clock, service } = createHarness({ initialCountdownMs: 100 });
    const joinedFirst = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 100;

    await expect(
      service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: {
          seq: 0,
          score: 10_000_000,
          hearts: 3,
          elapsedMs: 86_400_000,
          lifecycle: 'playing',
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    await expect(
      service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: {
          seq: 0,
          score: 10_000_000,
          hearts: 3,
          elapsedMs: 0,
          lifecycle: 'playing',
        },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect((await repository.findByMatchId(joinedFirst.match.matchId))?.players[0]).toMatchObject({
      lastSnapshotAcceptedAt: null,
      snapshot: { seq: -1, score: 0, elapsedMs: 0 },
    });

    const firstAccepted = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 0, score: 100, hearts: 3, elapsedMs: 0, lifecycle: 'playing' },
    });
    expect(firstAccepted.players[0]).toMatchObject({ score: 100, elapsedMs: 0 });
    expect(
      (await repository.findByMatchId(joinedFirst.match.matchId))?.players[0]
        .lastSnapshotAcceptedAt,
    ).toBe(100);

    clock.value = 1_100;
    const secondAccepted = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 1, score: 200, hearts: 3, elapsedMs: 1_000, lifecycle: 'playing' },
    });
    expect(secondAccepted.players[0]).toMatchObject({ score: 200, elapsedMs: 1_000 });
    expect(
      (await repository.findByMatchId(joinedFirst.match.matchId))?.players[0]
        .lastSnapshotAcceptedAt,
    ).toBe(1_100);
  });

  it('finishes once at the default winDelta of 500', async () => {
    const { clock, service } = createHarness();
    const joinedFirst = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 1_000;

    const finished = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 0, score: 500, hearts: 3, elapsedMs: 0, lifecycle: 'playing' },
    });

    expect(finished.status).toBe('finished');
    expect(finished.result).toMatchObject({
      winnerPlayerId: joinedFirst.playerId,
      reason: 'score_difference',
    });
    expect((await service.reconcile(joinedFirst.match.matchId)).result).toEqual(finished.result);
  });

  it.each([
    { firstScore: 400, secondScore: 200, expectedWinner: 'first', reason: 'elimination' },
    { firstScore: 300, secondScore: 300, expectedWinner: null, reason: 'draw' },
  ])(
    'resolves sequential death snapshots inside the pending window: $reason',
    async ({ firstScore, secondScore, expectedWinner, reason }) => {
      const { repository, clock, service } = createHarness({
        initialCountdownMs: 100,
        eliminationResolutionDelayMs: 100,
        maxHeartsDelta: 3,
      });
      const joinedFirst = await service.createOrJoin(first);
      await service.createOrJoin(second);
      clock.value = 100;

      const pending = await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: {
          seq: 0,
          score: firstScore,
          hearts: 0,
          elapsedMs: 100,
          lifecycle: 'eliminated',
        },
      });
      expect(pending.status).toBe('running');
      expect(pending.result).toBeNull();
      expect(JSON.stringify(pending)).not.toContain('pendingElimination');
      expect((await repository.findByMatchId(joinedFirst.match.matchId))?.pendingElimination)
        .toMatchObject({ playerId: joinedFirst.playerId, scoreAtDeath: firstScore, resolveAt: 200 });

      clock.value = 150;
      const finished = await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: second.userId,
        gameSessionId: second.gameSessionId,
        snapshot: {
          seq: 0,
          score: secondScore,
          hearts: 0,
          elapsedMs: 150,
          lifecycle: 'eliminated',
        },
      });

      expect(finished.status).toBe('finished');
      expect(finished.result).toMatchObject({
        winnerPlayerId: expectedWinner === 'first' ? joinedFirst.playerId : null,
        reason,
      });
      expect(
        (await repository.findByMatchId(joinedFirst.match.matchId))?.pendingElimination,
      ).toBeNull();
    },
  );

  it('resolves a single finished player with positive hearts after the first-out window', async () => {
    const { clock, service } = createHarness({
      initialCountdownMs: 100,
      eliminationResolutionDelayMs: 100,
    });
    const joinedFirst = await service.createOrJoin(first);
    const joinedSecond = await service.createOrJoin(second);
    clock.value = 100;
    await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: { seq: 0, score: 300, hearts: 3, elapsedMs: 100, lifecycle: 'playing' },
    });

    const pending = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 0, score: 200, hearts: 3, elapsedMs: 100, lifecycle: 'finished' },
    });
    expect(pending.status).toBe('running');
    expect(pending.players[0]).toMatchObject({ lifecycle: 'finished', hearts: 3 });

    clock.value = 200;
    const resolved = await service.reconcile(joinedFirst.match.matchId);
    expect(resolved.result).toMatchObject({
      winnerPlayerId: joinedSecond.playerId,
      reason: 'elimination',
    });
  });

  it.each([
    { firstScore: 400, secondScore: 200, expectedWinner: 'first', reason: 'elimination' },
    { firstScore: 300, secondScore: 300, expectedWinner: null, reason: 'draw' },
  ])(
    'resolves two sequential finished snapshots: $reason',
    async ({ firstScore, secondScore, expectedWinner, reason }) => {
      const { clock, service } = createHarness({
        initialCountdownMs: 100,
        eliminationResolutionDelayMs: 100,
      });
      const joinedFirst = await service.createOrJoin(first);
      await service.createOrJoin(second);
      clock.value = 100;
      const pending = await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: {
          seq: 0,
          score: firstScore,
          hearts: 3,
          elapsedMs: 100,
          lifecycle: 'finished',
        },
      });
      expect(pending.result).toBeNull();

      clock.value = 150;
      const resolved = await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: second.userId,
        gameSessionId: second.gameSessionId,
        snapshot: {
          seq: 0,
          score: secondScore,
          hearts: 3,
          elapsedMs: 150,
          lifecycle: 'finished',
        },
      });
      expect(resolved.result).toMatchObject({
        winnerPlayerId: expectedWinner === 'first' ? joinedFirst.playerId : null,
        reason,
      });
    },
  );

  it.each([
    { finalScore: 599, chaserWins: false },
    { finalScore: 601, chaserWins: true },
  ])(
    'resolves a finished sudden-death chaser at $finalScore points',
    async ({ finalScore, chaserWins }) => {
      const { clock, service } = createHarness({
        initialCountdownMs: 100,
        eliminationResolutionDelayMs: 100,
      });
      const joinedFirst = await service.createOrJoin(first);
      const joinedSecond = await service.createOrJoin(second);
      clock.value = 100;
      await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: second.userId,
        gameSessionId: second.gameSessionId,
        snapshot: { seq: 0, score: 300, hearts: 3, elapsedMs: 100, lifecycle: 'playing' },
      });
      await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: { seq: 0, score: 600, hearts: 3, elapsedMs: 100, lifecycle: 'finished' },
      });
      clock.value = 200;
      const suddenDeath = await service.reconcile(joinedFirst.match.matchId);
      expect(suddenDeath).toMatchObject({
        status: 'sudden_death',
        suddenDeath: { targetScore: 600, chasingPlayerId: joinedSecond.playerId },
      });

      clock.value = 201;
      const resolved = await service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: second.userId,
        gameSessionId: second.gameSessionId,
        snapshot: {
          seq: 1,
          score: finalScore,
          hearts: 3,
          elapsedMs: 201,
          lifecycle: 'finished',
        },
      });
      expect(resolved.result).toMatchObject({
        winnerPlayerId: chaserWins ? joinedSecond.playerId : joinedFirst.playerId,
        reason: 'sudden_death',
      });
    },
  );

  it('persists a terminal pending-elimination transition before ignoring a late snapshot', async () => {
    const { repository, clock, service } = createHarness({
      initialCountdownMs: 100,
      eliminationResolutionDelayMs: 100,
      maxHeartsDelta: 3,
    });
    const joinedFirst = await service.createOrJoin(first);
    const joinedSecond = await service.createOrJoin(second);
    clock.value = 100;
    await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: { seq: 0, score: 300, hearts: 3, elapsedMs: 100, lifecycle: 'playing' },
    });
    await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 0, score: 200, hearts: 0, elapsedMs: 100, lifecycle: 'eliminated' },
    });
    clock.value = 200;
    const lateSnapshot = {
      seq: 1,
      score: 999,
      hearts: 0,
      elapsedMs: 200,
      lifecycle: 'eliminated',
    };

    const terminal = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: lateSnapshot,
    });

    expect(terminal.status).toBe('finished');
    expect(terminal.result).toMatchObject({
      winnerPlayerId: joinedSecond.playerId,
      reason: 'elimination',
    });
    expect(terminal.players.find((player) => player.playerId === joinedSecond.playerId)).toMatchObject({
      score: 300,
      hearts: 3,
      lifecycle: 'playing',
    });
    const persisted = await repository.findByMatchId(joinedFirst.match.matchId);
    expect(persisted).toMatchObject({ status: 'finished', pendingElimination: null });
    expect(persisted?.players[1].snapshot).toMatchObject({ seq: 0, score: 300, hearts: 3 });

    const repeated = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: lateSnapshot,
    });
    expect(repeated.result).toEqual(terminal.result);
    expect((await repository.findByMatchId(joinedFirst.match.matchId))?.revision).toBe(
      persisted?.revision,
    );
  });

  it('rejects gameplay snapshots before start, while paused and during resume countdown', async () => {
    const waitingHarness = createHarness();
    const waitingFirst = await waitingHarness.service.createOrJoin(first);
    const snapshot = { seq: 0, score: 50, hearts: 2, elapsedMs: 50, lifecycle: 'playing' };

    await expect(
      waitingHarness.service.updateSnapshot({
        matchId: waitingFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    await waitingHarness.service.createOrJoin(second);
    waitingHarness.clock.value = 500;
    await expect(
      waitingHarness.service.updateSnapshot({
        matchId: waitingFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    expect(
      (await waitingHarness.repository.findByMatchId(waitingFirst.match.matchId))?.players[0]
        .snapshot,
    ).toMatchObject({ seq: -1, score: 0, hearts: 3 });

    const pausedHarness = createHarness({
      initialCountdownMs: 100,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
    });
    const pausedFirst = await pausedHarness.service.createOrJoin(first);
    await pausedHarness.service.createOrJoin(second);
    pausedHarness.clock.value = 100;
    await pausedHarness.service.heartbeat({
      matchId: pausedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
    });
    await pausedHarness.service.heartbeat({
      matchId: pausedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    pausedHarness.clock.value = 250;
    await pausedHarness.service.heartbeat({
      matchId: pausedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    await expect(
      pausedHarness.service.updateSnapshot({
        matchId: pausedFirst.match.matchId,
        userId: second.userId,
        gameSessionId: second.gameSessionId,
        snapshot,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });

    pausedHarness.clock.value = 300;
    await pausedHarness.service.heartbeat({
      matchId: pausedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
    });
    await expect(
      pausedHarness.service.updateSnapshot({
        matchId: pausedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });
    const unchanged = await pausedHarness.repository.findByMatchId(pausedFirst.match.matchId);
    expect(unchanged?.status).toBe('countdown');
    expect(unchanged?.players.map((player) => player.snapshot)).toEqual([
      expect.objectContaining({ seq: -1, score: 0, hearts: 3 }),
      expect.objectContaining({ seq: -1, score: 0, hearts: 3 }),
    ]);
  });

  it('freezes the first dead player through pending elimination and sudden death', async () => {
    const { repository, clock, service } = createHarness({
      initialCountdownMs: 100,
      eliminationResolutionDelayMs: 100,
      maxHeartsDelta: 3,
    });
    const joinedFirst = await service.createOrJoin(first);
    const joinedSecond = await service.createOrJoin(second);
    clock.value = 100;
    await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: { seq: 0, score: 300, hearts: 3, elapsedMs: 100, lifecycle: 'playing' },
    });
    await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 0, score: 600, hearts: 0, elapsedMs: 100, lifecycle: 'eliminated' },
    });

    await expect(
      service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: { seq: 1, score: 650, hearts: 0, elapsedMs: 150, lifecycle: 'eliminated' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });

    clock.value = 200;
    const suddenDeath = await service.reconcile(joinedFirst.match.matchId);
    expect(suddenDeath.status).toBe('sudden_death');
    expect(suddenDeath.suddenDeath?.targetScore).toBe(600);
    expect((await repository.findByMatchId(joinedFirst.match.matchId))?.pendingElimination).toBeNull();

    await expect(
      service.updateSnapshot({
        matchId: joinedFirst.match.matchId,
        userId: first.userId,
        gameSessionId: first.gameSessionId,
        snapshot: { seq: 1, score: 650, hearts: 0, elapsedMs: 200, lifecycle: 'eliminated' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_SNAPSHOT' });

    clock.value = 201;
    const finished = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: { seq: 1, score: 601, hearts: 0, elapsedMs: 201, lifecycle: 'eliminated' },
    });
    expect(finished.result).toMatchObject({
      winnerPlayerId: joinedSecond.playerId,
      reason: 'sudden_death',
    });
    expect(finished.result?.finalScores[joinedFirst.playerId]).toBe(600);
  });

  it('reconnects through heartbeat in the same slot after consuming, not resetting, grace', async () => {
    const { clock, service } = createHarness({
      initialCountdownMs: 100,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
      reconnectCountdownMs: 3_000,
    });
    const joinedFirst = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 100;
    await service.heartbeat({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
    });
    await service.heartbeat({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });

    clock.value = 250;
    const paused = await service.heartbeat({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    expect(paused.status).toBe('paused_reconnect');
    expect(paused.players.find((player) => player.playerId === joinedFirst.playerId)).toMatchObject({
      slot: 0,
      presence: 'offline',
      reconnectBudgetRemainingMs: 450,
    });

    clock.value = 300;
    const resuming = await service.heartbeat({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
    });
    expect(resuming.status).toBe('countdown');
    expect(resuming.config.resumeAt).toBe(3_300);
    expect(resuming.players.find((player) => player.playerId === joinedFirst.playerId)).toMatchObject({
      slot: 0,
      presence: 'online',
      reconnectBudgetRemainingMs: 400,
    });

    clock.value = 350;
    await service.heartbeat({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    clock.value = 801;
    const forfeited = await service.heartbeat({
      matchId: joinedFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    expect(forfeited.result).toMatchObject({
      winnerPlayerId: forfeited.players.find((player) => player.slot === 1)?.playerId,
      reason: 'forfeit',
    });
  });

  it('abandons through persisted reconciliation when both grace budgets expire', async () => {
    const { clock, service } = createHarness({
      initialCountdownMs: 100,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
    });
    const joinedFirst = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 100;
    await service.reconcile(joinedFirst.match.matchId);
    clock.value = 600;

    const abandoned = await service.reconcile(joinedFirst.match.matchId);

    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.result).toMatchObject({ winnerPlayerId: null, reason: 'abandoned' });
  });

  it('waits when one offline player expires, then resolves on survivor return or abandonment', async () => {
    const returning = createHarness({
      initialCountdownMs: 100,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
    });
    const returningFirst = await returning.service.createOrJoin(first);
    const returningSecond = await returning.service.createOrJoin(second);
    returning.clock.value = 100;
    await returning.service.heartbeat({
      matchId: returningFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    returning.clock.value = 600;
    const waitingForReturn = await returning.service.reconcile(returningFirst.match.matchId);

    expect(waitingForReturn.status).toBe('paused_reconnect');
    expect(waitingForReturn.result).toBeNull();
    expect(waitingForReturn.players.find((player) => player.slot === 0)).toMatchObject({
      presence: 'offline',
      reconnectBudgetRemainingMs: 0,
    });
    expect(waitingForReturn.players.find((player) => player.slot === 1)).toMatchObject({
      presence: 'offline',
      reconnectBudgetRemainingMs: 100,
    });

    returning.clock.value = 625;
    const expiredCannotReturn = await returning.service.heartbeat({
      matchId: returningFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
    });
    expect(expiredCannotReturn.result).toBeNull();
    expect(expiredCannotReturn.players.find((player) => player.slot === 0)).toMatchObject({
      presence: 'offline',
      reconnectBudgetRemainingMs: 0,
    });

    returning.clock.value = 650;
    const survivorReturned = await returning.service.heartbeat({
      matchId: returningFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    expect(survivorReturned.result).toMatchObject({
      winnerPlayerId: returningSecond.playerId,
      reason: 'forfeit',
    });

    const expiring = createHarness({
      initialCountdownMs: 100,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
    });
    const expiringFirst = await expiring.service.createOrJoin(first);
    await expiring.service.createOrJoin(second);
    expiring.clock.value = 100;
    await expiring.service.heartbeat({
      matchId: expiringFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
    });
    expiring.clock.value = 600;
    expect((await expiring.service.reconcile(expiringFirst.match.matchId)).result).toBeNull();
    expiring.clock.value = 700;

    const bothExpired = await expiring.service.updateSnapshot({
      matchId: expiringFirst.match.matchId,
      userId: second.userId,
      gameSessionId: second.gameSessionId,
      snapshot: { seq: 0, score: 999, hearts: 0, elapsedMs: 700, lifecycle: 'eliminated' },
    });
    expect(bothExpired.status).toBe('abandoned');
    expect(bothExpired.result).toMatchObject({ winnerPlayerId: null, reason: 'abandoned' });
    expect(bothExpired.players.find((player) => player.slot === 1)).toMatchObject({
      score: 0,
      hearts: 3,
      lifecycle: 'waiting',
    });
    expect((await expiring.repository.findByMatchId(expiringFirst.match.matchId))?.players[1].snapshot)
      .toMatchObject({ seq: -1, score: 0, hearts: 3 });
  });
});

describe('Treasure Hunt snapshot validation', () => {
  const previous: PlayerSnapshot = {
    seq: 4,
    score: 100,
    hearts: 3,
    elapsedMs: 1_000,
    lifecycle: 'playing',
  };
  const rules = createMatchRules({
    scoreDeltaWindowMs: 1_000,
    maxScoreDeltaPerWindow: 50,
    maxHeartsDelta: 1,
  });
  const validationContext = {
    now: 3_000,
    startAt: 0,
    lastSnapshotAcceptedAt: 1_000,
  };

  it('validates absolute score deltas against configurable elapsed windows', () => {
    expect(
      validatePlayerSnapshot(
        { seq: 5, score: 200, hearts: 3, elapsedMs: 3_000, lifecycle: 'playing' },
        previous,
        rules,
        validationContext,
      ),
    ).toMatchObject({ score: 200 });

    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 151, hearts: 3, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/score delta/);
  });

  it('rejects decreasing elapsed time, invalid hearts and bounded heart jumps', () => {
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 3, elapsedMs: 999, lifecycle: 'playing' },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/elapsedMs cannot decrease/);
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 11, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/hearts/);
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 1, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/hearts delta/);
  });

  it('enforces the absolute 0..10 hearts contract in rules and snapshots', () => {
    expect(() => createMatchRules({ maxHearts: 11 })).toThrow(/cannot exceed 10/);
    expect(() => createMatchRules({ initialHearts: 3, maxHearts: 2 })).toThrow(
      /initialHearts cannot exceed maxHearts/,
    );
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 11, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        createMatchRules({ maxHearts: 10, maxHeartsDelta: 10 }),
        validationContext,
      ),
    ).toThrow(/between 0 and 10/);
  });

  it('rejects lifecycle regressions, terminal escapes and hearts inconsistencies', () => {
    for (const lifecycle of ['waiting', 'ready'] as const) {
      expect(() =>
        validatePlayerSnapshot(
          { seq: 5, score: 100, hearts: 3, elapsedMs: 1_100, lifecycle },
          previous,
          rules,
          validationContext,
        ),
      ).toThrow(/lifecycle cannot transition/);
    }

    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 1, elapsedMs: 1_100, lifecycle: 'eliminated' },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/zero hearts/);
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 0, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/zero hearts/);

    for (const terminalLifecycle of ['eliminated', 'finished'] as const) {
      expect(() =>
        validatePlayerSnapshot(
          { seq: 6, score: 100, hearts: 3, elapsedMs: 1_200, lifecycle: 'playing' },
          {
            ...previous,
            seq: 5,
            hearts: terminalLifecycle === 'eliminated' ? 0 : 3,
            lifecycle: terminalLifecycle,
          },
          rules,
          validationContext,
        ),
      ).toThrow(/is terminal/);
      expect(() =>
        validatePlayerSnapshot(
          {
            seq: 6,
            score: 100,
            hearts: terminalLifecycle === 'eliminated' ? 0 : 3,
            elapsedMs: 1_200,
            lifecycle: terminalLifecycle,
          },
          {
            ...previous,
            seq: 5,
            hearts: terminalLifecycle === 'eliminated' ? 0 : 3,
            lifecycle: terminalLifecycle,
          },
          rules,
          validationContext,
        ),
      ).toThrow(/is terminal/);
    }
  });

  it('rejects attempts to set authoritative match fields', () => {
    expect(() =>
      validatePlayerSnapshot(
        {
          seq: 5,
          score: 100,
          hearts: 3,
          elapsedMs: 1_100,
          lifecycle: 'playing',
          status: 'finished',
          winnerPlayerId: 'attacker',
          seed: 'controlled',
        },
        previous,
        rules,
        validationContext,
      ),
    ).toThrow(/not allowed/);
  });
});

describe('InMemoryMatchRepository CAS contract', () => {
  it('distinguishes revision conflicts from not found', async () => {
    const repository = new InMemoryMatchRepository();
    const rules = createMatchRules();
    const match = createWaitingMatch({
      matchId: 'cas-match',
      roomCode: 'CAS',
      firstPlayer: { playerId: 'p', userId: 'u', gameSessionId: 's' },
      rules,
      now: 0,
    });
    const created = await repository.create(match);
    await repository.save({ ...created, updatedAt: 1 }, 0);

    await expect(repository.save({ ...created, updatedAt: 2 }, 0)).rejects.toBeInstanceOf(
      MatchRevisionConflictError,
    );
    await expect(
      repository.save({ ...created, matchId: 'missing', updatedAt: 2 }, 0),
    ).rejects.toBeInstanceOf(MatchNotFoundError);
  });
});
