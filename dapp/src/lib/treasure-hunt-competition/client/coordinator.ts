const COMPETITION_ATTEMPTS_ENDPOINT = '/api/games/treasure-hunt/competition/attempts';

export interface CompetitionClientEvidence {
  readonly score: number;
  readonly gameTimeMs: number;
  readonly clientTimestampMs?: number | null;
}

export interface CompetitionClientAttempt {
  readonly attemptId: string;
  readonly seed: string;
  readonly alias: string;
  readonly status: 'active';
  readonly nextSequence: number;
  readonly receipt: string;
}

export interface CompetitionClientEvidenceResult {
  readonly accepted: boolean;
  readonly status: 'active' | 'review' | 'valid' | 'invalid' | 'abandoned';
  readonly nextSequence: number;
  readonly receipt: string | null;
  readonly score?: number;
  readonly gameTimeMs?: number;
}

interface MutableAttemptState {
  attemptId: string;
  seed: string;
  alias: string;
  status: 'active';
  nextSequence: number;
  receipt: string;
}

interface RecoverableAttemptState {
  readonly attemptId: string;
  readonly seed: string;
  readonly alias: string;
  readonly status: CompetitionClientEvidenceResult['status'];
  readonly nextSequence: number;
  readonly receipt: string | null;
  readonly score: number;
  readonly gameTimeMs: number;
}

interface CoordinatorOptions {
  readonly fetchImpl?: typeof fetch;
  readonly basePath?: string;
}

interface ErrorPayload {
  readonly error?: unknown;
  readonly message?: unknown;
}

export class CompetitionClientError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CompetitionClientError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new CompetitionClientError('INVALID_SERVER_RESPONSE', 502, `Invalid ${field} in competition response`);
  }
  return Number(value);
}

function parseAttempt(payload: unknown): MutableAttemptState {
  if (!isRecord(payload)) {
    throw new CompetitionClientError('INVALID_SERVER_RESPONSE', 502, 'Missing competition attempt');
  }
  const { attemptId, seed, alias, status, receipt } = payload;
  if (
    typeof attemptId !== 'string' || !attemptId ||
    typeof seed !== 'string' || !seed ||
    typeof alias !== 'string' || !alias ||
    status !== 'active' ||
    typeof receipt !== 'string' || !receipt
  ) {
    throw new CompetitionClientError('INVALID_SERVER_RESPONSE', 502, 'Invalid competition attempt response');
  }
  return {
    attemptId,
    seed,
    alias,
    status,
    receipt,
    nextSequence: assertSafeNonNegativeInteger(payload.nextSequence, 'nextSequence'),
  };
}

function parseEvidenceResult(payload: unknown): CompetitionClientEvidenceResult {
  if (!isRecord(payload)) {
    throw new CompetitionClientError('INVALID_SERVER_RESPONSE', 502, 'Missing competition evidence result');
  }
  const status = payload.status;
  if (
    typeof payload.accepted !== 'boolean' ||
    !['active', 'review', 'valid', 'invalid', 'abandoned'].includes(String(status)) ||
    (payload.receipt !== null && typeof payload.receipt !== 'string')
  ) {
    throw new CompetitionClientError('INVALID_SERVER_RESPONSE', 502, 'Invalid competition evidence response');
  }
  return {
    accepted: payload.accepted,
    status: status as CompetitionClientEvidenceResult['status'],
    nextSequence: assertSafeNonNegativeInteger(payload.nextSequence, 'nextSequence'),
    receipt: payload.receipt as string | null,
    score: payload.score === undefined
      ? undefined
      : assertSafeNonNegativeInteger(payload.score, 'score'),
    gameTimeMs: payload.gameTimeMs === undefined
      ? undefined
      : assertSafeNonNegativeInteger(payload.gameTimeMs, 'gameTimeMs'),
  };
}

