const START_SESSION_ENDPOINT = '/api/games/start-session';
const STORAGE_KEY_PREFIX = 'cukies:treasure-hunt:parent-session:v1:';
const SESSION_ID_PATTERN = /^game_[0-9a-f]{64}$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const MAX_STORED_OWNER_ENTRIES = 16;
const MAX_STORED_STATE_BYTES = 32_768;

export interface ReloadSafeParentGameSession {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly gameId: string;
  readonly gameVersion: string;
}

interface StoredParentGameSession {
  readonly ownerKey: string;
  readonly sessionId?: string;
  readonly idempotencyKey?: string;
}

interface StoredParentGameSessionCollection {
  readonly entries: readonly StoredParentGameSession[];
  readonly writable: boolean;
}

interface ReloadSafeGameSessionStarterOptions {
  readonly gameId: string;
  readonly gameVersion: string;
  readonly fetchImpl?: typeof fetch;
  readonly storage?: Storage;
  readonly idempotencyKeyFactory?: () => string;
  readonly maxAttempts?: number;
  readonly retryDelayMs?: number;
}

class GameSessionStartError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'GameSessionStartError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function createIdempotencyKey() {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) throw new Error('Web Crypto is required to start a game session');
  if (typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return Array.from(cryptoApi.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
}

function abortError() {
  return new DOMException('Game session start was cancelled', 'AbortError');
}

function storageKey(gameId: string) {
  return `${STORAGE_KEY_PREFIX}${gameId}`;
}

function parseStoredSession(value: unknown): StoredParentGameSession | null {
  if (
    !isRecord(value) ||
    typeof value.ownerKey !== 'string' ||
    value.ownerKey.length === 0 ||
    value.ownerKey.length > 256
  ) {
    return null;
  }
  const hasSessionId = typeof value.sessionId === 'string' && SESSION_ID_PATTERN.test(value.sessionId);
  const hasIdempotencyKey = typeof value.idempotencyKey === 'string' &&
    IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey);
  if (hasSessionId === hasIdempotencyKey) return null;
  return {
    ownerKey: value.ownerKey,
    ...(hasSessionId ? { sessionId: value.sessionId as string } : {}),
    ...(hasIdempotencyKey ? { idempotencyKey: value.idempotencyKey as string } : {}),
  };
}

function readStoredSessions(
  storage: Storage | null,
  gameId: string,
): StoredParentGameSessionCollection {
  if (!storage) return { entries: [], writable: false };
  try {
    const serialized = storage.getItem(storageKey(gameId));
    if (!serialized) return { entries: [], writable: true };
    if (serialized.length > MAX_STORED_STATE_BYTES) {
      return { entries: [], writable: false };
    }
    const value: unknown = JSON.parse(serialized);
    const candidates = Array.isArray(value) ? value : [value];
    const byOwner = new Map<string, StoredParentGameSession>();
    for (const candidate of candidates) {
      const parsed = parseStoredSession(candidate);
      if (parsed) byOwner.set(parsed.ownerKey, parsed);
    }
    const entries = [...byOwner.values()];
    if (entries.length > MAX_STORED_OWNER_ENTRIES) {
      // Never truncate valid entries belonging to other wallets. Refuse writes
      // until the state can be reconciled explicitly.
      return { entries: [], writable: false };
    }
    if (entries.length === 0) {
      storage.removeItem(storageKey(gameId));
      return { entries: [], writable: true };
    }
    return { entries, writable: true };
  } catch {
    try {
      // Unparseable state cannot contain recoverable validated owner entries.
      // Clear it so a new durable request key can be established.
      storage.removeItem(storageKey(gameId));
      return { entries: [], writable: true };
    } catch {
      return { entries: [], writable: false };
    }
  }
}

function writeStoredEntry(
  storage: Storage | null,
  gameId: string,
  value: StoredParentGameSession,
) {
  if (!storage || !parseStoredSession(value)) return false;
  try {
    const collection = readStoredSessions(storage, gameId);
    if (!collection.writable) return false;
    const remaining = collection.entries.filter(
      (session) => session.ownerKey !== value.ownerKey,
    );
    if (remaining.length >= MAX_STORED_OWNER_ENTRIES) return false;
    storage.setItem(storageKey(gameId), JSON.stringify([...remaining, value]));
    return true;
  } catch {
    return false;
  }
}

function writeStoredSession(
  storage: Storage | null,
  gameId: string,
  value: { readonly ownerKey: string; readonly sessionId: string },
) {
  if (!SESSION_ID_PATTERN.test(value.sessionId)) return false;
  return writeStoredEntry(storage, gameId, value);
}

