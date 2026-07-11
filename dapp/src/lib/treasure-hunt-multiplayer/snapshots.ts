import { invalidSnapshot } from './errors';
import type { MatchPlayer, MatchRules, PlayerLifecycle, PlayerSnapshot } from './types';

const SNAPSHOT_FIELDS = new Set(['seq', 'score', 'hearts', 'elapsedMs', 'lifecycle']);
const LIFECYCLES = new Set<PlayerLifecycle>([
  'waiting',
  'ready',
  'playing',
  'eliminated',
]);

const ALLOWED_LIFECYCLE_TRANSITIONS: Readonly<Record<PlayerLifecycle, ReadonlySet<PlayerLifecycle>>> = {
  waiting: new Set(['waiting', 'ready', 'playing', 'eliminated']),
  ready: new Set(['ready', 'playing', 'eliminated']),
  playing: new Set(['playing', 'eliminated']),
  eliminated: new Set(['eliminated']),
  finished: new Set(['finished']),
};

export interface SnapshotValidationContext {
  readonly now: number;
  readonly startAt: number;
  readonly lastSnapshotAcceptedAt: number | null;
}

function requireSafeInteger(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw invalidSnapshot(`${field} must be a safe integer between ${minimum} and ${maximum}`);
  }

  return value as number;
}

export function validatePlayerSnapshot(
  input: unknown,
  previous: PlayerSnapshot,
  rules: MatchRules,
  context: SnapshotValidationContext,
): PlayerSnapshot {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw invalidSnapshot('snapshot must be an object');
  }

  const record = input as Record<string, unknown>;
  for (const field of Object.keys(record)) {
    if (!SNAPSHOT_FIELDS.has(field)) {
      throw invalidSnapshot(`snapshot field ${field} is not allowed`);
    }
  }

  for (const field of SNAPSHOT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(record, field)) {
      throw invalidSnapshot(`snapshot field ${field} is required`);
    }
  }

  const seq = requireSafeInteger(record.seq, 'seq', 0, Number.MAX_SAFE_INTEGER);
  const score = requireSafeInteger(record.score, 'score', 0, rules.maxScore);
  const hearts = requireSafeInteger(record.hearts, 'hearts', 0, rules.maxHearts);
  const elapsedMs = requireSafeInteger(record.elapsedMs, 'elapsedMs', 0, rules.maxElapsedMs);

  if (typeof record.lifecycle !== 'string' || !LIFECYCLES.has(record.lifecycle as PlayerLifecycle)) {
    throw invalidSnapshot('lifecycle is invalid');
  }

  if (seq <= previous.seq) {
    throw invalidSnapshot(`seq must be strictly greater than ${previous.seq}`);
  }

  if (elapsedMs < previous.elapsedMs) {
    throw invalidSnapshot('elapsedMs cannot decrease');
  }

  const lifecycle = record.lifecycle as PlayerLifecycle;
  if (previous.lifecycle === 'eliminated' || previous.lifecycle === 'finished') {
    throw invalidSnapshot(`lifecycle ${previous.lifecycle} is terminal`);
  }
  if (!ALLOWED_LIFECYCLE_TRANSITIONS[previous.lifecycle].has(lifecycle)) {
    throw invalidSnapshot(`lifecycle cannot transition from ${previous.lifecycle} to ${lifecycle}`);
  }

  if ((lifecycle === 'eliminated') !== (hearts === 0)) {
    throw invalidSnapshot('eliminated lifecycle requires exactly zero hearts and vice versa');
  }

  const serverElapsedSinceStart = Math.max(0, context.now - context.startAt);
  const maxPlausibleElapsed = Math.min(
    rules.maxElapsedMs,
    serverElapsedSinceStart + rules.snapshotTimeToleranceMs,
  );
  if (elapsedMs > maxPlausibleElapsed) {
    throw invalidSnapshot(`elapsedMs exceeds server clock allowance ${maxPlausibleElapsed}`);
  }

  const serverElapsedSinceAcceptance = Math.max(
    0,
    context.now - (context.lastSnapshotAcceptedAt ?? context.startAt),
  );
  const maxScoreDelta = Math.floor(
    (serverElapsedSinceAcceptance * rules.maxScoreDeltaPerWindow) /
      rules.scoreDeltaWindowMs,
  );
  if (Math.abs(score - previous.score) > maxScoreDelta) {
    throw invalidSnapshot(
      `absolute score delta exceeds ${maxScoreDelta} for the reported elapsed window`,
    );
  }

  const maxPlausibleScore = Math.min(
    rules.maxScore,
    Math.floor(
      (serverElapsedSinceStart * rules.maxScoreDeltaPerWindow) /
        rules.scoreDeltaWindowMs,
    ),
  );
  if (score > maxPlausibleScore) {
    throw invalidSnapshot(`score exceeds server clock allowance ${maxPlausibleScore}`);
  }

  if (Math.abs(hearts - previous.hearts) > rules.maxHeartsDelta) {
    throw invalidSnapshot(`hearts delta exceeds ${rules.maxHeartsDelta}`);
  }

  return {
    seq,
    score,
    hearts,
    elapsedMs,
    lifecycle,
  };
}

export function applyPlayerSnapshot(
  player: MatchPlayer,
  input: unknown,
  rules: MatchRules,
  context: Omit<SnapshotValidationContext, 'lastSnapshotAcceptedAt'>,
): MatchPlayer {
  return {
    ...player,
    snapshot: validatePlayerSnapshot(input, player.snapshot, rules, {
      ...context,
      lastSnapshotAcceptedAt: player.lastSnapshotAcceptedAt,
    }),
    lastSnapshotAcceptedAt: context.now,
  };
}
