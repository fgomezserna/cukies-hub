import "server-only";

import { DomainConflictError, DomainValidationError } from "../errors";
import { getIsoWeekPeriod, getIsoWeekPeriodId } from "../periods";
import {
  compareRewardText,
  stableRewardHash,
  validRewardDate,
  validRewardText,
  validRewardWallet,
} from "../rewards/rules";
import {
  WEEKLY_RANKING_INITIAL_RANK,
  WEEKLY_RANKING_MAX_MOVEMENT,
  WEEKLY_RANKING_MIN_DEMOTION_GAMES,
  WEEKLY_RANKING_MIN_PROMOTION_GAMES,
  WEEKLY_RANKING_RULE_SCOPE,
  type WeeklyRankingRule,
  type WeeklyRankingSnapshot,
  type WeeklyRankingTier,
} from "./types";

export const CURRENT_WEEKLY_RANKING_TIERS: readonly WeeklyRankingTier[] = [
  { rank: 1, rewardBps: 10_000, promotionAboveBps: null, demotionBelowBps: 7_000 },
  { rank: 2, rewardBps: 9_000, promotionAboveBps: 8_000, demotionBelowBps: 6_000 },
  { rank: 3, rewardBps: 8_000, promotionAboveBps: 7_000, demotionBelowBps: 5_000 },
  { rank: 4, rewardBps: 7_000, promotionAboveBps: 6_000, demotionBelowBps: 4_000 },
  { rank: 5, rewardBps: 6_000, promotionAboveBps: 5_000, demotionBelowBps: 3_000 },
  { rank: 6, rewardBps: 5_000, promotionAboveBps: 4_000, demotionBelowBps: 2_000 },
  { rank: 7, rewardBps: 4_000, promotionAboveBps: 3_000, demotionBelowBps: 1_000 },
  { rank: 8, rewardBps: 3_000, promotionAboveBps: 2_000, demotionBelowBps: 500 },
  { rank: 9, rewardBps: 2_000, promotionAboveBps: 1_000, demotionBelowBps: null },
] as const;

function canonicalRaw(value: unknown, label: string, allowZero = true) {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new DomainValidationError(`${label} debe ser un entero raw canonico.`);
  }
  const parsed = BigInt(value);
  if (!allowZero && parsed === BigInt(0)) {
    throw new DomainValidationError(`${label} debe ser positivo.`);
  }
  return parsed;
}

function integer(value: unknown, label: string, min: number, max: number) {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    throw new DomainValidationError(`${label} debe estar entre ${min} y ${max}.`);
  }
  return value as number;
}

export function buildWeeklyRankingRuleConfigHash(rule: Omit<WeeklyRankingRule, "configHash" | "createdAt" | "updatedAt">) {
  return stableRewardHash({
    scope: rule.scope,
    version: rule.version,
    active: rule.active,
    activeFrom: rule.activeFrom,
    activeUntil: rule.activeUntil ?? null,
    initialRank: rule.initialRank,
    minPromotionGames: rule.minPromotionGames,
    minDemotionGames: rule.minDemotionGames,
    maxWeeklyMovement: rule.maxWeeklyMovement,
    performanceBasis: rule.performanceBasis,
    eligibleCreditBucket: rule.eligibleCreditBucket,
    tiers: rule.tiers,
  });
}

export function assertWeeklyRankingRule(rule: WeeklyRankingRule, at?: Date) {
  if (rule.scope !== WEEKLY_RANKING_RULE_SCOPE || rule._id !== `${WEEKLY_RANKING_RULE_SCOPE}:${rule.version}`) {
    throw new DomainValidationError("La regla no pertenece al ranking semanal.");
  }
  validRewardText(rule.version, "rankingRule.version");
  validRewardDate(rule.activeFrom, "rankingRule.activeFrom");
  if (rule.activeUntil) {
    validRewardDate(rule.activeUntil, "rankingRule.activeUntil");
    if (rule.activeUntil.getTime() <= rule.activeFrom.getTime()) {
      throw new DomainValidationError("rankingRule.activeUntil debe ser posterior.");
    }
  }
  if (rule.active !== true
    || rule.initialRank !== WEEKLY_RANKING_INITIAL_RANK
    || rule.minPromotionGames !== WEEKLY_RANKING_MIN_PROMOTION_GAMES
    || rule.minDemotionGames !== WEEKLY_RANKING_MIN_DEMOTION_GAMES
    || rule.maxWeeklyMovement !== WEEKLY_RANKING_MAX_MOVEMENT
    || rule.performanceBasis !== "sum_capped_score_over_sum_score_cap"
    || rule.eligibleCreditBucket !== "pool"
    || stableRewardHash(rule.tiers) !== stableRewardHash(CURRENT_WEEKLY_RANKING_TIERS)) {
    throw new DomainValidationError("La regla no coincide con la politica UKI aprobada.");
  }
  if (!/^[0-9a-f]{64}$/.test(rule.configHash)
    || buildWeeklyRankingRuleConfigHash(rule) !== rule.configHash) {
    throw new DomainValidationError("rankingRule.configHash no es canonico.");
  }
  validRewardDate(rule.createdAt, "rankingRule.createdAt");
  validRewardDate(rule.updatedAt, "rankingRule.updatedAt");
  if (at) {
    const instant = validRewardDate(at, "rankingRule.at");
    if (rule.activeFrom.getTime() > instant.getTime()
      || (rule.activeUntil && rule.activeUntil.getTime() <= instant.getTime())) {
      throw new DomainConflictError(`La regla ${rule.version} no cubre ${instant.toISOString()}.`);
    }
  }
  return rule;
}

