import {
  createSinglePlayerResultAuthority,
  resolveSinglePlayerResultDispatch,
} from '../../../games/sybil-slayer/src/lib/single-player-result-authority';

describe('Treasure Hunt single-player result authority', () => {
  it('never replays a terminal run after the parent rotates the GameSession', () => {
    const firstRun = createSinglePlayerResultAuthority(1, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-1',
      attemptId: 'competition-attempt-1',
    }, 'game-session-1');

    expect(resolveSinglePlayerResultDispatch(firstRun, 'game-session-1', null)).toEqual({
      runId: 1,
      sessionId: 'game-session-1',
      competitionAttemptId: 'competition-attempt-1',
    });
    expect(resolveSinglePlayerResultDispatch(firstRun, 'game-session-1', 1)).toBeNull();
    expect(resolveSinglePlayerResultDispatch(firstRun, 'game-session-2', null)).toBeNull();

    const secondRun = createSinglePlayerResultAuthority(2, {
      eligible: true,
      practice: false,
      sessionId: 'game-session-2',
      attemptId: 'competition-attempt-2',
    }, 'game-session-2');
    expect(resolveSinglePlayerResultDispatch(secondRun, 'game-session-2', 1)).toEqual({
      runId: 2,
      sessionId: 'game-session-2',
      competitionAttemptId: 'competition-attempt-2',
    });
  });

  it('supports a session-bound practice result but rejects incomplete authority', () => {
    expect(createSinglePlayerResultAuthority(1, {
      eligible: false,
      practice: true,
      sessionId: 'game-session-practice',
    }, 'game-session-practice')).toEqual({
      runId: 1,
      sessionId: 'game-session-practice',
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
    }, 'game-session-new')).toBeNull();
  });
});
