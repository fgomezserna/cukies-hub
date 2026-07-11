import { invalidSnapshot } from './errors';
import type { MatchPlayer, MatchRules, PlayerLifecycle, PlayerSnapshot } from './types';

const SNAPSHOT_FIELDS = new Set(['seq', 'score', 'hearts', 'elapsedMs', 'lifecycle']);
const LIFECYCLES = new Set<PlayerLifecycle>([
  'waiting',
  'ready',
  'playing',
  'eliminated',
  'finished',
]);

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

  const elapsedDelta = elapsedMs - previous.elapsedMs;
  const windows = Math.max(1, Math.ceil(elapsedDelta / rules.scoreDeltaWindowMs));
  const maxScoreDelta = windows * rules.maxScoreDeltaPerWindow;
  if (Math.abs(score - previous.score) > maxScoreDelta) {
    throw invalidSnapshot(
      `absolute score delta exceeds ${maxScoreDelta} for the reported elapsed window`,
    );
  }

  if (Math.abs(hearts - previous.hearts) > rules.maxHeartsDelta) {
    throw invalidSnapshot(`hearts delta exceeds ${rules.maxHeartsDelta}`);
  }

  return {
    seq,
    score,
    hearts,
    elapsedMs,
    lifecycle: record.lifecycle as PlayerLifecycle,
  };
}

export function applyPlayerSnapshot(
  player: MatchPlayer,
  input: unknown,
  rules: MatchRules,
): MatchPlayer {
  return {
    ...player,
    snapshot: validatePlayerSnapshot(input, player.snapshot, rules),
  };
}
