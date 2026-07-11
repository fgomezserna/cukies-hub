import { act, renderHook } from '@testing-library/react';

import {
  shouldResetLocalGameForAuthorityChange,
  useMultiplayerMatch,
} from '../../../games/sybil-slayer/src/hooks/useMultiplayerMatch';
import type { MultiplayerControllerState } from '../../../games/sybil-slayer/src/lib/multiplayer-client';

interface MockControllerOptions {
  readonly onSeed?: (seed: string) => void;
  readonly onState?: (state: MultiplayerControllerState) => void;
}

interface MockControllerInstance {
  readonly options: MockControllerOptions;
  readonly dispose: jest.Mock;
  emit(state: MultiplayerControllerState): void;
}

const mockControllerInstances: MockControllerInstance[] = [];
const mockCreateTreasureHuntParentTransport = jest.fn(() => ({ transport: true }));
const mockRandomClear = jest.fn();
const mockRandomSetSeed = jest.fn();

jest.mock('../../../games/sybil-slayer/src/lib/multiplayer-client', () => {
  class MockMultiplayerClientError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
      this.name = 'MultiplayerClientError';
    }
  }

  class MockTreasureHuntMultiplayerController implements MockControllerInstance {
    readonly dispose = jest.fn();
    readonly join = jest.fn(async () => undefined);
    readonly publishSnapshot = jest.fn();
    readonly reset = jest.fn(async () => undefined);
    readonly release = jest.fn(async () => true);
    readonly getState = jest.fn(() => ({
      playerId: null,
      match: null,
    }));

    constructor(readonly options: MockControllerOptions) {
      mockControllerInstances.push(this);
    }

    emit(state: MultiplayerControllerState) {
      this.options.onState?.(state);
    }
  }

  return {
    MultiplayerClientError: MockMultiplayerClientError,
    TreasureHuntMultiplayerController: MockTreasureHuntMultiplayerController,
    createTreasureHuntParentTransport: () =>
      mockCreateTreasureHuntParentTransport(),
  };
});

jest.mock('../../../games/sybil-slayer/src/lib/random', () => ({
  randomManager: {
    clear: () => mockRandomClear(),
    setSeed: (seed: string) => mockRandomSetSeed(seed),
  },
}));

jest.mock('../../../games/sybil-slayer/src/lib/multiplayer-feature', () => ({
  isTreasureHuntMultiplayerEnabled: () => true,
  isTreasureHuntMatchNonTerminal: (status: string | null | undefined) =>
    Boolean(status && status !== 'finished' && status !== 'abandoned'),
}));

const ACTIVE_STATE = {
  playerId: 'player-a',
  slot: 0,
  roomCode: 'ROOM-A',
  inviteUrl: 'https://hub.example/game?room=ROOM-A',
  error: null,
  joining: false,
  startSignal: 1,
  resumeSignal: 0,
  match: {
    matchId: 'match-a',
    roomCode: 'ROOM-A',
    gameId: 'treasure-hunt',
    mode: 'staging_unranked',
    rewardEligible: false,
    rulesVersion: 'v1',
    revision: 1,
    status: 'running',
    config: {
      seed: 'seed-a',
      startAt: 1_000,
      lobbyExpiresAt: 30_000,
      roundEndsAt: 31_000,
      suddenDeathEndsAt: null,
      resumeAt: null,
      resumeEpoch: 0,
      winDelta: 500,
    },
    players: [{
      playerId: 'player-a',
      slot: 0,
      seq: 0,
      score: 100,
      hearts: 3,
      elapsedMs: 1_000,
      lifecycle: 'playing',
      presence: 'online',
      reconnectBudgetRemainingMs: 15_000,
    }],
    suddenDeath: null,
    result: null,
    createdAt: 0,
    updatedAt: 1,
  },
} as unknown as MultiplayerControllerState;

describe('useMultiplayerMatch GameSession authority lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockControllerInstances.length = 0;
  });

  it('has no transport without authority and replaces controller/state on every session change', () => {
    const { result, rerender, unmount } = renderHook(
      ({ authoritySessionId }: { authoritySessionId: string | null }) =>
        useMultiplayerMatch(authoritySessionId),
      { initialProps: { authoritySessionId: null as string | null } },
    );

    expect(result.current.status).toBe('idle');
    expect(result.current.hasNonTerminalMatch).toBe(false);
    expect(mockCreateTreasureHuntParentTransport).not.toHaveBeenCalled();

    rerender({ authoritySessionId: 'game-session-a' });
    expect(mockCreateTreasureHuntParentTransport).toHaveBeenCalledTimes(1);
    expect(mockControllerInstances).toHaveLength(1);
    const firstController = mockControllerInstances[0];

    act(() => firstController.emit(ACTIVE_STATE));
    expect(result.current.status).toBe('running');
    expect(result.current.roomCode).toBe('ROOM-A');
    expect(result.current.hasNonTerminalMatch).toBe(true);

    rerender({ authoritySessionId: 'game-session-a' });
    expect(mockCreateTreasureHuntParentTransport).toHaveBeenCalledTimes(1);
    expect(firstController.dispose).not.toHaveBeenCalled();

    rerender({ authoritySessionId: 'game-session-b' });
    expect(firstController.dispose).toHaveBeenCalledTimes(1);
    expect(mockCreateTreasureHuntParentTransport).toHaveBeenCalledTimes(2);
    expect(mockControllerInstances).toHaveLength(2);
    expect(result.current.status).toBe('idle');
    expect(result.current.roomCode).toBeNull();
    expect(result.current.hasNonTerminalMatch).toBe(false);

    act(() => firstController.emit(ACTIVE_STATE));
    expect(result.current.status).toBe('idle');
    expect(result.current.roomCode).toBeNull();

    const secondController = mockControllerInstances[1];
    rerender({ authoritySessionId: null });
    expect(secondController.dispose).toHaveBeenCalledTimes(1);
    expect(mockCreateTreasureHuntParentTransport).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('idle');
    expect(result.current.hasNonTerminalMatch).toBe(false);
    expect(mockRandomClear).toHaveBeenCalled();

    unmount();
  });

  it('rejects late state/seed from the old authority and defines the local UI reset contract', () => {
    expect(shouldResetLocalGameForAuthorityChange(null, 'game-session-a')).toBe(false);
    expect(shouldResetLocalGameForAuthorityChange('game-session-a', 'game-session-a')).toBe(false);
    expect(shouldResetLocalGameForAuthorityChange('game-session-a', null)).toBe(true);
    expect(shouldResetLocalGameForAuthorityChange('game-session-a', 'game-session-b')).toBe(true);

    const { result, rerender, unmount } = renderHook(
      ({ authoritySessionId }: { authoritySessionId: string | null }) =>
        useMultiplayerMatch(authoritySessionId),
      { initialProps: { authoritySessionId: 'game-session-a' } },
    );
    const firstController = mockControllerInstances[0];

    rerender({ authoritySessionId: 'game-session-b' });
    const secondController = mockControllerInstances[1];
    mockRandomSetSeed.mockClear();

    act(() => {
      firstController.options.onSeed?.('stale-seed');
      firstController.emit(ACTIVE_STATE);
    });
    expect(mockRandomSetSeed).not.toHaveBeenCalled();
    expect(result.current.status).toBe('idle');

    act(() => secondController.options.onSeed?.('fresh-seed'));
    expect(mockRandomSetSeed).toHaveBeenCalledWith('fresh-seed');
    unmount();
  });
});
