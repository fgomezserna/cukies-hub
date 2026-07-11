import { resolveConfiguredParentOrigin } from './parent-origin';

const REQUEST_TYPE = 'TH_MULTIPLAYER_REQUEST' as const;
const RESPONSE_TYPE = 'TH_MULTIPLAYER_RESPONSE' as const;

export type MultiplayerCommand = 'join' | 'get' | 'heartbeat' | 'snapshot' | 'reset';
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
export type MatchResultReason =
  | 'score_difference'
  | 'elimination'
  | 'sudden_death'
  | 'forfeit'
  | 'draw'
  | 'abandoned';

export interface PlayerSnapshotPayload {
  readonly seq: number;
  readonly score: number;
  readonly hearts: number;
  readonly elapsedMs: number;
  readonly lifecycle: PlayerLifecycle;
}

export interface LocalSnapshotInput {
  readonly score: number;
  readonly hearts: number;
  readonly lifecycle: PlayerLifecycle;
}

export interface CanonicalRuntimeHydration {
  readonly score: number;
  readonly hearts: number;
  readonly elapsedMs: number;
  readonly lifecycle: PlayerLifecycle;
}

export function deriveMultiplayerRuntimeHydration(
  canonical: CanonicalRuntimeHydration,
  now: number,
  durationSeconds: number,
) {
  const elapsedMs = Math.max(0, Math.floor(canonical.elapsedMs));
  const terminal = canonical.lifecycle === 'eliminated' || canonical.lifecycle === 'finished';
  return {
    status: terminal ? 'gameOver' as const : 'playing' as const,
    score: Math.max(0, Math.floor(canonical.score)),
    hearts: Math.max(0, Math.floor(canonical.hearts)),
    elapsedMs,
    gameStartTime: now - elapsedMs,
    timer: Math.max(0, durationSeconds - elapsedMs / 1_000),
    gameOverReason: terminal ? 'multiplayer' as const : undefined,
  };
}

