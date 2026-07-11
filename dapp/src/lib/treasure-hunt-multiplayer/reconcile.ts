import type {
  Match,
  MatchPlayer,
  MatchResultReason,
  PausableMatchStatus,
} from './types';

export interface ReconcileContext {
  readonly now: number;
  readonly createSeed: () => string;
}

export function isTerminalMatch(match: Match) {
  return match.status === 'finished' || match.status === 'abandoned';
}

function finalScores(match: Match): Readonly<Record<string, number>> {
  return Object.fromEntries(match.players.map((player) => [player.playerId, player.snapshot.score]));
}

function finishMatch(
  match: Match,
  now: number,
  reason: MatchResultReason,
  winnerPlayerId: string | null,
): Match {
  if (isTerminalMatch(match)) {
    return match;
  }

  return {
    ...match,
    status: reason === 'abandoned' ? 'abandoned' : 'finished',
    result: {
      winnerPlayerId,
      reason,
      finalScores: finalScores(match),
      finishedAt: now,
    },
    resumeAt: null,
    pausedFromStatus: null,
    pendingElimination: null,
    updatedAt: now,
  };
}

function winnerByScore(match: Match, now: number, reason: MatchResultReason): Match {
  const [first, second] = match.players;
  if (!first || !second) {
    return match;
  }

  if (first.snapshot.score === second.snapshot.score) {
    return finishMatch(match, now, 'draw', null);
  }

  return finishMatch(
    match,
    now,
    reason,
    first.snapshot.score > second.snapshot.score ? first.playerId : second.playerId,
  );
}

function isDead(player: MatchPlayer) {
  return player.snapshot.hearts === 0 || player.snapshot.lifecycle === 'eliminated';
}

function evaluateVictory(match: Match, now: number): Match {
  if (match.players.length !== 2 || (match.status !== 'running' && match.status !== 'sudden_death')) {
    return match;
  }

  const [first, second] = match.players;

  if (match.status === 'sudden_death' && match.suddenDeath) {
    const chaser = match.players.find(
      (player) => player.playerId === match.suddenDeath?.chasingPlayerId,
    );

    if (!chaser) {
      return match;
    }

    if (chaser.snapshot.score > match.suddenDeath.targetScore) {
      return finishMatch(match, now, 'sudden_death', chaser.playerId);
    }

    if (isDead(chaser)) {
      return finishMatch(match, now, 'sudden_death', match.suddenDeath.leaderPlayerId);
    }

    return match;
  }

  const firstDead = isDead(first);
  const secondDead = isDead(second);

  if (firstDead && secondDead) {
    return winnerByScore(match, now, 'elimination');
  }

  const scoreDifference = first.snapshot.score - second.snapshot.score;
  if (Math.abs(scoreDifference) >= match.rules.winDelta) {
    return finishMatch(
      match,
      now,
      'score_difference',
      scoreDifference > 0 ? first.playerId : second.playerId,
    );
  }

  if (!firstDead && !secondDead) {
    return match.pendingElimination
      ? { ...match, pendingElimination: null, updatedAt: now }
      : match;
  }

  const deadPlayer = firstDead ? first : second;
  const livingPlayer = firstDead ? second : first;
  const pending = match.pendingElimination;
  if (!pending || pending.playerId !== deadPlayer.playerId) {
    return {
      ...match,
      pendingElimination: {
        playerId: deadPlayer.playerId,
        scoreAtDeath: deadPlayer.snapshot.score,
        detectedAt: now,
        resolveAt: now + match.rules.eliminationResolutionDelayMs,
      },
      updatedAt: now,
    };
  }

  if (now < pending.resolveAt) {
    return match;
  }

  if (pending.scoreAtDeath <= livingPlayer.snapshot.score) {
    return finishMatch(match, now, 'elimination', livingPlayer.playerId);
  }

  return {
    ...match,
    status: 'sudden_death',
    pendingElimination: null,
    suddenDeath: {
      leaderPlayerId: deadPlayer.playerId,
      chasingPlayerId: livingPlayer.playerId,
      targetScore: pending.scoreAtDeath,
    },
    updatedAt: now,
  };
}

function accountOfflinePlayers(match: Match, now: number): Match {
  let changed = false;
  const players = match.players.map((player) => {
    if (player.presence === 'forfeited') {
      return player;
    }

    if (player.presence === 'online') {
      const offlineAt = player.lastHeartbeatAt + match.rules.offlineThresholdMs;
      if (now <= offlineAt) {
        return player;
      }

      changed = true;
      return {
        ...player,
        presence: 'offline' as const,
        offlineSince: offlineAt,
        reconnectAccountedAt: now,
        reconnectBudgetRemainingMs: Math.max(
          0,
          player.reconnectBudgetRemainingMs - (now - offlineAt),
        ),
      };
    }

    const accountedAt = player.reconnectAccountedAt ?? player.offlineSince ?? now;
    const elapsed = Math.max(0, now - accountedAt);
    if (elapsed === 0) {
      return player;
    }

    changed = true;
    return {
      ...player,
      reconnectAccountedAt: now,
      reconnectBudgetRemainingMs: Math.max(0, player.reconnectBudgetRemainingMs - elapsed),
    };
  });

  return changed ? { ...match, players, updatedAt: now } : match;
}

