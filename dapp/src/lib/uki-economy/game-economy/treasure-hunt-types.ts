export type TreasureHuntCreditSource = "own" | "pool";
export type TreasureHuntCukieSource = "own" | "pool";

export type TreasureHuntRunStatus =
  | "active"
  | "finishing"
  | "settled"
  | "forfeited"
  | "released";

export type TreasureHuntEvidencePoint = {
  evidencePointId: string;
  sequence: number;
  kind: "checkpoint" | "finish" | "forfeit";
  scoreRaw: string;
  gameTimeMs: number;
  receivedAt: Date;
  previousHash: string;
  evidenceHash: string;
};

export type TreasureHuntEconomyRun = {
  _id: string;
  runId: string;
  gameEconomySessionId: string;
  authorityGameSessionId: string;
  authorityUserId: string;
  walletNormalized: string;
  status: TreasureHuntRunStatus;
  policyVersion: "treasure-hunt-staging-v1";
  gameRuleVersion: "staging-test-v4";
  reservedAt: Date;
  startedAt: Date;
  dailyPeriodId: string;
  dailyPeriodStartsAt: Date;
  dailyPeriodEndsAt: Date;
  weeklyPeriodId: string;
  weeklyPeriodStartsAt: Date;
  weeklyPeriodEndsAt: Date;
  creditReservationId: string;
  creditPeriodId: string;
  creditSource: TreasureHuntCreditSource;
  creditEvidenceHash: string;
  cukieAssignmentId: string;
  cukieSource: TreasureHuntCukieSource;
  cukieAssetId: string;
  cukieTokenId: string | null;
  cukieGeneration: string;
  cukieRarity: string;
  cukieAssignmentKind: "own" | "pool_asset" | "seiku";
  cukieEvidenceHash: string;
  ambassadorWalletNormalized: string | null;
  ambassadorCapturedAt: Date;
  ambassadorEvidenceHash: string;
  quotaReservationId: string | null;
  evidence: TreasureHuntEvidencePoint[];
  lastEvidenceHash: string;
  terminalResultId?: string;
  outcome?: "completed" | "voluntary_forfeit" | "system_failure";
  scoreRaw?: string;
  achievedAt?: Date;
  authoritySource?: "competition" | "economy";
  authorityReference?: string;
  leaderboardEligible?: boolean;
  rewardEligible?: boolean;
  jackpotEligible?: boolean;
  resultPayloadHash?: string;
  terminalAuthoritySource?: "competition" | "economy";
  terminalAuthorityReference?: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasureHuntPoolDailyUsage = {
  _id: string;
  walletNormalized: string;
  dailyPeriodId: string;
  policyVersion: "treasure-hunt-staging-v1";
  reservedGames: number;
  reservedLowScoreSlots: number;
  countedGames: number;
  lowScoreGames: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasureHuntPoolQuotaReservation = {
  _id: string;
  reservationId: string;
  runId: string;
  walletNormalized: string;
  dailyPeriodId: string;
  status: "reserved" | "counted" | "released";
  countedLowScore: boolean | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasureHuntWeeklyBest = {
  _id: string;
  walletNormalized: string;
  weeklyPeriodId: string;
  gameId: "treasure-hunt";
  scoreRaw: string;
  scoreDigits: number;
  achievedAt: Date;
  winningGameId: string;
  authorityGameSessionId: string;
  creditSource: TreasureHuntCreditSource;
  creditReservationId: string;
  cukieSource: TreasureHuntCukieSource;
  cukieAssignmentId: string;
  cukieAssetId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type TreasureHuntEconomyStartResponse = {
  runId: string;
  gameEconomySessionId: string;
  creditSource: TreasureHuntCreditSource;
  cukieSource: TreasureHuntCukieSource;
  cukieAssetId: string;
  dailyPeriodId: string;
  dailyPeriodEndsAt: string;
};

export type TreasureHuntEconomyResultResponse = {
  runId: string;
  status: "settled" | "forfeited";
  scoreRaw: string;
  leaderboardEligible: boolean;
  rewardEligible: boolean;
  jackpotEligible: boolean;
};
