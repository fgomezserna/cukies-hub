import type { MatchRules } from './types';

export const ABSOLUTE_MAX_HEARTS = 10;

export const DEFAULT_MATCH_RULES: MatchRules = Object.freeze({
  winDelta: 500,
  initialCountdownMs: 3_000,
  lobbyTimeoutMs: 30_000,
  roundDurationMs: 30_000,
  suddenDeathTimeoutMs: 60_000,
  terminalRetentionMs: 7 * 24 * 60 * 60 * 1_000,
  offlineThresholdMs: 3_000,
  reconnectBudgetMs: 15_000,
  reconnectCountdownMs: 3_000,
  eliminationResolutionDelayMs: 250,
  initialHearts: 3,
  maxHearts: 10,
  maxHeartsDelta: 1,
  maxScore: 10_000_000,
  maxElapsedMs: 24 * 60 * 60 * 1_000,
  scoreDeltaWindowMs: 1_000,
  maxScoreDeltaPerWindow: 1_000,
  snapshotTimeToleranceMs: 250,
});

const POSITIVE_RULES: readonly (keyof MatchRules)[] = [
  'winDelta',
  'initialCountdownMs',
  'lobbyTimeoutMs',
  'roundDurationMs',
  'suddenDeathTimeoutMs',
  'terminalRetentionMs',
  'offlineThresholdMs',
  'reconnectBudgetMs',
  'reconnectCountdownMs',
  'eliminationResolutionDelayMs',
  'maxHearts',
  'maxHeartsDelta',
  'maxScore',
  'maxElapsedMs',
  'scoreDeltaWindowMs',
  'maxScoreDeltaPerWindow',
];

export function createMatchRules(overrides: Partial<MatchRules> = {}): MatchRules {
  const rules = { ...DEFAULT_MATCH_RULES, ...overrides };

  for (const key of POSITIVE_RULES) {
    if (!Number.isSafeInteger(rules[key]) || rules[key] <= 0) {
      throw new TypeError(`${key} must be a positive safe integer`);
    }
  }

  if (!Number.isSafeInteger(rules.initialHearts) || rules.initialHearts < 0) {
    throw new TypeError('initialHearts must be a non-negative safe integer');
  }

  if (!Number.isSafeInteger(rules.snapshotTimeToleranceMs) || rules.snapshotTimeToleranceMs < 0) {
    throw new TypeError('snapshotTimeToleranceMs must be a non-negative safe integer');
  }

  if (rules.initialHearts > rules.maxHearts) {
    throw new TypeError('initialHearts cannot exceed maxHearts');
  }

  if (rules.maxHearts > ABSOLUTE_MAX_HEARTS) {
    throw new TypeError(`maxHearts cannot exceed ${ABSOLUTE_MAX_HEARTS}`);
  }

  return Object.freeze(rules);
}
