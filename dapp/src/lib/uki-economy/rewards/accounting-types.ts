export const UKI_TOKEN_DECIMALS = 18 as const;
export const DAILY_REWARD_EMISSION_RAW = "500000000000000000000000" as const;

export type DailyRewardBuckets = {
  playersRaw: string;
  creditPoolRaw: string;
  cukiePoolRaw: string;
  ambassadorOrdinaryRaw: string;
  weeklyPrizeRaw: string;
  ambassadorWeeklyRaw: string;
};

export type UndistributedDestinations = {
  treasury: string;
  marketingDevelopment: string;
  supplyReduction: string;
};

export type UndistributedSplit = {
  totalRaw: string;
  treasuryRaw: string;
  marketingDevelopmentRaw: string;
  supplyReductionRaw: string;
};

export type DailyRewardAccounting = {
  _id: string;
  dayId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  sourceIds: string[];
  sourceSetHash: string;
  sourceReservedRaw: string;
  capacityMaterializedRaw: string;
  priorReservedInflowRaw: string;
  topupRaw: string;
  emissionRaw: string;
  buckets: DailyRewardBuckets;
  undistributed: UndistributedSplit;
  priorReservedUndistributed: UndistributedSplit;
  destinations: UndistributedDestinations;
  allocations: RewardAccountingAllocation[];
  conservationRaw: string;
  payloadHash: string;
  status: "sealed";
  sealedAt: Date;
};

export type RewardDailyCapacityMaterialization = {
  _id: string;
  dayId: string;
  budgetDayId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  previousDailyRaw: string;
  capacityMaterializedRaw: string;
  resultingDailyRaw: string;
  previousLifetimeRaw: string;
  resultingLifetimeRaw: string;
  payloadHash: string;
  status: "sealed";
  sealedAt: Date;
};

export type RewardAccountingAllocationCategory =
  | "player"
  | "credit_pool"
  | "cukie_pool_original"
  | "cukie_pool_second_plus"
  | "ambassador_ordinary"
  | "ambassador_weekly"
  | "treasury"
  | "marketing_development"
  | "supply_reduction";

export type RewardAccountingAllocation = {
  allocationId: string;
  walletNormalized: string;
  category: RewardAccountingAllocationCategory;
  amountRaw: string;
  fundingMode: "daily_emission" | "reserved_no_mint";
  sourceIds: string[];
};

/**
 * Vista plana e inmutable de cada salida del cierre. No vuelve a reservar ni
 * a mintear UKI: apunta al cierre diario/semanal que ya demuestra el funding.
 * Es la frontera consumible por el futuro publicador de batches on-chain.
 */
export type RewardAccountingAllocationDocument = RewardAccountingAllocation & {
  _id: string;
  accountingId: string;
  accountingKind: "daily" | "weekly";
  periodId: string;
  availableAt: Date;
  status: "allocated_offchain";
  payloadHash: string;
  createdAt: Date;
};

export type RewardAccountingParticipant = {
  walletNormalized: string;
  units: number;
  ambassadorWalletNormalized: string | null;
};

export type CukieRewardAccountingParticipant = RewardAccountingParticipant & {
  rarityLevel: number;
};

export type PriorWeeklyPoolTranche = {
  weeklyAccountingId: string;
  creditPoolRaw: string;
  creditPoolAmbassadorRaw: string;
  cukiePoolOriginalRaw: string;
  cukiePoolOriginalAmbassadorRaw: string;
  cukiePoolSecondPlusRaw: string;
  cukiePoolSecondPlusAmbassadorRaw: string;
};

export type DailyRewardSourceLine = {
  sourceId: string;
  sourceTotalRaw: string;
  allocations: Array<{
    allocationId: string;
    walletNormalized: string;
    category: string;
    amountRaw: string;
  }>;
  accruals: Array<{ accrualId: string; category: string; amountRaw: string }>;
};

export type DailyAmbassadorSourceSnapshot = {
  walletNormalized: string;
  ambassadorWalletNormalized: string | null;
};

export type RewardReserveBreakdown = {
  credits: number;
  performanceRaw: string;
  weeklyPrizeRaw: string;
  ambassadorOrdinaryRaw: string;
  ambassadorWeeklyRaw: string;
  totalRaw: string;
};

