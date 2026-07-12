import type { Match, MatchPlayer, MatchRules, MatchSlot } from './types';
import {
  TREASURE_HUNT_GAME_ID,
  TREASURE_HUNT_MODE,
  TREASURE_HUNT_REWARD_ELIGIBLE,
  TREASURE_HUNT_RULES_VERSION,
} from './types';

export interface NewMatchInput {
  readonly matchId: string;
  readonly roomCode: string;
  readonly firstPlayer: {
    readonly playerId: string;
    readonly userId: string;
    readonly gameSessionId: string;
    readonly clientInstanceId: string;
  };
  readonly rules: MatchRules;
  readonly now: number;
  readonly rulesVersion?: string;
}

export function createMatchPlayer(input: {
  playerId: string;
  userId: string;
  gameSessionId: string;
  clientInstanceId: string;
  slot: MatchSlot;
  rules: MatchRules;
  now: number;
}): MatchPlayer {
  return {
    playerId: input.playerId,
    userId: input.userId,
    gameSessionId: input.gameSessionId,
    clientInstanceId: input.clientInstanceId,
    slot: input.slot,
    joinedAt: input.now,
    snapshot: {
      seq: -1,
      score: 0,
      hearts: input.rules.initialHearts,
      elapsedMs: 0,
      lifecycle: 'waiting',
    },
    presence: 'online',
    lastHeartbeatAt: input.now,
    offlineSince: null,
    reconnectAccountedAt: null,
    reconnectBudgetRemainingMs: input.rules.reconnectBudgetMs,
    lastSnapshotAcceptedAt: null,
  };
}

export function createWaitingMatch(input: NewMatchInput): Match {
  return {
    matchId: input.matchId,
    roomCode: input.roomCode,
    gameId: TREASURE_HUNT_GAME_ID,
    mode: TREASURE_HUNT_MODE,
    rewardEligible: TREASURE_HUNT_REWARD_ELIGIBLE,
    rulesVersion: input.rulesVersion ?? TREASURE_HUNT_RULES_VERSION,
    revision: 0,
    status: 'waiting',
    rules: input.rules,
    players: [
      createMatchPlayer({
        ...input.firstPlayer,
        slot: 0,
        rules: input.rules,
        now: input.now,
      }),
    ],
    activeUserIds: [input.firstPlayer.userId],
    seed: null,
    startAt: null,
    lobbyExpiresAt: input.now + input.rules.lobbyTimeoutMs,
    roundEndsAt: null,
    suddenDeathEndsAt: null,
    resumeAt: null,
    resumeEpoch: 0,
    pauseStartedAt: null,
    pausedFromStatus: null,
    pendingElimination: null,
    suddenDeath: null,
    result: null,
    nextReconcileAt: input.now + input.rules.lobbyTimeoutMs,
    expiresAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
