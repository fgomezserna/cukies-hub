import {
  createMatchPlayer,
  createMatchRules,
  createWaitingMatch,
  reconcileMatch,
  reconnectMatchPlayer,
  type Match,
  type MatchRules,
} from '@/lib/treasure-hunt-multiplayer';

const seedFactory = () => 'stable-seed';

function createRunningMatch(ruleOverrides: Partial<MatchRules> = {}): Match {
  const rules = createMatchRules(ruleOverrides);
  const waiting = createWaitingMatch({
    matchId: 'match-1',
    roomCode: 'ROOM',
    firstPlayer: { playerId: 'player-a', userId: 'user-a', gameSessionId: 'session-a' },
    rules,
    now: 0,
  });
  const joined: Match = {
    ...waiting,
    players: [
      ...waiting.players,
      createMatchPlayer({
        playerId: 'player-b',
        userId: 'user-b',
        gameSessionId: 'session-b',
        slot: 1,
        rules,
        now: 0,
      }),
    ],
  };
  const countdown = reconcileMatch(joined, { now: 0, createSeed: seedFactory });
  return reconcileMatch(countdown, {
    now: rules.initialCountdownMs,
    createSeed: seedFactory,
  });
}

function withPlayerState(
  match: Match,
  playerId: string,
  score: number,
  hearts: number,
): Match {
  return {
    ...match,
    players: match.players.map((player) =>
      player.playerId === playerId
        ? {
            ...player,
            snapshot: {
              ...player.snapshot,
              seq: player.snapshot.seq + 1,
              score,
              hearts,
              lifecycle: hearts === 0 ? ('eliminated' as const) : ('playing' as const),
            },
          }
        : player,
    ),
  };
}

function evaluate(match: Match, now = 100) {
  return reconcileMatch(match, { now, createSeed: seedFactory });
}