export function buildCurrentWeeklyRankingRule(input: {
  version: string;
  activeFrom: Date;
  activeUntil?: Date;
  now: Date;
}): WeeklyRankingRule {
  const version = validRewardText(input.version, "version");
  const activeFrom = validRewardDate(input.activeFrom, "activeFrom");
  const activeUntil = input.activeUntil ? validRewardDate(input.activeUntil, "activeUntil") : undefined;
  const now = validRewardDate(input.now, "now");
  if (getIsoWeekPeriod(activeFrom).start.getTime() !== activeFrom.getTime()) {
    throw new DomainValidationError("activeFrom debe ser lunes 00:00:00 UTC.");
  }
  if (activeUntil && getIsoWeekPeriod(activeUntil).start.getTime() !== activeUntil.getTime()) {
    throw new DomainValidationError("activeUntil debe ser lunes 00:00:00 UTC.");
  }
  const base = {
    _id: `${WEEKLY_RANKING_RULE_SCOPE}:${version}`,
    scope: WEEKLY_RANKING_RULE_SCOPE,
    version,
    active: true as const,
    activeFrom,
    ...(activeUntil ? { activeUntil } : {}),
    initialRank: WEEKLY_RANKING_INITIAL_RANK,
    minPromotionGames: WEEKLY_RANKING_MIN_PROMOTION_GAMES,
    minDemotionGames: WEEKLY_RANKING_MIN_DEMOTION_GAMES,
    maxWeeklyMovement: WEEKLY_RANKING_MAX_MOVEMENT,
    performanceBasis: "sum_capped_score_over_sum_score_cap" as const,
    eligibleCreditBucket: "pool" as const,
    tiers: CURRENT_WEEKLY_RANKING_TIERS.map((tier) => ({ ...tier })),
  };
  return assertWeeklyRankingRule({
    ...base,
    configHash: buildWeeklyRankingRuleConfigHash(base),
    createdAt: now,
    updatedAt: now,
  });
}

export function calculatePerformanceBps(totalCappedScoreRaw: string, totalScoreCapRaw: string) {
  const capped = canonicalRaw(totalCappedScoreRaw, "totalCappedScoreRaw");
  const cap = canonicalRaw(totalScoreCapRaw, "totalScoreCapRaw", false);
  if (capped > cap) throw new DomainValidationError("El score capped agregado supera el cap agregado.");
  return Number((capped * BigInt(10_000)) / cap);
}

export function calculateNextWeeklyRank(input: {
  appliedRank: number;
  gamesPlayed: number;
  performanceBps: number;
  rule: WeeklyRankingRule;
}) {
  const appliedRank = integer(input.appliedRank, "appliedRank", 1, 9);
  const gamesPlayed = integer(input.gamesPlayed, "gamesPlayed", 0, Number.MAX_SAFE_INTEGER);
  const performanceBps = integer(input.performanceBps, "performanceBps", 0, 10_000);
  assertWeeklyRankingRule(input.rule);
  let nextRank = appliedRank;
  if (gamesPlayed >= input.rule.minPromotionGames) {
    for (let step = 0; step < input.rule.maxWeeklyMovement; step += 1) {
      const threshold = input.rule.tiers[nextRank - 1]?.promotionAboveBps;
      if (threshold === null || threshold === undefined || performanceBps <= threshold) break;
      nextRank -= 1;
    }
  }
  if (nextRank === appliedRank && gamesPlayed >= input.rule.minDemotionGames) {
    for (let step = 0; step < input.rule.maxWeeklyMovement; step += 1) {
      const threshold = input.rule.tiers[nextRank - 1]?.demotionBelowBps;
      if (threshold === null || threshold === undefined || performanceBps >= threshold) break;
      nextRank += 1;
    }
  }
  return nextRank;
}