export interface PublicMatchPlayer {
  readonly playerId: string;
  readonly slot: 0 | 1;
  readonly seq: number;
  readonly score: number;
  readonly hearts: number;
  readonly elapsedMs: number;
  readonly lifecycle: PlayerLifecycle;
  readonly presence: PlayerPresence;
  readonly reconnectBudgetRemainingMs: number;
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

export interface PublicMatch {
  readonly matchId: string;
  readonly roomCode: string;
  readonly gameId: 'treasure-hunt';
  readonly mode: 'staging_unranked';
  readonly rewardEligible: false;
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
  };
  readonly players: readonly PublicMatchPlayer[];
  readonly suddenDeath: SuddenDeathState | null;
  readonly result: MatchResult | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface JoinResponse {
  readonly playerId: string;
  readonly slot: 0 | 1;
  readonly match: PublicMatch;
  readonly inviteUrl: string;
}

export interface MatchResponse {
  readonly match: PublicMatch;
}

export interface MultiplayerTransport {
  join(roomCode: string): Promise<JoinResponse>;
  get(): Promise<MatchResponse>;
  heartbeat(): Promise<MatchResponse>;
  snapshot(snapshot: PlayerSnapshotPayload): Promise<MatchResponse>;
  reset(): Promise<void>;
  cancelPending?(): void;
  cleanup(): void;
}

export class MultiplayerClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'MultiplayerClientError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

const MATCH_STATUSES = new Set<MatchStatus>([
  'waiting',
  'countdown',
  'running',
  'paused_reconnect',
  'sudden_death',
  'finished',
  'abandoned',
]);
const PLAYER_LIFECYCLES = new Set<PlayerLifecycle>([
  'waiting',
  'ready',
  'playing',
  'eliminated',
  'finished',
]);
const PLAYER_PRESENCES = new Set<PlayerPresence>(['online', 'offline', 'forfeited']);

function isTimestampOrNull(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
}

function isPublicMatchPayload(value: unknown): value is PublicMatch {
  if (!isRecord(value) || !isRecord(value.config) || !Array.isArray(value.players)) return false;
  return (
    typeof value.matchId === 'string' &&
    typeof value.roomCode === 'string' &&
    value.gameId === 'treasure-hunt' &&
    value.mode === 'staging_unranked' &&
    value.rewardEligible === false &&
    Number.isSafeInteger(value.revision) && (value.revision as number) >= 0 &&
    typeof value.status === 'string' &&
    MATCH_STATUSES.has(value.status as MatchStatus) &&
    (value.config.seed === null || typeof value.config.seed === 'string') &&
    isTimestampOrNull(value.config.startAt) &&
    Number.isSafeInteger(value.config.lobbyExpiresAt) &&
    (value.config.lobbyExpiresAt as number) >= 0 &&
    isTimestampOrNull(value.config.roundEndsAt) &&
    isTimestampOrNull(value.config.suddenDeathEndsAt) &&
    isTimestampOrNull(value.config.resumeAt) &&
    value.players.every(
      (player) =>
        isRecord(player) &&
        typeof player.playerId === 'string' &&
        (player.slot === 0 || player.slot === 1) &&
        Number.isSafeInteger(player.seq) &&
        ((player.seq as number) === -1 || (player.seq as number) >= 0) &&
        Number.isSafeInteger(player.score) && (player.score as number) >= 0 &&
        Number.isSafeInteger(player.hearts) && (player.hearts as number) >= 0 &&
        Number.isSafeInteger(player.elapsedMs) && (player.elapsedMs as number) >= 0 &&
        typeof player.lifecycle === 'string' &&
        PLAYER_LIFECYCLES.has(player.lifecycle as PlayerLifecycle) &&
        typeof player.presence === 'string' &&
        PLAYER_PRESENCES.has(player.presence as PlayerPresence) &&
        Number.isSafeInteger(player.reconnectBudgetRemainingMs) &&
        (player.reconnectBudgetRemainingMs as number) >= 0,
    )
  );
}

export function resolveParentOrigin(
  referrer: string,
  dappOrigin?: string,
  parentUrl: string | undefined = process.env.NEXT_PUBLIC_PARENT_URL,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): string {
  try {
    return resolveConfiguredParentOrigin(
      referrer,
      dappOrigin,
      parentUrl,
      nodeEnv,
    );
  } catch {
    throw new MultiplayerClientError(
      'PARENT_ORIGIN_UNAVAILABLE',
      'No se pudo determinar el origen seguro del hub',
    );
  }
}

function defaultRequestIdFactory(cryptoApi: Crypto): string {
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (typeof cryptoApi.getRandomValues !== 'function') {
    throw new MultiplayerClientError(
      'CRYPTO_UNAVAILABLE',
      'El navegador no ofrece generación criptográfica segura',
    );
  }
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function publicResponseError(value: unknown): MultiplayerClientError {
  const error = isRecord(value) ? value : null;
  const code =
    error && typeof error.code === 'string' && /^[A-Z0-9_]{1,64}$/.test(error.code)
      ? error.code
      : 'REQUEST_FAILED';
  const retryable = error?.retryable === true;
  const httpStatus = error && Number.isSafeInteger(error.httpStatus)
    ? error.httpStatus as number
    : undefined;
  return new MultiplayerClientError(
    code,
    'No se pudo completar la solicitud multiplayer',
    retryable,
    httpStatus,
  );
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: MultiplayerClientError) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

export interface ParentTransportOptions {
  readonly windowObject?: Window;
  readonly referrer?: string;
  readonly fallbackOrigin?: string;
  readonly parentUrl?: string;
  readonly nodeEnv?: string;
  readonly cryptoApi?: Crypto;
  readonly requestIdFactory?: () => string;
  readonly clientId?: string;
  readonly timeoutMs?: number;
}

export function createTreasureHuntParentTransport(
  options: ParentTransportOptions = {},
): MultiplayerTransport {
  const windowObject = options.windowObject ?? window;
  const parentOrigin = (() => {
      try {
        return resolveConfiguredParentOrigin(
          options.referrer ?? windowObject.document.referrer,
          options.fallbackOrigin ?? process.env.NEXT_PUBLIC_DAPP_ORIGIN,
          options.parentUrl ?? process.env.NEXT_PUBLIC_PARENT_URL,
          options.nodeEnv ?? process.env.NODE_ENV,
        );
      } catch {
        throw new MultiplayerClientError(
          'PARENT_ORIGIN_UNAVAILABLE',
          'No se pudo determinar el origen seguro del hub',
        );
      }
    })();
  const cryptoApi = options.cryptoApi ?? windowObject.crypto;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const pending = new Map<string, PendingRequest>();
  const clientId = options.clientId ?? defaultRequestIdFactory(cryptoApi);
  if (clientId.length === 0 || clientId.length > 128) {
    throw new MultiplayerClientError('INVALID_CLIENT_ID', 'El cliente multiplayer no es válido');
  }
  let closed = false;

  const nextRequestId = (): string => {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const value = options.requestIdFactory
        ? options.requestIdFactory()
        : defaultRequestIdFactory(cryptoApi);
      if (value.length > 0 && value.length <= 128 && !pending.has(value)) return value;
    }
    throw new MultiplayerClientError(
      'DUPLICATE_REQUEST_ID',
      'No se pudo generar un identificador de solicitud único',
    );
  };

  const handleMessage = (event: MessageEvent) => {
    if (event.source !== windowObject.parent || event.origin !== parentOrigin) return;
    const response = event.data;
    if (!isRecord(response) || response.type !== RESPONSE_TYPE || typeof response.requestId !== 'string') {
      return;
    }
    const request = pending.get(response.requestId);
    if (!request) return;
    pending.delete(response.requestId);
    clearTimeout(request.timeout);
    if (response.success === true) {
      request.resolve(response.data);
    } else {
      request.reject(publicResponseError(response.error));
    }
  };

  windowObject.addEventListener('message', handleMessage);

  const request = <T>(command: MultiplayerCommand, payload: Record<string, unknown>): Promise<T> => {
    if (closed) {
      return Promise.reject(
        new MultiplayerClientError('CLIENT_CLOSED', 'El cliente multiplayer está cerrado'),
      );
    }
    const requestId = nextRequestId();
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(
          new MultiplayerClientError(
            'REQUEST_TIMEOUT',
            'La solicitud multiplayer ha agotado el tiempo de espera',
            true,
          ),
        );
      }, timeoutMs);
      pending.set(requestId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });
      try {
        windowObject.parent.postMessage(
          { type: REQUEST_TYPE, clientId, requestId, command, payload },
          parentOrigin,
        );
      } catch {
        clearTimeout(timeout);
        pending.delete(requestId);
        reject(
          new MultiplayerClientError(
            'REQUEST_FAILED',
            'No se pudo completar la solicitud multiplayer',
            true,
          ),
        );
      }
    });
  };

  const rejectPending = (code: 'REQUEST_CANCELLED' | 'CLIENT_CLOSED') => {
    for (const request of pending.values()) {
      clearTimeout(request.timeout);
      request.reject(
        new MultiplayerClientError(
          code,
          code === 'CLIENT_CLOSED'
            ? 'El cliente multiplayer está cerrado'
            : 'La solicitud multiplayer fue cancelada',
        ),
      );
    }
    pending.clear();
  };

  return {
    join: (roomCode) => request<JoinResponse>('join', { roomCode }),
    get: () => request<MatchResponse>('get', {}),
    heartbeat: () => request<MatchResponse>('heartbeat', {}),
    snapshot: (snapshot) =>
      request<MatchResponse>('snapshot', {
        snapshot: {
          seq: snapshot.seq,
          score: snapshot.score,
          hearts: snapshot.hearts,
          elapsedMs: snapshot.elapsedMs,
          lifecycle: snapshot.lifecycle,
        },
      }),
    reset: async () => {
      await request<{ readonly reset: true }>('reset', {});
    },
    cancelPending: () => rejectPending('REQUEST_CANCELLED'),
    cleanup: () => {
      if (closed) return;
      closed = true;
      windowObject.removeEventListener('message', handleMessage);
      rejectPending('CLIENT_CLOSED');
    },
  };
}

