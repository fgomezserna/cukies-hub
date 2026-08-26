import {
  advanceSinglePlayerResultSaveState,
  createSinglePlayerResultAuthority,
  emptySinglePlayerResultSaveState,
  resolveSinglePlayerResultDispatch,
} from '../../../games/sybil-slayer/src/lib/single-player-result-authority';

describe('Treasure Hunt single-player result authority', () => {
  it('never replays a terminal run after the parent rotates the GameSession', () => {
    const firstRun = createSinglePlayerResultAuthority(1, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-1',
      attemptId: 'competition-attempt-1',
      economyRunId: 'economy-run-1',
    }, 'game-session-1');

    expect(resolveSinglePlayerResultDispatch(firstRun, 'game-session-1', null)).toEqual({
      runId: 1,
      sessionId: 'game-session-1',
      economyRunId: 'economy-run-1',
      competitionAttemptId: 'competition-attempt-1',
    });
    expect(resolveSinglePlayerResultDispatch(firstRun, 'game-session-1', 1)).toBeNull();
    expect(resolveSinglePlayerResultDispatch(firstRun, 'game-session-2', null)).toBeNull();

    const secondRun = createSinglePlayerResultAuthority(2, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-2',
      attemptId: 'competition-attempt-2',
      economyRunId: 'economy-run-2',
    }, 'game-session-2');
    expect(resolveSinglePlayerResultDispatch(secondRun, 'game-session-2', 1)).toEqual({
      runId: 2,
      sessionId: 'game-session-2',
      economyRunId: 'economy-run-2',
      competitionAttemptId: 'competition-attempt-2',
    });
  });

  it('supports a session-bound practice result but rejects incomplete authority', () => {
    expect(createSinglePlayerResultAuthority(1, {
      eligible: false,
      practice: true,
      sessionId: 'game-session-practice',
      economyRunId: 'economy-run-practice',
    }, 'game-session-practice')).toEqual({
      runId: 1,
      sessionId: 'game-session-practice',
      economyRunId: 'economy-run-practice',
    });
    expect(createSinglePlayerResultAuthority(1, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-invalid',
    }, 'game-session-invalid')).toBeNull();
    expect(createSinglePlayerResultAuthority(1, {
      eligible: false,
      practice: false,
      sessionId: 'game-session-invalid',
    }, 'game-session-invalid')).toBeNull();
    expect(createSinglePlayerResultAuthority(1, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-old',
      attemptId: 'competition-attempt-old',
      economyRunId: 'economy-run-old',
    }, 'game-session-new')).toBeNull();
    expect(createSinglePlayerResultAuthority(1, {
      eligible: false,
      practice: true,
      sessionId: 'game-session-without-economy',
    }, 'game-session-without-economy')).toBeNull();
  });

  it('accepts staking competition authority without a legacy economy run', () => {
    expect(createSinglePlayerResultAuthority(3, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-staking',
      attemptId: 'competition-attempt-staking',
    }, 'game-session-staking')).toEqual({
      runId: 3,
      sessionId: 'game-session-staking',
      competitionAttemptId: 'competition-attempt-staking',
    });
  });

  it('solo permite salir del resultado después de observar guardado y confirmación', () => {
    const initial = emptySinglePlayerResultSaveState();

    expect(advanceSinglePlayerResultSaveState(initial, 1, false)).toBe(initial);

    const pending = advanceSinglePlayerResultSaveState(initial, 1, true);
    expect(pending).toEqual({
      pendingRunId: 1,
      savedRunId: null,
    });

    expect(advanceSinglePlayerResultSaveState(pending, 2, false)).toBe(pending);
    expect(advanceSinglePlayerResultSaveState(pending, 1, false)).toEqual({
      pendingRunId: null,
      savedRunId: 1,
    });
  });
});
