export const TREASURE_HUNT_GAME_ID = 'treasure-hunt' as const;
export const TREASURE_HUNT_MODE = 'staging_unranked' as const;
export const TREASURE_HUNT_REWARD_ELIGIBLE = false as const;
export const TREASURE_HUNT_RULES_VERSION = 'treasure-hunt-multiplayer-v2' as const;

export type MatchStatus =
  | 'waiting'
  | 'countdown'
  | 'running'
  | 'paused_reconnect'
  | 'sudden_death'
  | 'finished'
  | 'abandoned';

export type PlayerLifecycle = 'waiting' | 'ready' | 'playing' | 'eliminated' | 'finished';
export type PlayerPresence = 'online' | 'offline' | 'forfeited';
export type MatchSlot = 0 | 1;

export interface PlayerSnapshot {
  readonly seq: number;
  readonly score: number;
  readonly hearts: number;
  readonly elapsedMs: number;
  readonly lifecycle: PlayerLifecycle;
}

export interface MatchPlayer {
  readonly playerId: string;
  readonly userId: string;
  readonly gameSessionId: string;
  readonly clientInstanceId: string;
  readonly slot: MatchSlot;
  readonly joinedAt: number;
  readonly snapshot: PlayerSnapshot;
  readonly presence: PlayerPresence;
  readonly lastHeartbeatAt: number;
  readonly offlineSince: number | null;
  readonly reconnectAccountedAt: number | null;
  readonly reconnectBudgetRemainingMs: number;
  readonly lastSnapshotAcceptedAt: number | null;
}

export interface MatchRules {
  readonly winDelta: number;
  readonly initialCountdownMs: number;
  readonly lobbyTimeoutMs: number;
  readonly roundDurationMs: number;
  readonly suddenDeathTimeoutMs: number;
  readonly terminalRetentionMs: number;
  readonly offlineThresholdMs: number;
  readonly reconnectBudgetMs: number;
  readonly reconnectCountdownMs: number;
  readonly eliminationResolutionDelayMs: number;
  readonly initialHearts: number;
  readonly maxHearts: number;
  readonly maxHeartsDelta: number;
  readonly maxScore: number;
  readonly maxElapsedMs: number;
  readonly scoreDeltaWindowMs: number;
  readonly maxScoreDeltaPerWindow: number;
  readonly snapshotTimeToleranceMs: number;
}

export type MatchResultReason =
  | 'score_difference'
  | 'elimination'
  | 'sudden_death'
  | 'forfeit'
  | 'draw'
  | 'abandoned';

export interface MatchResult {
  readonly winnerPlayerId: string | null;
  readonly reason: MatchResultReason;
  readonly finalScores: Readonly<Record<string, number>>;
  readonly finishedAt: number;
}

export interface SuddenDeathState {
  readonly leaderPlayerId: string;
  readonly chasingPlayerId: string;
  readonly targetScore: number;
}

export interface PendingElimination {
  readonly playerId: string;
  readonly scoreAtDeath: number;
  readonly detectedAt: number;
  readonly resolveAt: number;
}

export type PausableMatchStatus = 'countdown' | 'running' | 'sudden_death';

export interface Match {
  readonly matchId: string;
  readonly roomCode: string;
  readonly gameId: typeof TREASURE_HUNT_GAME_ID;
  readonly mode: typeof TREASURE_HUNT_MODE;
  readonly rewardEligible: typeof TREASURE_HUNT_REWARD_ELIGIBLE;
  readonly rulesVersion: string;
  readonly revision: number;
  readonly status: MatchStatus;
  readonly rules: MatchRules;
  readonly players: readonly MatchPlayer[];
  /** Unique-indexed while non-terminal; emptied for every terminal transition. */
  readonly activeUserIds: readonly string[];
  readonly seed: string | null;
  readonly startAt: number | null;
  readonly lobbyExpiresAt: number;
  readonly roundEndsAt: number | null;
  readonly suddenDeathEndsAt: number | null;
  readonly resumeAt: number | null;
  readonly resumeEpoch: number;
  readonly pauseStartedAt: number | null;
  readonly pausedFromStatus: PausableMatchStatus | null;
  readonly pendingElimination: PendingElimination | null;
  readonly suddenDeath: SuddenDeathState | null;
  readonly result: MatchResult | null;
  /** Internal scheduler deadline. It is intentionally omitted from PublicMatch. */
  readonly nextReconcileAt: number | null;
  /** Unix milliseconds converted to a BSON Date by MongoMatchRepository for the TTL index. */
  readonly expiresAt: number | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface MatchIdentity {
  readonly userId: string;
  readonly gameSessionId: string;
  readonly clientInstanceId: string;
}

export interface PublicMatchPlayer {
  readonly playerId: string;
  readonly slot: MatchSlot;
  readonly seq: number;
  readonly score: number;
  readonly hearts: number;
  readonly elapsedMs: number;
  readonly lifecycle: PlayerLifecycle;
  readonly presence: PlayerPresence;
  readonly reconnectBudgetRemainingMs: number;
}

export interface PublicMatch {
  readonly matchId: string;
  readonly roomCode: string;
  readonly gameId: typeof TREASURE_HUNT_GAME_ID;
  readonly mode: typeof TREASURE_HUNT_MODE;
  readonly rewardEligible: typeof TREASURE_HUNT_REWARD_ELIGIBLE;
  readonly rulesVersion: string;
  readonly revision: number;
  readonly status: MatchStatus;
  readonly config: MatchRules & {
    readonly seed: string | null;
    readonly startAt: number | null;
    readonly lobbyExpiresAt: number;
    readonly roundEndsAt: number | null;
    readonly suddenDeathEndsAt: number | null;
    readonly resumeAt: number | null;
    readonly resumeEpoch: number;
  };
  readonly players: readonly PublicMatchPlayer[];
  readonly suddenDeath: SuddenDeathState | null;
  readonly result: MatchResult | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}
