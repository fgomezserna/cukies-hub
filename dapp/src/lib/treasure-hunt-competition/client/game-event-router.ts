import type { CompetitionAttemptCoordinator } from './coordinator';

export interface CompetitionAwareCheckpoint {
  readonly score: number;
  readonly gameTime: number;
  readonly timestamp: number;
  readonly events?: readonly unknown[];
}

export interface CompetitionAwareGameEnd {
  readonly finalScore: number;
  readonly gameTime: number;
  readonly metadata?: unknown;
  readonly competitionAttemptId?: unknown;
}

interface RouterInput {
  readonly gameSessionId: string;
  readonly sessionToken: string;
  readonly competitionCoordinator?: CompetitionAttemptCoordinator;
  readonly fetchImpl?: typeof fetch;
}

export async function routeGameCheckpoint(
  input: RouterInput & { readonly checkpoint: CompetitionAwareCheckpoint },
) {
  if (input.competitionCoordinator?.hasActiveAttempt(input.gameSessionId)) {
    const result = await input.competitionCoordinator.checkpoint(input.gameSessionId, {
      score: input.checkpoint.score,
      gameTimeMs: input.checkpoint.gameTime,
      clientTimestampMs: input.checkpoint.timestamp,
    });
    return {
      source: 'competition' as const,
      success: true,
      result,
      sessionValid: result.status === 'active',
      honeypotDetected: false,
    };
  }

  const response = await (input.fetchImpl ?? fetch)('/api/games/checkpoint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken: input.sessionToken,
      checkpoint: input.checkpoint,
      events: input.checkpoint.events ?? [],
    }),
  });
  const result = await response.json() as Record<string, unknown>;
  return {
    source: 'legacy' as const,
    success: response.ok && result.success === true,
    result,
    sessionValid: result.sessionValid === true,
    honeypotDetected: result.honeypotDetected === true,
  };
}

export async function routeGameEnd(
  input: RouterInput & { readonly gameEnd: CompetitionAwareGameEnd },
) {
  const declaresCompetitionAuthority = Object.prototype.hasOwnProperty.call(
    input.gameEnd,
    'competitionAttemptId',
  );
  if (
    input.competitionCoordinator?.hasActiveAttempt(input.gameSessionId) ||
    declaresCompetitionAuthority
  ) {
    if (!input.competitionCoordinator) {
      throw new Error('Competition coordinator is required for a declared competition result');
    }
    if (
      declaresCompetitionAuthority &&
      (typeof input.gameEnd.competitionAttemptId !== 'string' ||
        input.gameEnd.competitionAttemptId.length === 0 ||
        input.gameEnd.competitionAttemptId.length > 128)
    ) {
      throw new Error('Invalid declared competition result authority');
    }
    const evidence = {
      score: input.gameEnd.finalScore,
      gameTimeMs: input.gameEnd.gameTime,
      clientTimestampMs: Date.now(),
    };
    const result = declaresCompetitionAuthority
      ? await input.competitionCoordinator.finishDeclared(
        input.gameSessionId,
        input.gameEnd.competitionAttemptId as string,
        evidence,
      )
      : await input.competitionCoordinator.finish(input.gameSessionId, evidence);
    return {
      source: 'competition' as const,
      success: true,
      finalScore: result.score ?? input.gameEnd.finalScore,
      isValid: result.status === 'valid',
      result,
    };
  }

  const response = await (input.fetchImpl ?? fetch)('/api/games/end-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionToken: input.sessionToken,
      finalScore: input.gameEnd.finalScore,
      metadata: input.gameEnd.metadata,
      timestamp: new Date().toISOString(),
    }),
  });
  const result = await response.json() as Record<string, unknown>;
  return {
    source: 'legacy' as const,
    success: response.ok && result.success === true,
    finalScore: typeof result.finalScore === 'number'
      ? result.finalScore
      : input.gameEnd.finalScore,
    isValid: result.isValid === true,
    result,
  };
}