function writeStoredIdempotencyKey(
  storage: Storage | null,
  gameId: string,
  value: { readonly ownerKey: string; readonly idempotencyKey: string },
) {
  if (!IDEMPOTENCY_KEY_PATTERN.test(value.idempotencyKey)) return false;
  return writeStoredEntry(storage, gameId, value);
}

function removeStoredEntry(
  storage: Storage | null,
  gameId: string,
  predicate: (entry: StoredParentGameSession) => boolean,
) {
  if (!storage) return false;
  try {
    const collection = readStoredSessions(storage, gameId);
    if (!collection.writable) return false;
    const remaining = collection.entries.filter((entry) => !predicate(entry));
    if (remaining.length === collection.entries.length) return false;
    if (remaining.length === 0) storage.removeItem(storageKey(gameId));
    else storage.setItem(storageKey(gameId), JSON.stringify(remaining));
    return true;
  } catch {
    return false;
  }
}

function removeStoredSession(storage: Storage | null, gameId: string, expectedSessionId?: string) {
  if (!expectedSessionId) return false;
  return removeStoredEntry(
    storage,
    gameId,
    (entry) => entry.sessionId === expectedSessionId,
  );
}

function removeStoredIdempotencyKey(
  storage: Storage | null,
  gameId: string,
  ownerKey: string,
  expectedIdempotencyKey: string,
) {
  return removeStoredEntry(
    storage,
    gameId,
    (entry) => entry.ownerKey === ownerKey && entry.idempotencyKey === expectedIdempotencyKey,
  );
}

async function readSessionResponse(response: Response): Promise<ReloadSafeParentGameSession> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new GameSessionStartError('INVALID_RESPONSE', response.status || 502, 'Invalid game session response');
  }
  if (!isRecord(value) || response.ok !== true || value.success !== true) {
    const code = isRecord(value) && typeof value.error === 'string'
      ? value.error
      : 'REQUEST_FAILED';
    throw new GameSessionStartError(code, response.status || 500, 'Game session could not be started');
  }
  if (
    typeof value.sessionId !== 'string' ||
    typeof value.sessionToken !== 'string' ||
    typeof value.gameId !== 'string' ||
    typeof value.gameVersion !== 'string'
  ) {
    throw new GameSessionStartError('INVALID_RESPONSE', 502, 'Invalid game session response');
  }
  return {
    sessionId: value.sessionId,
    sessionToken: value.sessionToken,
    gameId: value.gameId,
    gameVersion: value.gameVersion,
  };
}