export interface MultiplayerControllerState {
  readonly playerId: string | null;
  readonly slot: 0 | 1 | null;
  readonly roomCode: string | null;
  readonly inviteUrl: string | null;
  readonly match: PublicMatch | null;
  readonly error: string | null;
  readonly joining: boolean;
  readonly startSignal: number;
  readonly resumeSignal: number;
}

export interface MultiplayerControllerOptions {
  readonly transport: MultiplayerTransport;
  readonly enabled?: boolean;
  readonly now?: () => number;
  readonly onState?: (state: MultiplayerControllerState) => void;
  readonly onSeed?: (seed: string) => void;
  readonly pollIntervalMs?: number;
  readonly heartbeatIntervalMs?: number;
  readonly snapshotThrottleMs?: number;
  readonly maxBackoffMs?: number;
  readonly retryJitter?: () => number;
}

const INITIAL_CONTROLLER_STATE: MultiplayerControllerState = {
  playerId: null,
  slot: null,
  roomCode: null,
  inviteUrl: null,
  match: null,
  error: null,
  joining: false,
  startSignal: 0,
  resumeSignal: 0,
};

function validRoomCode(value: string): string {
  const roomCode = value.trim();
  if (roomCode.length === 0 || roomCode.length > 128) {
    throw new MultiplayerClientError('INVALID_ROOM', 'El código de sala no es válido');
  }
  return roomCode;
}

