import type { Match, PublicMatch } from './types';

export function projectPublicMatch(match: Match): PublicMatch {
  return {
    matchId: match.matchId,
    roomCode: match.roomCode,
    gameId: match.gameId,
    mode: match.mode,
    rewardEligible: match.rewardEligible,
    rulesVersion: match.rulesVersion,
    revision: match.revision,
    status: match.status,
    config: {
      seed: match.seed,
      startAt: match.startAt,
      resumeAt: match.resumeAt,
      winDelta: match.rules.winDelta,
    },
    players: match.players.map((player) => ({
      playerId: player.playerId,
      slot: player.slot,
      score: player.snapshot.score,
      hearts: player.snapshot.hearts,
      elapsedMs: player.snapshot.elapsedMs,
      lifecycle: player.snapshot.lifecycle,
      presence: player.presence,
      reconnectBudgetRemainingMs: player.reconnectBudgetRemainingMs,
    })),
    suddenDeath: match.suddenDeath,
    result: match.result,
    createdAt: match.createdAt,
    updatedAt: match.updatedAt,
  };
}