function waitForRetry(delayMs: number, signal: AbortSignal) {
  if (signal.aborted) return Promise.reject(abortError());
  if (delayMs === 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(abortError());
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Keeps only an opaque GameSession id or a pending idempotency key in
 * sessionStorage. The bearer is recovered from the authenticated start-session
 * endpoint and always remains in memory.
 */
export function createReloadSafeGameSessionStarter(
  options: ReloadSafeGameSessionStarterOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const storage = options.storage ?? (
    typeof window === 'undefined' ? null : window.sessionStorage
  );
  const idempotencyKeyFactory = options.idempotencyKeyFactory ?? createIdempotencyKey;
  const maxAttempts = options.maxAttempts ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 100;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 5) {
    throw new TypeError('maxAttempts must be an integer between 1 and 5');
  }
  if (!Number.isFinite(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 10_000) {
    throw new TypeError('retryDelayMs must be between 0 and 10000');
  }

  let generation = 0;
  let cached: { ownerKey: string; session: ReloadSafeParentGameSession } | null = null;
  let inFlight: {
    ownerKey: string;
    generation: number;
    controller: AbortController;
    promise: Promise<ReloadSafeParentGameSession>;
  } | null = null;

  const reset = () => {
    generation += 1;
    cached = null;
    inFlight?.controller.abort();
    inFlight = null;
  };

  const forget = (expectedSessionId?: string) => {
    removeStoredSession(storage, options.gameId, expectedSessionId);
    reset();
  };

  const assertCurrent = (runGeneration: number, controller: AbortController) => {
    if (controller.signal.aborted || generation !== runGeneration) throw abortError();
  };

  const requestSession = async (
    body: string,
    controller: AbortController,
    runGeneration: number,
  ) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await fetchImpl(START_SESSION_ENDPOINT, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body,
          signal: controller.signal,
        });
        const session = await readSessionResponse(response);
        assertCurrent(runGeneration, controller);
        return session;
      } catch (error) {
        assertCurrent(runGeneration, controller);
        lastError = error;
        const retryable = !(error instanceof GameSessionStartError) || error.status >= 500;
        if (!retryable || attempt >= maxAttempts) throw error;
        await waitForRetry(retryDelayMs, controller.signal);
        assertCurrent(runGeneration, controller);
      }
    }
    throw lastError ?? new GameSessionStartError('REQUEST_FAILED', 0, 'Game session could not be started');
  };

  const createAndPersistIdempotencyKey = (ownerKey: string) => {
    let idempotencyKey: string;
    try {
      idempotencyKey = idempotencyKeyFactory();
    } catch {
      throw new GameSessionStartError(
        'IDEMPOTENCY_UNAVAILABLE',
        500,
        'Game session request key is unavailable',
      );
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      throw new GameSessionStartError(
        'INVALID_IDEMPOTENCY_KEY',
        500,
        'Game session request key is invalid',
      );
    }
    if (!writeStoredIdempotencyKey(storage, options.gameId, { ownerKey, idempotencyKey })) {
      throw new GameSessionStartError(
        'IDEMPOTENCY_PERSIST_FAILED',
        500,
        'Game session request key could not be persisted',
      );
    }
    return idempotencyKey;
  };

  const requestCreatedSession = async (
    ownerKey: string,
    idempotencyKey: string,
    controller: AbortController,
    runGeneration: number,
  ) => {
    try {
      return await requestSession(JSON.stringify({
        gameId: options.gameId,
        gameVersion: options.gameVersion,
        idempotencyKey,
      }), controller, runGeneration);
    } catch (error) {
      if (
        error instanceof GameSessionStartError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        // A definitive client response means no ambiguous server write remains.
        // Rotate only this owner's exact pending key on the next start.
        removeStoredIdempotencyKey(storage, options.gameId, ownerKey, idempotencyKey);
      }
      throw error;
    }
  };

  return {
    start(ownerKeyInput: string) {
      const ownerKey = ownerKeyInput.trim();
      if (!ownerKey) {
        return Promise.reject(new GameSessionStartError('INVALID_OWNER', 400, 'Game session owner is required'));
      }
      if (cached?.ownerKey === ownerKey) return Promise.resolve(cached.session);
      if (inFlight) {
        if (inFlight.ownerKey === ownerKey) return inFlight.promise;
        reset();
      } else if (cached) {
        reset();
      }

      const runGeneration = ++generation;
      const controller = new AbortController();
      const storedCollection = readStoredSessions(storage, options.gameId);
      if (!storedCollection.writable) {
        return Promise.reject(new GameSessionStartError(
          'SESSION_STATE_UNAVAILABLE',
          500,
          'Reload-safe game session state is unavailable',
        ));
      }
      const stored = storedCollection.entries.find(
        (entry) => entry.ownerKey === ownerKey,
      ) ?? null;
      const resumeSessionId = stored?.sessionId ?? null;
      let idempotencyKey = stored?.idempotencyKey ?? null;
      if (!resumeSessionId && !idempotencyKey) {
        try {
          idempotencyKey = createAndPersistIdempotencyKey(ownerKey);
        } catch (error) {
          return Promise.reject(error);
        }
      }

      const request = (async () => {
        await Promise.resolve();
        assertCurrent(runGeneration, controller);

        let session: ReloadSafeParentGameSession;
        if (resumeSessionId) {
          try {
            session = await requestSession(JSON.stringify({
              gameId: options.gameId,
              gameVersion: options.gameVersion,
              resumeSessionId,
            }), controller, runGeneration);
          } catch (error) {
            if (!(error instanceof GameSessionStartError) || ![404, 409].includes(error.status)) {
              throw error;
            }
            idempotencyKey = createAndPersistIdempotencyKey(ownerKey);
            session = await requestCreatedSession(
              ownerKey,
              idempotencyKey,
              controller,
              runGeneration,
            );
          }
        } else {
          if (!idempotencyKey) {
            throw new GameSessionStartError(
              'IDEMPOTENCY_UNAVAILABLE',
              500,
              'Game session request key is unavailable',
            );
          }
          session = await requestCreatedSession(
            ownerKey,
            idempotencyKey,
            controller,
            runGeneration,
          );
        }

        assertCurrent(runGeneration, controller);
        writeStoredSession(storage, options.gameId, { ownerKey, sessionId: session.sessionId });
        return session;
      })();

      let trackedPromise: Promise<ReloadSafeParentGameSession>;
      trackedPromise = request.then((session) => {
        assertCurrent(runGeneration, controller);
        cached = { ownerKey, session };
        return session;
      }).finally(() => {
        if (inFlight?.generation === runGeneration) inFlight = null;
      });
      inFlight = { ownerKey, generation: runGeneration, controller, promise: trackedPromise };
      return trackedPromise;
    },
    reset,
    forget,
  };
}