function parseRecoverableAttempt(payload: unknown): RecoverableAttemptState | null {
  if (!isRecord(payload)) return null;
  const status = String(payload.status);
  if (
    typeof payload.attemptId !== 'string' || !payload.attemptId ||
    typeof payload.seed !== 'string' || !payload.seed ||
    typeof payload.alias !== 'string' || !payload.alias ||
    !['active', 'review', 'valid', 'invalid', 'abandoned'].includes(status) ||
    (payload.receipt !== null && typeof payload.receipt !== 'string')
  ) {
    return null;
  }
  try {
    return {
      attemptId: payload.attemptId,
      seed: payload.seed,
      alias: payload.alias,
      status: status as RecoverableAttemptState['status'],
      receipt: payload.receipt as string | null,
      nextSequence: assertSafeNonNegativeInteger(payload.nextSequence, 'nextSequence'),
      score: assertSafeNonNegativeInteger(payload.score, 'score'),
      gameTimeMs: assertSafeNonNegativeInteger(payload.gameTimeMs, 'gameTimeMs'),
    };
  } catch {
    return null;
  }
}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new CompetitionClientError(
      'INVALID_SERVER_RESPONSE',
      response.status || 502,
      'Competition server returned invalid JSON',
    );
  }
  if (!isRecord(body)) {
    throw new CompetitionClientError('INVALID_SERVER_RESPONSE', response.status || 502, 'Invalid competition response');
  }
  if (!response.ok || body.success !== true) {
    const errorBody = body as ErrorPayload;
    const code = typeof errorBody.error === 'string' ? errorBody.error : 'COMPETITION_REQUEST_FAILED';
    const message = typeof errorBody.message === 'string' ? errorBody.message : code;
    throw new CompetitionClientError(code, response.status || 500, message);
  }
  return body;
}

function validateEvidence(evidence: CompetitionClientEvidence) {
  assertSafeNonNegativeInteger(evidence.score, 'score');
  assertSafeNonNegativeInteger(evidence.gameTimeMs, 'gameTimeMs');
  if (evidence.clientTimestampMs != null) {
    assertSafeNonNegativeInteger(evidence.clientTimestampMs, 'clientTimestampMs');
  }
}

function publicAttempt(state: MutableAttemptState): CompetitionClientAttempt {
  return { ...state };
}

