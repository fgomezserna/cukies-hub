interface CompetitionAccessAuthority {
  readonly eligible: boolean;
  readonly practice: boolean;
  readonly sessionId: string | null;
  readonly attemptId?: string;
  readonly economyRunId?: string;
}

export interface SinglePlayerResultAuthority {
  readonly runId: number;
  readonly sessionId: string;
  readonly economyRunId?: string;
  readonly competitionAttemptId?: string;
}

export interface SinglePlayerResultSaveState {
  readonly pendingRunId: number | null;
  readonly savedRunId: number | null;
}

export function emptySinglePlayerResultSaveState(): SinglePlayerResultSaveState {
  return {
    pendingRunId: null,
    savedRunId: null,
  };
}

export function advanceSinglePlayerResultSaveState(
  state: SinglePlayerResultSaveState,
  runId: number | null,
  hasPendingGameEnd: boolean,
): SinglePlayerResultSaveState {
  if (!Number.isSafeInteger(runId) || Number(runId) < 1) return state;

  if (hasPendingGameEnd) {
    if (state.pendingRunId === runId && state.savedRunId === null) return state;
    return {
      pendingRunId: runId,
      savedRunId: null,
    };
  }

  if (state.pendingRunId !== runId) return state;
  return {
    pendingRunId: null,
    savedRunId: runId,
  };
}

export function createSinglePlayerResultAuthority(
  runId: number,
  access: CompetitionAccessAuthority,
  currentSessionId: string | null,
): SinglePlayerResultAuthority | null {
  if (
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !access.sessionId ||
    access.sessionId !== currentSessionId
  ) {
    return null;
  }
  if (access.eligible) {
    if (!access.attemptId) return null;
    return {
      runId,
      sessionId: access.sessionId,
      ...(access.economyRunId ? { economyRunId: access.economyRunId } : {}),
      competitionAttemptId: access.attemptId,
    };
  }
  if (!access.practice || !access.economyRunId) return null;
  return {
    runId,
    sessionId: access.sessionId,
    economyRunId: access.economyRunId,
  };
}

export function resolveSinglePlayerResultDispatch(
  authority: SinglePlayerResultAuthority | null,
  currentSessionId: string | null,
  lastDispatchedRunId: number | null,
): SinglePlayerResultAuthority | null {
  if (
    !authority ||
    authority.runId === lastDispatchedRunId ||
    authority.sessionId !== currentSessionId
  ) {
    return null;
  }
  return authority;
}
