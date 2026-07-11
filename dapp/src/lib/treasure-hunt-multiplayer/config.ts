import type { MatchRules } from './types';

export const DEFAULT_MATCH_RULES: MatchRules = Object.freeze({
  winDelta: 500,
  initialCountdownMs: 3_000,
  offlineThresholdMs: 3_000,
  reconnectBudgetMs: 15_000,
  reconnectCountdownMs: 3_000,
  initialHearts: 3,
  maxHearts: 10,
  maxHeartsDelta: 1,
  maxScore: 10_000_000,
  maxElapsedMs: 24 * 60 * 60 * 1_000,
  scoreDeltaWindowMs: 1_000,
  maxScoreDeltaPerWindow: 1_000,
});

const POSITIVE_RULES: readonly (keyof MatchRules)[] = [
  'winDelta',
  'initialCountdownMs',
  'offlineThresholdMs',
  'reconnectBudgetMs',
  'reconnectCountdownMs',
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

  if (rules.initialHearts > rules.maxHearts) {
    throw new TypeError('initialHearts cannot exceed maxHearts');
  }

  return Object.freeze(rules);
}