function isTerminal(status: MatchStatus): boolean {
  return status === 'finished' || status === 'abandoned';
}

function isActive(status: MatchStatus): boolean {
  return status === 'running' || status === 'sudden_death';
}

function publicControllerError(error: unknown): string {
  if (error instanceof MultiplayerClientError) return error.message;
  return 'No se pudo sincronizar la partida multiplayer';
}

export class TreasureHuntMultiplayerController {
  private state: MultiplayerControllerState = INITIAL_CONTROLLER_STATE;
  private generation = 0;
  private disposed = false;
  private joinPromise: Promise<void> | null = null;
  private resetPromise: Promise<void> | null = null;
  private joinedRoom: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  private pollFlight: symbol | null = null;
  private heartbeatFlight: symbol | null = null;
  private snapshotFlight: symbol | null = null;
  private pollFailures = 0;
  private heartbeatFailures = 0;
  private snapshotSequence = 0;
  private lastSnapshotAt = Number.NEGATIVE_INFINITY;
  private lastElapsedMs = 0;
  private lastSnapshotHash: string | null = null;
  private pendingSnapshot: LocalSnapshotInput | null = null;
  private seed: string | null = null;
  private seedApplied = false;
  private hasStarted = false;
  private lastResumeAtSignaled: number | null = null;
  private lastPresenceWriteAt = Number.NEGATIVE_INFINITY;

  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly snapshotThrottleMs: number;
  private readonly maxBackoffMs: number;
  private readonly retryJitter: () => number;

  constructor(private readonly options: MultiplayerControllerOptions) {
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = Math.min(750, Math.max(250, options.pollIntervalMs ?? 700));
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 2_000;
    this.snapshotThrottleMs = options.snapshotThrottleMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 4_000;
    this.retryJitter = options.retryJitter ?? Math.random;
  }

  getState(): MultiplayerControllerState {
    return this.state;
  }

  private emit(patch: Partial<MultiplayerControllerState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onState?.(this.state);
  }

  async join(rawRoomCode: string): Promise<void> {
    if (this.options.enabled === false) {
      throw new MultiplayerClientError(
        'FEATURE_DISABLED',
        'El modo multiplayer no está habilitado',
      );
    }
    const pendingReset = this.resetPromise;
    if (pendingReset) await pendingReset;
    if (this.disposed) {
      throw new MultiplayerClientError('CLIENT_CLOSED', 'El cliente multiplayer está cerrado');
    }
    const roomCode = validRoomCode(rawRoomCode);
    if (this.joinedRoom === roomCode && this.state.playerId) return;
    if (this.joinPromise && this.joinedRoom === roomCode) return this.joinPromise;
    if (this.joinedRoom && this.joinedRoom !== roomCode) {
      throw new MultiplayerClientError('MATCH_PINNED', 'El cliente ya está unido a otra sala');
    }

    this.joinedRoom = roomCode;
    const generation = this.generation;
    this.emit({ roomCode, joining: true, error: null });
    this.joinPromise = this.options.transport
      .join(roomCode)
      .then((response) => {
        if (this.generation !== generation || this.disposed) return;
        if (
          typeof response.playerId !== 'string' ||
          (response.slot !== 0 && response.slot !== 1) ||
          typeof response.inviteUrl !== 'string' ||
          !isPublicMatchPayload(response.match)
        ) {
          throw new MultiplayerClientError('INVALID_RESPONSE', 'La respuesta multiplayer no es válida');
        }
        this.emit({
          playerId: response.playerId,
          slot: response.slot,
          roomCode: response.match.roomCode,
          inviteUrl: response.inviteUrl,
          joining: false,
          error: null,
        });
        this.applyServerMatch(response.match);
        this.lastPresenceWriteAt = this.now();
        if (!this.isCurrentMatchTerminal()) {
          this.schedulePoll(this.pollIntervalMs, generation);
          this.scheduleHeartbeat(this.heartbeatIntervalMs, generation);
        }
      })
      .catch((error) => {
        if (this.generation === generation && !this.disposed) {
          this.emit({ joining: false, error: publicControllerError(error) });
        }
        throw error;
      })
      .finally(() => {
        if (this.generation === generation) this.joinPromise = null;
      });
    return this.joinPromise;
  }