export type WeeklyGameResult = {
  sessionId: string;
  wallet: string;
  gameId: string;
  scoreRaw: string;
  periodAnchorAt: Date;
  playedAt: Date;
  settledAt: Date;
  status: "created" | "started" | "submitted" | "validated" | "settled" | "forfeited" | "expired" | "rejected";
  outcome: "completed" | "abandoned" | "failed";
  resultValid: boolean;
  resultHash: string;
  creditSnapshot: {
    source: "own" | "pool";
    reservationId: string;
    evidenceHash: string;
  };
  cukieSnapshot: {
    source: "own" | "pool_original" | "pool_second_plus" | "seiku";
    assignmentId: string;
    generation: string;
    evidenceHash: string;
  };
  ambassadorSnapshot: {
    walletNormalized: string | null;
    capturedAt: Date;
    evidenceHash: string;
  };
  arenaRankingSnapshot: {
    rank: number | null;
    rewardBps: number;
    sourceRankingId: string | null;
    evidenceHash: string;
  };
};

export type WeeklyGameSource = WeeklyGameResult & {
  _id: string;
  payloadHash: string;
  recordedAt: Date;
};

export type WeeklyWinningSourceSnapshot = Pick<WeeklyGameResult,
  "sessionId" | "periodAnchorAt" | "settledAt" | "creditSnapshot" | "cukieSnapshot" | "ambassadorSnapshot" | "arenaRankingSnapshot" | "resultHash"
>;

export type WeeklyPrizeWinner = {
  walletNormalized: string;
  winningGameId: string;
  winningScoreRaw: string;
  winningAt: Date;
  gamesPlayed: number;
  qualifyingLotteryGames: number;
  sourceSnapshot: WeeklyWinningSourceSnapshot;
  position?: number;
  kind: "top_10" | "positions_11_25" | "lottery";
  shareBps: number;
  amountRaw: string;
  playerRaw: string;
  creditPoolRaw: string;
  cukiePoolRaw: string;
  undistributedRaw: string;
};

export type WeeklyPoolReservation = {
  pool: "credit" | "cukie_original" | "cukie_second_plus";
  amountRaw: string;
  ambassadorReserveRaw: string;
  sourceWinningGameIds: string[];
  tranches: Array<{
    tranche: number;
    scheduledAt: Date;
    amountRaw: string;
    ambassadorReserveRaw: string;
  }>;
};

export type WeeklyAmbassadorPayout = {
  ambassadorWallet: string;
  playerWallet: string;
  winningGameId: string;
  amountRaw: string;
  commissionBps: 500;
  source: "weekly_player_prize";
};

export type WeeklyLotteryEntropy = {
  chainId: 97;
  selectionPolicy: "first_safe_block_at_or_after_cutoff";
  blockNumber: number;
  blockHash: string;
  blockTimestamp: Date;
  previousBlockNumber: number;
  previousBlockHash: string;
  previousBlockTimestamp: Date;
  canonical: true;
  confirmedAt: Date;
};

export type WeeklyPrizeAccounting = {
  _id: string;
  periodId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  fundingMode: "reserved_no_mint";
  sourceDailyAccountingIds: string[];
  potRaw: string;
  ambassadorReserveRaw: string;
  winners: WeeklyPrizeWinner[];
  poolReservations: WeeklyPoolReservation[];
  poolTrancheSchedule: Date[];
  ambassadorPayouts: WeeklyAmbassadorPayout[];
  playerAllocatedRaw: string;
  poolReservedRaw: string;
  allocatedRaw: string;
  ambassadorAllocatedRaw: string;
  ambassadorDeferredRaw: string;
  undistributed: UndistributedSplit;
  ambassadorUndistributed: UndistributedSplit;
  destinations: UndistributedDestinations;
  allocations: RewardAccountingAllocation[];
  conservationRaw: string;
  lotteryEntropy: WeeklyLotteryEntropy;
  lotteryEntropyHash: string;
  payloadHash: string;
  status: "sealed";
  payoutAt: Date;
  sealedAt: Date;
};

export type PoolTrancheAccounting = {
  _id: string;
  periodId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  tranche: number;
  participantWallet: string;
  fundingMode: "reserved_no_mint";
  ordinarySourceId: string;
  priorPeriodSourceId: string;
  credits: number;
  ordinaryRaw: string;
  priorPeriodSeventhRaw: string;
  guaranteedRaw: string;
  paymentRaw: string;
  topupRaw: string;
  ambassadorWallet?: string;
  ambassadorCommissionRaw: string;
  ambassadorCommissionSource: "pool_payment_non_recursive";
  fundingRaw: string;
  scheduledAt: Date;
  payloadHash: string;
  status: "sealed";
  sealedAt: Date;
};

export type CukiePoolCandidate = {
  wallet: string;
  amountRaw: string;
  isSeiku: boolean;
};

export type CukiePoolEligibilityResult = {
  eligible: Array<{ walletNormalized: string; amountRaw: string }>;
  undistributedRaw: string;
};
