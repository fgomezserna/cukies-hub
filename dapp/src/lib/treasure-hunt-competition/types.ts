export const TREASURE_HUNT_COMPETITION_GAME_ID = 'treasure-hunt' as const;
export const TREASURE_HUNT_COMPETITION_MODE = 'presale_competition' as const;

export type CompetitionEligibilityKind = 'presale' | 'uki_staking';

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
  readonly eligibilityKind: CompetitionEligibilityKind;
  readonly presaleContractAddress: string;
  readonly stakingContractAddress: string | null;
  readonly stakingChainId: 56 | 97 | null;
  readonly stakePerAttemptRaw: string;
  readonly topAttemptsPerWallet: number;
  readonly pointsPerTicket: number;
  readonly basePrizeUkiRaw: string;
  readonly stakePrizeBps: number;
  readonly prizePerWinnerUkiRaw: string;
  readonly maxWinsPerWallet: number;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly poolBps: number;
  readonly playerRewardBps: number;
  readonly sponsorRewardBps: number;
  readonly maxWinningAttemptsPerWallet: number;
  readonly cliffMonths: number;
  readonly vestingMonths: number;
}

export interface CompetitionDisqualificationEvidence {
  readonly eventId: string;
  readonly txHash: string;
  readonly blockNumber: number;
  readonly timestamp: string;
  readonly amountRaw: string;
}

export interface CompetitionStakingSnapshot {
  readonly ready: boolean;
  readonly stakedUkiRaw: string;
  readonly totalStakedUkiRaw: string;
  readonly indexedThroughBlock: number | null;
  readonly indexedAt: string | null;
  readonly disqualified: boolean;
  readonly disqualificationEvidence: CompetitionDisqualificationEvidence | null;
  readonly issues: readonly string[];
}

export interface CompetitionStakingEligibility extends CompetitionStakingSnapshot {
  readonly attemptsGranted: number;
  readonly attemptsUsed: number;
  readonly attemptsRemaining: number;
  readonly topAttemptsCount: number;
  readonly totalTickets: number;
  readonly provisionalTickets: number;
}

export interface CompetitionAttempt {
  readonly attemptId: string;
  readonly campaignId: string;
  readonly gameId: string;
  readonly mode: string;
  /** Eligibility policy captured when the attempt was created. Legacy rows default to presale. */
  readonly eligibilityKind?: CompetitionEligibilityKind;
  readonly walletAddress: string;
  readonly playerAlias: string;
  readonly score: number;
  readonly gameTimeMs: number;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly status: CompetitionAttemptStatus;
  readonly entitlementSlot?: number | null;
  readonly stakeBalanceRawAtStart?: string | null;
  readonly stakingSnapshotBlock?: number | null;
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