function resolveExpiredBudgets(match: Match, now: number): Match {
  const expired = match.players.filter(
    (player) => player.presence === 'offline' && player.reconnectBudgetRemainingMs === 0,
  );

  if (expired.length === 0) {
    return match;
  }

  if (expired.length === match.players.length) {
    const withForfeits: Match = {
      ...match,
      players: match.players.map((player) => ({ ...player, presence: 'forfeited' as const })),
      updatedAt: now,
    };
    return finishMatch(withForfeits, now, 'abandoned', null);
  }

  const expiredIds = new Set(expired.map((player) => player.playerId));
  const winner = match.players.find((player) => !expiredIds.has(player.playerId));
  if (!winner || winner.presence !== 'online') {
    return match;
  }

  const withForfeits: Match = {
    ...match,
    players: match.players.map((player) =>
      expiredIds.has(player.playerId) ? { ...player, presence: 'forfeited' as const } : player,
    ),
    updatedAt: now,
  };
  return finishMatch(withForfeits, now, 'forfeit', winner?.playerId ?? null);
}

function statusBeforePause(match: Match): PausableMatchStatus {
  if (match.status === 'countdown' && match.resumeAt !== null && match.pausedFromStatus) {
    return match.pausedFromStatus;
  }

  if (match.status === 'countdown' || match.status === 'running' || match.status === 'sudden_death') {
    return match.status;
  }

  return match.pausedFromStatus ?? 'running';
}

function reconcilePause(match: Match, now: number): Match {
  const hasOfflinePlayer = match.players.some((player) => player.presence === 'offline');

  if (hasOfflinePlayer && match.status !== 'paused_reconnect') {
    return {
      ...match,
      status: 'paused_reconnect',
      pausedFromStatus: statusBeforePause(match),
      resumeAt: null,
      updatedAt: now,
    };
  }

  if (!hasOfflinePlayer && match.status === 'paused_reconnect') {
    return {
      ...match,
      status: 'countdown',
      resumeAt: now + match.rules.reconnectCountdownMs,
      updatedAt: now,
    };
  }

  return match;
}

function advanceCountdown(match: Match, now: number): Match {
  if (match.status !== 'countdown') {
    return match;
  }

  if (match.resumeAt !== null) {
    if (now < match.resumeAt) {
      return match;
    }

    const resumedStatus = match.pausedFromStatus === 'sudden_death' ? 'sudden_death' : 'running';
    return {
      ...match,
      status: resumedStatus,
      resumeAt: null,
      pausedFromStatus: null,
      updatedAt: now,
    };
  }

  if (match.startAt !== null && now >= match.startAt) {
    return { ...match, status: 'running', updatedAt: now };
  }

  return match;
}

function lockMatchConfiguration(match: Match, context: ReconcileContext): Match {
  if (match.players.length !== 2 || match.seed !== null || match.startAt !== null) {
    return match;
  }

  return {
    ...match,
    players: match.players.map((player) => ({
      ...player,
      presence: 'online' as const,
      lastHeartbeatAt: context.now,
      offlineSince: null,
      reconnectAccountedAt: null,
      reconnectBudgetRemainingMs: match.rules.reconnectBudgetMs,
      lastSnapshotAcceptedAt: null,
    })),
    seed: context.createSeed(),
    startAt: context.now + match.rules.initialCountdownMs,
    status: 'countdown',
    updatedAt: context.now,
  };
}

export function reconnectMatchPlayer(match: Match, playerId: string, now: number): Match {
  if (isTerminalMatch(match)) {
    return match;
  }

  let found = false;
  const players = match.players.map((player) => {
    if (
      player.playerId !== playerId ||
      player.presence === 'forfeited' ||
      player.reconnectBudgetRemainingMs === 0
    ) {
      return player;
    }

    found = true;
    return {
      ...player,
      presence: 'online' as const,
      lastHeartbeatAt: now,
      offlineSince: null,
      reconnectAccountedAt: null,
    };
  });

  return found ? { ...match, players, updatedAt: now } : match;
}

export function reconcileMatch(match: Match, context: ReconcileContext): Match {
  if (isTerminalMatch(match)) {
    return match;
  }

  let next = lockMatchConfiguration(match, context);
  if (next.players.length !== 2 || next.status === 'waiting') {
    return next;
  }

  next = accountOfflinePlayers(next, context.now);
  next = resolveExpiredBudgets(next, context.now);
  if (isTerminalMatch(next)) {
    return next;
  }

  next = reconcilePause(next, context.now);
  next = advanceCountdown(next, context.now);
  return evaluateVictory(next, context.now);
}