  applyServerMatch(incoming: PublicMatch): boolean {
    if (!isPublicMatchPayload(incoming)) return false;
    const previous = this.state.match;
    if (previous && incoming.revision < previous.revision) return false;

    let next = incoming;
    const incomingSeed = incoming.config.seed;
    if (!this.seed && incomingSeed) this.seed = incomingSeed;
    if (this.seed && incomingSeed && incomingSeed !== this.seed) {
      next = { ...incoming, config: { ...incoming.config, seed: this.seed } };
    }

    const localPlayer = this.state.playerId
      ? next.players.find((player) => player.playerId === this.state.playerId)
      : undefined;
    if (localPlayer) {
      this.snapshotSequence = Math.max(this.snapshotSequence, localPlayer.seq);
      this.lastElapsedMs = Math.max(this.lastElapsedMs, localPlayer.elapsedMs);
      this.lastSnapshotHash = JSON.stringify({
        score: localPlayer.score,
        hearts: localPlayer.hearts,
        lifecycle: localPlayer.lifecycle,
      });
    }

    let startSignal = this.state.startSignal;
    let resumeSignal = this.state.resumeSignal;
    if (isActive(next.status) && !this.hasStarted) {
      if (!this.seed) {
        this.emit({ error: 'La partida no tiene una semilla compartida válida' });
        return false;
      }
      if (!this.seedApplied) {
        this.options.onSeed?.(this.seed);
        this.seedApplied = true;
      }
      this.hasStarted = true;
      this.lastResumeAtSignaled = next.config.resumeAt;
      startSignal += 1;
    } else if (
      isActive(next.status) &&
      this.hasStarted &&
      (next.config.resumeAt ?? previous?.config.resumeAt) !== null &&
      (next.config.resumeAt ?? previous?.config.resumeAt) !== this.lastResumeAtSignaled &&
      (
        previous?.status === 'paused_reconnect' ||
        previous?.status === 'countdown' ||
        previous?.config.resumeAt !== next.config.resumeAt
      )
    ) {
      this.lastResumeAtSignaled = next.config.resumeAt ?? previous?.config.resumeAt ?? null;
      resumeSignal += 1;
    }

    this.emit({ match: next, error: null, startSignal, resumeSignal });
    if (isTerminal(next.status)) this.stopScheduledWork();
    return true;
  }

  publishSnapshot(input: LocalSnapshotInput): void {
    const status = this.state.match?.status;
    if (!status || !isActive(status) || !this.state.playerId) return;
    // `finished` is a server-derived terminal state. The client may publish
    // its last score, but it must not be able to finish the canonical match.
    const lifecycle = input.lifecycle === 'finished' ? 'playing' : input.lifecycle;
    const normalized: LocalSnapshotInput = {
      score: Math.max(0, Math.floor(input.score)),
      hearts: Math.max(0, Math.floor(input.hearts)),
      lifecycle,
    };
    const hash = JSON.stringify(normalized);
    if (hash === this.lastSnapshotHash || hash === JSON.stringify(this.pendingSnapshot)) return;
    this.pendingSnapshot = normalized;
    this.scheduleSnapshot();
  }

