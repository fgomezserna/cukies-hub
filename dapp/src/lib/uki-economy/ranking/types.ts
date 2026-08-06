export const WEEKLY_RANKING_RULE_SCOPE = "weekly_arena_ranking" as const;
export const WEEKLY_RANKING_INITIAL_RANK = 5 as const;
export const WEEKLY_RANKING_MIN_PROMOTION_GAMES = 20 as const;
export const WEEKLY_RANKING_MIN_DEMOTION_GAMES = 10 as const;
export const WEEKLY_RANKING_MAX_MOVEMENT = 2 as const;

export type WeeklyRankingTier = {
  rank: number;
  rewardBps: number;
  promotionAboveBps: number | null;
  demotionBelowBps: number | null;
};

export type WeeklyRankingRule = {
  _id: string;
  scope: typeof WEEKLY_RANKING_RULE_SCOPE;
  version: string;
  active: true;
  activeFrom: Date;
  activeUntil?: Date;
  initialRank: typeof WEEKLY_RANKING_INITIAL_RANK;
  minPromotionGames: typeof WEEKLY_RANKING_MIN_PROMOTION_GAMES;
  minDemotionGames: typeof WEEKLY_RANKING_MIN_DEMOTION_GAMES;
  maxWeeklyMovement: typeof WEEKLY_RANKING_MAX_MOVEMENT;
  performanceBasis: "sum_capped_score_over_sum_score_cap";
  eligibleCreditBucket: "pool";
  tiers: WeeklyRankingTier[];
  configHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WeeklyRankingRuleState = {
  _id: typeof WEEKLY_RANKING_RULE_SCOPE;
  scope: typeof WEEKLY_RANKING_RULE_SCOPE;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WeeklyRankingSource = {
  _id: string;
  sourceId: string;
  periodId: string;
  sessionId: string;
  reservationId: string;
  gameId: string;
  walletNormalized: string;
  settledAt: Date;
  cappedScoreRaw: string;
  scoreCapRaw: string;
  gameResultHash: string;
  creditPayloadHash: string;
  gameRuleVersion: string;
  gameRuleConfigHash: string;
  sourceHash: string;
  createdAt: Date;
};

export type WeeklyRankingSnapshot = {
  _id: string;
  rankingId: string;
  periodId: string;
  periodStart: Date;
  periodEndExclusive: Date;
  gameId: string;
  walletNormalized: string;
  rank: number;
  nextRank: number;
  movement: number;
  rewardBps: number;
  gamesPlayed: number;
  totalCappedScoreRaw: string;
  totalScoreCapRaw: string;
  performanceBps: number;
  participantSourceSetHash: string;
  sourceSetHash: string;
  ruleVersion: string;
  ruleConfigHash: string;
  runId: string;
  manifestId: string;
  status: "sealed";
  sealedAt: Date;
  payloadHash: string;
  createdAt: Date;
};

export type WeeklyRankingManifest = {
  _id: string;
  manifestId: string;
  periodId: string;
  periodStart: Date;
  periodEndExclusive: Date;
  ruleVersion: string;
  ruleConfigHash: string;
  sourceCount: number;
  participantCount: number;
  sourceSetHash: string;
  snapshotSetHash: string;
  runId: string;
  status: "sealed";
  sealedAt: Date;
  payloadHash: string;
  createdAt: Date;
};

export type WeeklyRankingRun = {
  _id: string;
  runId: string;
  periodId: string;
  manifestId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  sourceSetHash: string;
  snapshotSetHash: string;
  sourceCount: number;
  participantCount: number;
  status: "sealed";
  startedAt: Date;
  sealedAt: Date;
  payloadHash: string;
};

export type WeeklyRankingAuditEvent = {
  _id: string;
  eventId: string;
  type: "period_sealed";
  periodId: string;
  runId: string;
  manifestId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  sourceSetHash: string;
  snapshotSetHash: string;
  sourceCount: number;
  participantCount: number;
  payloadHash: string;
  createdAt: Date;
};

export type WeeklyRankingPeriodState = {
  _id: string;
  periodId: string;
  status: "sealed";
  runId: string;
  manifestId: string;
  sourceSetHash: string;
  revision: number;
  sealedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};