describe('Treasure Hunt multiplayer reconciliation rules', () => {
  it('locks one seed and one future startAt when the second player joins', () => {
    const createSeed = jest.fn(() => 'seed-once');
    const rules = createMatchRules({ initialCountdownMs: 2_000 });
    const waiting = createWaitingMatch({
      matchId: 'match-seed',
      roomCode: 'SEED',
      firstPlayer: { playerId: 'a', userId: 'u-a', gameSessionId: 's-a' },
      rules,
      now: 10,
    });
    const joined: Match = {
      ...waiting,
      players: [
        ...waiting.players,
        createMatchPlayer({
          playerId: 'b',
          userId: 'u-b',
          gameSessionId: 's-b',
          slot: 1,
          rules,
          now: 100,
        }),
      ],
    };

    const countdown = reconcileMatch(joined, { now: 100, createSeed });
    const again = reconcileMatch(countdown, { now: 500, createSeed });
    const running = reconcileMatch(again, { now: 2_100, createSeed });

    expect(countdown.status).toBe('countdown');
    expect(countdown.seed).toBe('seed-once');
    expect(countdown.startAt).toBe(2_100);
    expect(again.seed).toBe(countdown.seed);
    expect(again.startAt).toBe(countdown.startAt);
    expect(running.status).toBe('running');
    expect(createSeed).toHaveBeenCalledTimes(1);
  });

  it('finishes at an absolute score difference of exactly 500', () => {
    let match = createRunningMatch();
    match = withPlayerState(match, 'player-a', 900, 3);
    match = withPlayerState(match, 'player-b', 400, 3);

    const finished = evaluate(match);

    expect(finished.status).toBe('finished');
    expect(finished.result).toMatchObject({
      winnerPlayerId: 'player-a',
      reason: 'score_difference',
    });
  });

  it('awards the living rival when the first dead player is not ahead', () => {
    let match = createRunningMatch();
    match = withPlayerState(match, 'player-a', 300, 0);
    match = withPlayerState(match, 'player-b', 300, 2);

    expect(evaluate(match).result).toMatchObject({
      winnerPlayerId: 'player-b',
      reason: 'elimination',
    });
  });

  it('freezes the leading dead player score and requires the chaser to exceed it', () => {
    let match = createRunningMatch();
    match = withPlayerState(match, 'player-a', 600, 0);
    match = withPlayerState(match, 'player-b', 500, 2);

    const suddenDeath = evaluate(match);
    expect(suddenDeath.status).toBe('sudden_death');
    expect(suddenDeath.suddenDeath).toEqual({
      leaderPlayerId: 'player-a',
      chasingPlayerId: 'player-b',
      targetScore: 600,
    });

    const tied = evaluate(withPlayerState(suddenDeath, 'player-b', 600, 2), 200);
    expect(tied.status).toBe('sudden_death');
    expect(tied.result).toBeNull();

    const exceeded = evaluate(withPlayerState(tied, 'player-b', 601, 2), 300);
    expect(exceeded.result).toMatchObject({
      winnerPlayerId: 'player-b',
      reason: 'sudden_death',
    });
  });

  it('awards the frozen leader if the sudden-death chaser dies first', () => {
    let match = createRunningMatch();
    match = withPlayerState(match, 'player-a', 450, 0);
    match = withPlayerState(match, 'player-b', 300, 2);
    const suddenDeath = evaluate(match);

    const chaserDead = evaluate(withPlayerState(suddenDeath, 'player-b', 400, 0), 200);

    expect(chaserDead.result).toMatchObject({
      winnerPlayerId: 'player-a',
      reason: 'sudden_death',
    });
  });

  it('awards the frozen leader if the sudden-death chaser forfeits', () => {
    let match = createRunningMatch({
      initialCountdownMs: 10,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
    });
    match = withPlayerState(match, 'player-a', 450, 0);
    match = withPlayerState(match, 'player-b', 300, 2);
    const suddenDeath = evaluate(match, 20);
    const leaderAliveOnWire = reconnectMatchPlayer(suddenDeath, 'player-a', 600);

    const chaserForfeit = evaluate(leaderAliveOnWire, 600);

    expect(chaserForfeit.result).toMatchObject({
      winnerPlayerId: 'player-a',
      reason: 'forfeit',
    });
  });

  it('resolves two deaths by higher score and returns a draw on equal score', () => {
    let higher = createRunningMatch();
    higher = withPlayerState(higher, 'player-a', 400, 0);
    higher = withPlayerState(higher, 'player-b', 200, 0);
    expect(evaluate(higher).result).toMatchObject({
      winnerPlayerId: 'player-a',
      reason: 'elimination',
    });

    let tied = createRunningMatch();
    tied = withPlayerState(tied, 'player-a', 300, 0);
    tied = withPlayerState(tied, 'player-b', 300, 0);
    expect(evaluate(tied).result).toMatchObject({ winnerPlayerId: null, reason: 'draw' });
  });

  it('is idempotent after reaching a terminal result', () => {
    let match = createRunningMatch();
    match = withPlayerState(match, 'player-a', 500, 3);
    const finished = evaluate(match);

    expect(evaluate(finished, 10_000)).toBe(finished);
  });

  it('pauses, preserves the prior status and resumes with a shared three-second countdown', () => {
    let running = createRunningMatch({
      initialCountdownMs: 10,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
      reconnectCountdownMs: 3_000,
    });
    running = reconnectMatchPlayer(running, 'player-b', 200);

    const paused = evaluate(running, 200);
    expect(paused.status).toBe('paused_reconnect');
    expect(paused.pausedFromStatus).toBe('running');
    expect(paused.players[0].reconnectBudgetRemainingMs).toBe(400);

    const accounted = evaluate(reconnectMatchPlayer(paused, 'player-b', 300), 300);
    const reconnected = reconnectMatchPlayer(accounted, 'player-a', 300);
    const resuming = evaluate(reconnected, 300);

    expect(resuming.status).toBe('countdown');
    expect(resuming.resumeAt).toBe(3_300);
    expect(resuming.players[0].slot).toBe(0);
    expect(resuming.players[0].reconnectBudgetRemainingMs).toBe(300);

    const keptAlive = reconnectMatchPlayer(
      reconnectMatchPlayer(resuming, 'player-a', 3_300),
      'player-b',
      3_300,
    );
    expect(evaluate(keptAlive, 3_300).status).toBe('running');
  });

  it('does not reset reconnect budget and forfeits after cumulative exhaustion', () => {
    let running = createRunningMatch({
      initialCountdownMs: 10,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
      reconnectCountdownMs: 3_000,
    });
    running = reconnectMatchPlayer(running, 'player-b', 200);
    const firstPause = evaluate(running, 200);
    const firstReconnect = evaluate(reconnectMatchPlayer(firstPause, 'player-a', 200), 200);
    expect(firstReconnect.players[0].reconnectBudgetRemainingMs).toBe(400);

    let resumed = reconnectMatchPlayer(firstReconnect, 'player-a', 3_200);
    resumed = reconnectMatchPlayer(resumed, 'player-b', 3_200);
    resumed = evaluate(resumed, 3_200);
    expect(resumed.status).toBe('running');

    resumed = reconnectMatchPlayer(resumed, 'player-b', 3_701);
    const forfeited = evaluate(resumed, 3_701);
    expect(forfeited.result).toMatchObject({
      winnerPlayerId: 'player-b',
      reason: 'forfeit',
    });
  });

  it('abandons when both reconnect budgets expire together', () => {
    const running = createRunningMatch({
      initialCountdownMs: 10,
      offlineThresholdMs: 100,
      reconnectBudgetMs: 500,
    });

    const abandoned = evaluate(running, 600);

    expect(abandoned.status).toBe('abandoned');
    expect(abandoned.result).toMatchObject({ winnerPlayerId: null, reason: 'abandoned' });
  });
});