export function createCompetitionAttemptCoordinator(options: CoordinatorOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const basePath = (options.basePath ?? COMPETITION_ATTEMPTS_ENDPOINT).replace(/\/$/, '');
  const attempts = new Map<string, MutableAttemptState>();
  const pendingStarts = new Map<string, Promise<CompetitionClientAttempt>>();
  const queues = new Map<string, Promise<void>>();
  const generations = new Map<string, number>();

  async function post(path: string, body: unknown) {
    const serializedBody = JSON.stringify(body);
    let lastError: CompetitionClientError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(path, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: serializedBody,
        });
        return await readResponse(response);
      } catch (error) {
        const normalized = error instanceof CompetitionClientError
          ? error
          : new CompetitionClientError(
            'NETWORK_ERROR',
            0,
            error instanceof Error ? error.message : 'Competition request failed',
          );
        lastError = normalized;
        const retryable = normalized.status === 0 || normalized.status >= 500 || (
          normalized.status === 409 && normalized.code === 'EVIDENCE_CONFLICT'
        );
        if (attempt >= 2 || !retryable) throw normalized;
      }
    }
    throw lastError ?? new CompetitionClientError('NETWORK_ERROR', 0, 'Competition request failed');
  }

  async function get(path: string) {
    let lastError: CompetitionClientError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(path, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        return await readResponse(response);
      } catch (error) {
        const normalized = error instanceof CompetitionClientError
          ? error
          : new CompetitionClientError(
            'NETWORK_ERROR',
            0,
            error instanceof Error ? error.message : 'Competition request failed',
          );
        lastError = normalized;
        if (attempt >= 2 || (normalized.status !== 0 && normalized.status < 500)) {
          throw normalized;
        }
      }
    }
    throw lastError ?? new CompetitionClientError('NETWORK_ERROR', 0, 'Competition request failed');
  }

  function enqueue<T>(gameSessionId: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(gameSessionId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    const marker = current.then(() => undefined, () => undefined);
    queues.set(gameSessionId, marker);
    marker.finally(() => {
      if (queues.get(gameSessionId) === marker) queues.delete(gameSessionId);
    });
    return current;
  }

  async function start(gameSessionId: string): Promise<CompetitionClientAttempt> {
    if (!gameSessionId) {
      throw new CompetitionClientError('INVALID_GAME_SESSION', 400, 'A game session is required');
    }
    const existing = attempts.get(gameSessionId);
    if (existing) return publicAttempt(existing);
    const pending = pendingStarts.get(gameSessionId);
    if (pending) return pending;
    const generation = generations.get(gameSessionId) ?? 0;

    const request = (async () => {
      const body = await post(basePath, { gameSessionId });
      const attempt = parseAttempt(body.attempt);
      if ((generations.get(gameSessionId) ?? 0) !== generation) {
        throw new CompetitionClientError('ATTEMPT_CANCELLED', 409, 'Competition attempt was cancelled locally');
      }
      attempts.set(gameSessionId, attempt);
      return publicAttempt(attempt);
    })();
    pendingStarts.set(gameSessionId, request);
    request.finally(() => {
      if (pendingStarts.get(gameSessionId) === request) pendingStarts.delete(gameSessionId);
    }).catch(() => undefined);
    return request;
  }

  async function checkpointUnlocked(
    gameSessionId: string,
    evidence: CompetitionClientEvidence,
  ): Promise<CompetitionClientEvidenceResult> {
    validateEvidence(evidence);
    const attempt = attempts.get(gameSessionId);
    if (!attempt) {
      throw new CompetitionClientError('ATTEMPT_NOT_ACTIVE', 409, 'No active competition attempt');
    }
    const body = await post(`${basePath}/${encodeURIComponent(attempt.attemptId)}/checkpoint`, {
      receipt: attempt.receipt,
      sequence: attempt.nextSequence,
      score: evidence.score,
      gameTimeMs: evidence.gameTimeMs,
      clientTimestampMs: evidence.clientTimestampMs ?? null,
    });
    const result = parseEvidenceResult(body.result);
    if (result.status !== 'active' || !result.receipt) {
      attempts.delete(gameSessionId);
      return result;
    }
    attempt.nextSequence = result.nextSequence;
    attempt.receipt = result.receipt;
    return result;
  }

  function checkpoint(gameSessionId: string, evidence: CompetitionClientEvidence) {
    return enqueue(gameSessionId, () => checkpointUnlocked(gameSessionId, evidence));
  }

  async function finishUnlocked(
    gameSessionId: string,
    evidence: CompetitionClientEvidence,
  ) {
    validateEvidence(evidence);
    let attempt = attempts.get(gameSessionId);
    if (!attempt) {
      throw new CompetitionClientError('ATTEMPT_NOT_ACTIVE', 409, 'No active competition attempt');
    }
    if (attempt.nextSequence === 0) {
      await checkpointUnlocked(gameSessionId, evidence);
      attempt = attempts.get(gameSessionId);
      if (!attempt) {
        throw new CompetitionClientError('ATTEMPT_NOT_ACTIVE', 409, 'Competition attempt closed before finish');
      }
    }
    const body = await post(`${basePath}/${encodeURIComponent(attempt.attemptId)}/finish`, {
      receipt: attempt.receipt,
      sequence: attempt.nextSequence,
      score: evidence.score,
      gameTimeMs: evidence.gameTimeMs,
      clientTimestampMs: evidence.clientTimestampMs ?? null,
    });
    const result = parseEvidenceResult(body.result);
    if (result.status === 'active' && result.receipt) {
      attempt.nextSequence = result.nextSequence;
      attempt.receipt = result.receipt;
    } else {
      attempts.delete(gameSessionId);
    }
    return result;
  }

  function finish(gameSessionId: string, evidence: CompetitionClientEvidence) {
    return enqueue(gameSessionId, () => finishUnlocked(gameSessionId, evidence));
  }

  function finishDeclared(
    gameSessionId: string,
    attemptId: string,
    evidence: CompetitionClientEvidence,
  ) {
    return enqueue(gameSessionId, async () => {
      validateEvidence(evidence);
      if (!attemptId || attemptId.length > 128) {
        throw new CompetitionClientError(
          'INVALID_COMPETITION_AUTHORITY',
          400,
          'Competition result authority is invalid',
        );
      }

      const current = attempts.get(gameSessionId);
      if (current && current.attemptId !== attemptId) {
        throw new CompetitionClientError(
          'COMPETITION_AUTHORITY_CONFLICT',
          409,
          'Competition result does not match the active attempt',
        );
      }
      if (!current) {
        const body = await get(`${basePath}?limit=500`);
        const listed = Array.isArray(body.attempts)
          ? body.attempts.map(parseRecoverableAttempt).filter(
            (attempt): attempt is RecoverableAttemptState => Boolean(attempt),
          )
          : [];
        const recovered = listed.find((attempt) => attempt.attemptId === attemptId);
        if (!recovered) {
          throw new CompetitionClientError(
            'COMPETITION_ATTEMPT_NOT_FOUND',
            404,
            'Declared competition attempt could not be recovered',
          );
        }
        if (recovered.status === 'active') {
          if (!recovered.receipt) {
            throw new CompetitionClientError(
              'COMPETITION_FINISH_PENDING',
              409,
              'Competition finish is awaiting server recovery',
            );
          }
          attempts.set(gameSessionId, {
            attemptId: recovered.attemptId,
            seed: recovered.seed,
            alias: recovered.alias,
            status: 'active',
            nextSequence: recovered.nextSequence,
            receipt: recovered.receipt,
          });
        } else if (['review', 'valid', 'invalid'].includes(recovered.status)) {
          if (
            recovered.score !== evidence.score ||
            recovered.gameTimeMs !== evidence.gameTimeMs
          ) {
            throw new CompetitionClientError(
              'COMPETITION_RESULT_MISMATCH',
              409,
              'Recovered competition result does not match local evidence',
            );
          }
          return {
            accepted: true,
            status: recovered.status,
            nextSequence: recovered.nextSequence,
            receipt: null,
            score: recovered.score,
            gameTimeMs: recovered.gameTimeMs,
          } satisfies CompetitionClientEvidenceResult;
        } else {
          throw new CompetitionClientError(
            'COMPETITION_ATTEMPT_ABANDONED',
            409,
            'Declared competition attempt is not recoverable',
          );
        }
      }

      return finishUnlocked(gameSessionId, evidence);
    });
  }

  function reset(gameSessionId?: string) {
    if (gameSessionId) {
      generations.set(gameSessionId, (generations.get(gameSessionId) ?? 0) + 1);
      attempts.delete(gameSessionId);
      pendingStarts.delete(gameSessionId);
      return;
    }
    const knownSessions = new Set([
      ...generations.keys(),
      ...attempts.keys(),
      ...pendingStarts.keys(),
    ]);
    for (const gameSessionId of knownSessions) {
      generations.set(gameSessionId, (generations.get(gameSessionId) ?? 0) + 1);
    }
    attempts.clear();
    pendingStarts.clear();
  }

  return {
    start,
    checkpoint,
    finish,
    finishDeclared,
    reset,
    hasActiveAttempt: (gameSessionId: string) => attempts.has(gameSessionId),
    getActiveAttempt: (gameSessionId: string) => {
      const attempt = attempts.get(gameSessionId);
      return attempt ? publicAttempt(attempt) : null;
    },
  };
}

export type CompetitionAttemptCoordinator = ReturnType<typeof createCompetitionAttemptCoordinator>;
