import {
  InMemoryMatchRepository,
  MatchNotFoundError,
  MatchRevisionConflictError,
  TreasureHuntMultiplayerService,
  createMatchRules,
  createWaitingMatch,
  validatePlayerSnapshot,
  type MultiplayerClock,
  type MultiplayerIdFactory,
  type PlayerSnapshot,
} from '@/lib/treasure-hunt-multiplayer';

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

function createHarness(ruleOverrides = {}) {
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

    const publicJson = JSON.stringify(joined.match);
    expect(publicJson).not.toContain('user-a');
    expect(publicJson).not.toContain('session-a');
    expect(publicJson).not.toContain('userId');
    expect(publicJson).not.toContain('gameSessionId');

    clock.value = 1_100;
    const running = await service.get(created.match.matchId);
    expect(running.status).toBe('running');
    expect(running.config.seed).toBe(joined.match.config.seed);
    expect(running.config.startAt).toBe(joined.match.config.startAt);

    const internal = await repository.findByMatchId(created.match.matchId);
    expect(internal?.players.map((player) => player.slot)).toEqual([0, 1]);
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

    const snapshot = { seq: 1, score: 100, hearts: 3, elapsedMs: 1_000, lifecycle: 'playing' };
    await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot,
    });

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

  it('finishes once at the default winDelta of 500', async () => {
    const { clock, service } = createHarness();
    const joinedFirst = await service.createOrJoin(first);
    await service.createOrJoin(second);
    clock.value = 1_000;

    const finished = await service.updateSnapshot({
      matchId: joinedFirst.match.matchId,
      userId: first.userId,
      gameSessionId: first.gameSessionId,
      snapshot: { seq: 0, score: 500, hearts: 3, elapsedMs: 1_000, lifecycle: 'playing' },
    });

    expect(finished.status).toBe('finished');
    expect(finished.result).toMatchObject({
      winnerPlayerId: joinedFirst.playerId,
      reason: 'score_difference',
    });
    expect((await service.reconcile(joinedFirst.match.matchId)).result).toEqual(finished.result);
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

  it('validates absolute score deltas against configurable elapsed windows', () => {
    expect(
      validatePlayerSnapshot(
        { seq: 5, score: 200, hearts: 3, elapsedMs: 3_000, lifecycle: 'playing' },
        previous,
        rules,
      ),
    ).toMatchObject({ score: 200 });

    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 151, hearts: 3, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
      ),
    ).toThrow(/score delta/);
  });

  it('rejects decreasing elapsed time, invalid hearts and bounded heart jumps', () => {
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 3, elapsedMs: 999, lifecycle: 'playing' },
        previous,
        rules,
      ),
    ).toThrow(/elapsedMs cannot decrease/);
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 11, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
      ),
    ).toThrow(/hearts/);
    expect(() =>
      validatePlayerSnapshot(
        { seq: 5, score: 100, hearts: 1, elapsedMs: 1_100, lifecycle: 'playing' },
        previous,
        rules,
      ),
    ).toThrow(/hearts delta/);
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
