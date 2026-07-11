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
      ...match.rules,
      seed: match.seed,
      startAt: match.startAt,
      resumeAt: match.resumeAt,
    },
    players: match.players.map((player) => ({
      playerId: player.playerId,
      slot: player.slot,
      seq: player.snapshot.seq,
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