export function weeklyRankingId(periodId: string, gameId: string, walletNormalized: string) {
  return stableRewardHash({
    kind: "game-weekly-ranking-id",
    periodId: validRewardText(periodId, "periodId"),
    gameId: validRewardText(gameId, "gameId"),
    walletNormalized: validRewardWallet(walletNormalized),
  });
}

export function weeklyRankingSnapshotPayload(snapshot: Omit<WeeklyRankingSnapshot, "payloadHash">) {
  return {
    kind: "game-weekly-ranking",
    rankingId: snapshot.rankingId,
    periodId: snapshot.periodId,
    periodStart: snapshot.periodStart,
    periodEndExclusive: snapshot.periodEndExclusive,
    gameId: snapshot.gameId,
    walletNormalized: snapshot.walletNormalized,
    rank: snapshot.rank,
    nextRank: snapshot.nextRank,
    movement: snapshot.movement,
    rewardBps: snapshot.rewardBps,
    gamesPlayed: snapshot.gamesPlayed,
    totalCappedScoreRaw: snapshot.totalCappedScoreRaw,
    totalScoreCapRaw: snapshot.totalScoreCapRaw,
    performanceBps: snapshot.performanceBps,
    participantSourceSetHash: snapshot.participantSourceSetHash,
    sourceSetHash: snapshot.sourceSetHash,
    ruleVersion: snapshot.ruleVersion,
    ruleConfigHash: snapshot.ruleConfigHash,
    runId: snapshot.runId,
    manifestId: snapshot.manifestId,
    status: snapshot.status,
    sealedAt: snapshot.sealedAt,
  };
}

export function assertWeeklyRankingSnapshotIntegrity(snapshot: WeeklyRankingSnapshot) {
  const period = getIsoWeekPeriod(snapshot.periodStart);
  const expectedId = weeklyRankingId(snapshot.periodId, snapshot.gameId, snapshot.walletNormalized);
  canonicalRaw(snapshot.totalCappedScoreRaw, "ranking.totalCappedScoreRaw");
  canonicalRaw(snapshot.totalScoreCapRaw, "ranking.totalScoreCapRaw", false);
  if (snapshot.periodId !== getIsoWeekPeriodId(snapshot.periodStart)
    || snapshot.periodStart.getTime() !== period.start.getTime()
    || snapshot.periodEndExclusive.getTime() !== period.endExclusive.getTime()
    || snapshot._id !== expectedId
    || snapshot.rankingId !== expectedId
    || snapshot.status !== "sealed"
    || integer(snapshot.rank, "ranking.rank", 1, 9) !== snapshot.rank
    || integer(snapshot.nextRank, "ranking.nextRank", 1, 9) !== snapshot.nextRank
    || snapshot.movement !== snapshot.nextRank - snapshot.rank
    || Math.abs(snapshot.movement) > WEEKLY_RANKING_MAX_MOVEMENT
    || integer(snapshot.rewardBps, "ranking.rewardBps", 0, 10_000) !== snapshot.rewardBps
    || integer(snapshot.gamesPlayed, "ranking.gamesPlayed", 1, Number.MAX_SAFE_INTEGER) !== snapshot.gamesPlayed
    || calculatePerformanceBps(snapshot.totalCappedScoreRaw, snapshot.totalScoreCapRaw) !== snapshot.performanceBps
    || !/^[0-9a-f]{64}$/.test(snapshot.sourceSetHash)
    || !/^[0-9a-f]{64}$/.test(snapshot.participantSourceSetHash)
    || !/^[0-9a-f]{64}$/.test(snapshot.ruleConfigHash)
    || !/^[0-9a-f]{64}$/.test(snapshot.runId)
    || !/^[0-9a-f]{64}$/.test(snapshot.manifestId)
    || snapshot.payloadHash !== stableRewardHash(weeklyRankingSnapshotPayload(snapshot))) {
    throw new DomainConflictError(`Ranking ${snapshot._id} no supera integridad.`);
  }
  validRewardDate(snapshot.sealedAt, "ranking.sealedAt");
  validRewardDate(snapshot.createdAt, "ranking.createdAt");
  if (snapshot.createdAt.getTime() !== snapshot.sealedAt.getTime()) {
    throw new DomainConflictError(`Ranking ${snapshot._id} tiene cronologia invalida.`);
  }
  return snapshot;
}

export function compareParticipantKey(left: { gameId: string; walletNormalized: string }, right: { gameId: string; walletNormalized: string }) {
  const game = compareRewardText(left.gameId, right.gameId);
  return game || compareRewardText(left.walletNormalized, right.walletNormalized);
}
