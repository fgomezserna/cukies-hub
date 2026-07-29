export const TREASURE_HUNT_COMPETITION_GAME_ID = 'treasure-hunt' as const;
export const TREASURE_HUNT_COMPETITION_MODE = 'presale_competition' as const;

export type CompetitionAttemptStatus =
  | 'active'
  | 'valid'
  | 'invalid'
  | 'review'
  | 'abandoned';

export interface CompetitionConfig {
  readonly campaignId: string;
  readonly gameId: typeof TREASURE_HUNT_COMPETITION_GAME_ID;
  readonly mode: typeof TREASURE_HUNT_COMPETITION_MODE;
  readonly rulesVersion: string;
  readonly presaleContractAddress: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly poolBps: number;
  readonly playerRewardBps: number;
  readonly sponsorRewardBps: number;
  readonly maxWinningAttemptsPerWallet: number;
  readonly cliffMonths: number;
  readonly vestingMonths: number;
}

export interface CompetitionAttempt {
  readonly attemptId: string;
  readonly campaignId: string;
  readonly gameId: string;
  readonly mode: string;
  readonly walletAddress: string;
  readonly playerAlias: string;
  readonly score: number;
  readonly gameTimeMs: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: CompetitionAttemptStatus;
}

export interface RankedCompetitionAttempt extends CompetitionAttempt {
  readonly walletAddress: string;
  readonly rank: number;
  readonly walletRank: number;
}

export interface CompetitionPurchase {
  readonly walletAddress: string;
  readonly ukiPurchasedRaw: string;
  readonly sponsorWalletAddress?: string | null;
}

export type CompetitionSettlementSkipReason =
  | 'no_purchase'
  | 'reward_rounds_to_zero'
  | 'wallet_limit'
  | 'pool_exhausted';

export interface CompetitionSettlementSkip {
  readonly attemptId: string;
  readonly rank: number;
  readonly walletAddress: string;
  readonly reason: CompetitionSettlementSkipReason;
}

export interface CompetitionAward {
  readonly attemptId: string;
  readonly rank: number;
  readonly walletRank: number;
  readonly walletAddress: string;
  readonly playerAlias: string;
  readonly purchasedUkiRaw: string;
  readonly playerRewardUkiRaw: string;
  readonly sponsorWalletAddress: string | null;
  readonly sponsorRewardUkiRaw: string;
  readonly totalRewardUkiRaw: string;
  readonly partial: boolean;
}

export interface CompetitionSettlement {
  readonly campaignId: string;
  readonly totalPurchasedUkiRaw: string;
  readonly poolUkiRaw: string;
  readonly playerPoolUkiRaw: string;
  readonly sponsorPoolUkiRaw: string;
  readonly playerRewardsUkiRaw: string;
  readonly sponsorRewardsUkiRaw: string;
  readonly spentUkiRaw: string;
  readonly remainingUkiRaw: string;
  readonly roundingDustUkiRaw: string;
  readonly awards: readonly CompetitionAward[];
  readonly skipped: readonly CompetitionSettlementSkip[];
}

export interface CompetitionVestingSchedule {
  readonly startAt: string;
  readonly cliffAt: string;
  readonly endAt: string;
  readonly durationSeconds: number;
}