  private scheduleSnapshot(delay?: number): void {
    if (this.snapshotTimer || this.snapshotFlight || !this.pendingSnapshot) return;
    const remaining = Math.max(
      0,
      this.snapshotThrottleMs - (this.now() - this.lastSnapshotAt),
    );
    if ((delay ?? remaining) === 0) {
      void this.flushSnapshot();
      return;
    }
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      void this.flushSnapshot();
    }, delay ?? remaining);
  }

  private async flushSnapshot(): Promise<void> {
    const source = this.pendingSnapshot;
    const match = this.state.match;
    if (!source || !match || !isActive(match.status) || match.config.startAt === null) return;
    const generation = this.generation;
    const flight = Symbol('snapshot');
    this.pendingSnapshot = null;
    this.snapshotFlight = flight;
    this.lastSnapshotAt = this.now();
    const elapsedMs = Math.max(
      this.lastElapsedMs,
      Math.max(0, Math.floor(this.now() - match.config.startAt)),
    );
    this.lastElapsedMs = elapsedMs;
    const snapshot: PlayerSnapshotPayload = {
      seq: ++this.snapshotSequence,
      score: source.score,
      hearts: source.hearts,
      elapsedMs,
      lifecycle: source.lifecycle,
    };
    try {
      const response = await this.options.transport.snapshot(snapshot);
      if (this.generation !== generation || this.disposed) return;
      this.lastPresenceWriteAt = this.now();
      this.lastSnapshotHash = JSON.stringify(source);
      this.applyServerMatch(response.match);
    } catch (error) {
      if (this.generation !== generation || this.disposed) return;
      if (
        (!(error instanceof MultiplayerClientError) || error.retryable) &&
        this.state.match &&
        isActive(this.state.match.status) &&
        !this.pendingSnapshot
      ) {
        this.pendingSnapshot = source;
      }
      this.emit({ error: publicControllerError(error) });
    } finally {
      if (this.snapshotFlight === flight) {
        this.snapshotFlight = null;
        if (this.pendingSnapshot) this.scheduleSnapshot(this.snapshotThrottleMs);
      }
    }
  }

  private schedulePoll(delay: number, generation: number): void {
    if (this.pollTimer || this.disposed || this.generation !== generation) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.runPoll(generation);
    }, delay);
  }

  private async runPoll(generation: number): Promise<void> {
    if (this.generation !== generation || this.disposed) return;
    if (this.pollFlight) {
      this.schedulePoll(this.pollIntervalMs, generation);
      return;
    }
    const flight = Symbol('poll');
    this.pollFlight = flight;
    let shouldRetry = true;
    try {
      const response = await this.options.transport.get();
      if (this.generation !== generation || this.disposed) return;
      this.pollFailures = 0;
      this.applyServerMatch(response.match);
    } catch (error) {
      if (this.generation !== generation || this.disposed) return;
      shouldRetry = !(error instanceof MultiplayerClientError) || error.retryable;
      this.pollFailures += 1;
      this.emit({ error: publicControllerError(error) });
      if (!shouldRetry) this.stopScheduledWork();
    } finally {
      if (
        this.pollFlight === flight &&
        this.generation === generation &&
        !this.disposed &&
        shouldRetry &&
        !this.isCurrentMatchTerminal()
      ) {
        this.pollFlight = null;
        const delay = this.retryDelay(this.pollIntervalMs, this.pollFailures);
        this.schedulePoll(delay, generation);
      } else if (this.pollFlight === flight) {
        this.pollFlight = null;
      }
    }
  }

  private scheduleHeartbeat(delay: number, generation: number): void {
    if (this.heartbeatTimer || this.disposed || this.generation !== generation) return;
    this.heartbeatTimer = setTimeout(() => {
      this.heartbeatTimer = null;
      void this.runHeartbeat(generation);
    }, delay);
  }

  private async runHeartbeat(generation: number): Promise<void> {
    if (this.generation !== generation || this.disposed) return;
    const presenceAge = this.now() - this.lastPresenceWriteAt;
    if (presenceAge >= 0 && presenceAge < this.heartbeatIntervalMs) {
      this.scheduleHeartbeat(this.heartbeatIntervalMs - presenceAge, generation);
      return;
    }
    if (this.heartbeatFlight) {
      this.scheduleHeartbeat(this.heartbeatIntervalMs, generation);
      return;
    }
    const flight = Symbol('heartbeat');
    this.heartbeatFlight = flight;
    let shouldRetry = true;
    try {
      const response = await this.options.transport.heartbeat();
      if (this.generation !== generation || this.disposed) return;
      this.lastPresenceWriteAt = this.now();
      this.heartbeatFailures = 0;
      this.applyServerMatch(response.match);
    } catch (error) {
      if (this.generation !== generation || this.disposed) return;
      shouldRetry = !(error instanceof MultiplayerClientError) || error.retryable;
      this.heartbeatFailures += 1;
      this.emit({ error: publicControllerError(error) });
      if (!shouldRetry) this.stopScheduledWork();
    } finally {
      if (
        this.heartbeatFlight === flight &&
        this.generation === generation &&
        !this.disposed &&
        shouldRetry &&
        !this.isCurrentMatchTerminal()
      ) {
        this.heartbeatFlight = null;
        const delay = this.retryDelay(this.heartbeatIntervalMs, this.heartbeatFailures);
        this.scheduleHeartbeat(delay, generation);
      } else if (this.heartbeatFlight === flight) {
        this.heartbeatFlight = null;
      }
    }
  }

  private isCurrentMatchTerminal(): boolean {
    return Boolean(this.state.match && isTerminal(this.state.match.status));
  }

  private retryDelay(baseDelay: number, failures: number): number {
    const exponential = Math.min(
      this.maxBackoffMs,
      baseDelay * Math.max(1, 2 ** failures),
    );
    const jitter = 0.85 + Math.min(1, Math.max(0, this.retryJitter())) * 0.3;
    return Math.min(this.maxBackoffMs, Math.max(baseDelay, Math.round(exponential * jitter)));
  }

  private stopScheduledWork(): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.pollTimer = null;
    this.heartbeatTimer = null;
    this.snapshotTimer = null;
    this.pendingSnapshot = null;
  }

  reset(): Promise<void> {
    if (this.state.match && !isTerminal(this.state.match.status)) {
      return Promise.reject(
        new MultiplayerClientError(
          'MATCH_ACTIVE',
          'Una partida multiplayer activa no se puede resetear localmente',
        ),
      );
    }
    if (this.resetPromise) return this.resetPromise;

    const generation = this.generation;
    let operation: Promise<void>;
    operation = Promise.resolve()
      .then(() => this.options.transport.reset())
      .then(() => {
        if (this.generation !== generation || this.disposed) return;

        this.generation += 1;
        this.stopScheduledWork();
        this.options.transport.cancelPending?.();
        this.joinPromise = null;
        this.joinedRoom = null;
        this.pollFlight = null;
        this.heartbeatFlight = null;
        this.snapshotFlight = null;
        this.pollFailures = 0;
        this.heartbeatFailures = 0;
        this.snapshotSequence = 0;
        this.lastSnapshotAt = Number.NEGATIVE_INFINITY;
        this.lastElapsedMs = 0;
        this.lastSnapshotHash = null;
        this.seed = null;
        this.seedApplied = false;
        this.hasStarted = false;
        this.lastResumeAtSignaled = null;
        this.lastPresenceWriteAt = Number.NEGATIVE_INFINITY;
        this.state = INITIAL_CONTROLLER_STATE;
        this.options.onState?.(this.state);
      })
      .finally(() => {
        if (this.resetPromise === operation) this.resetPromise = null;
      });
    this.resetPromise = operation;
    return operation;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.stopScheduledWork();
    this.pollFlight = null;
    this.heartbeatFlight = null;
    this.snapshotFlight = null;
    this.joinPromise = null;
    this.resetPromise = null;
    this.options.transport.cleanup();
  }
}

export function createMultiplayerRoomCode(cryptoApi: Crypto = globalThis.crypto): string {
  return `room-${defaultRequestIdFactory(cryptoApi)}`;
}

export function getHandshakeRoomCode(
  session: { readonly roomId?: unknown } | null,
  enabled = true,
): string | null {
  if (!enabled) return null;
  if (!session || typeof session.roomId !== 'string') return null;
  const roomCode = session.roomId.trim();
  return roomCode.length > 0 && roomCode.length <= 128 ? roomCode : null;
}
