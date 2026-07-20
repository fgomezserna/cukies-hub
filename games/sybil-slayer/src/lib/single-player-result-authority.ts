interface CompetitionAccessAuthority {
  readonly eligible: boolean;
  readonly practice: boolean;
  readonly sessionId: string | null;
  readonly attemptId?: string;
}

export interface SinglePlayerResultAuthority {
  readonly runId: number;
  readonly sessionId: string;
  readonly competitionAttemptId?: string;
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
      competitionAttemptId: access.attemptId,
    };
  }
  if (!access.practice) return null;
  return { runId, sessionId: access.sessionId };
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
