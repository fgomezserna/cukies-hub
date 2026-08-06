export const REWARD_RULE_SCOPE = "reward_allocations" as const;
export const REWARD_SCHEMA_VERSION = 2 as const;
export const REWARD_BPS_DENOMINATOR = 10_000 as const;
export const REWARD_MAX_ALLOCATIONS_PER_SOURCE = 10_000 as const;
export const REWARD_MAX_ALLOCATIONS_PER_PERIOD = 100_000 as const;
export const REWARD_ALLOCATION_PAGE_SIZE = 1_000 as const;

export const REWARD_EMISSION_BUDGET_SCOPE = REWARD_RULE_SCOPE;

export type RewardEmissionBudgetConfig = {
  /** Inicio irreversible del programa global; cambiarlo no reinicia el ledger. */
  programStartsAt: Date;
  /** Segundo UTC (0-86399) en el que empieza cada ventana diaria. */
  dayBoundarySecondUtc: number;
  /** Gracia explicita para materializar una fuente despues del fin de su dia. */
  lateReservationGraceSeconds: number;
  dailyCapRaw: string;
  lifetimeCapRaw: string;
  /** V1 no acumula capacidad diaria no utilizada. */
  unusedDailyCapacity: "expires";
  /** V1 nunca convierte un exceso en un claim o accrual implicito. */
  overflowPolicy: "block";
};

export type RewardCategory =
  | "player"
  | "credit_pool_daily"
  | "cukie_pool_original_distribution"
  | "cukie_pool_second_plus_distribution"
  | "cukie_pool_original_carry"
  | "cukie_pool_second_plus_carry"
  | "treasury"
  | "marketing"
  | "development"
  | "supply_reduction";

/**
 * Obligaciones intermedias. Nunca son hojas Merkle: necesitan un calculo
 * posterior (ganadores/reparto del pool) antes de convertirse en claims.
 */
export type RewardAccrualCategory =
  | "weekly_prize_pool"
  | "credit_pool_weekly"
  | "cukie_pool_original_weekly"
  | "cukie_pool_second_plus_weekly"
  | "undistributed_pending";

export type RewardRule = {
  _id: string;
  scope: typeof REWARD_RULE_SCOPE;
  version: string;
  active: boolean;
  activeFrom: Date;
  activeUntil?: Date;
  tokenDecimals: number;
  runCredits: {
    /** 10 creditos se representan como 100 unidades; no se usan floats. */
    unitScale: number;
    totalUnits: number;
    weeklyReserveUnits: number;
    convertibleUnits: number;
  };
  settlementBps: {
    poolCredits: number;
    poolCukieWithOwnCredits: number;
    poolCukieWithPoolCredits: number;
  };
  rankingPlayerBps: Record<string, number>;
  creditPoolDaily: {
    sourceShareBps: number;
    floorEnabled: boolean;
    floorCreditsStep: number;
    floorAmountRaw: string;
  };
  emissionBudget: RewardEmissionBudgetConfig;
  cukiePool: {
    cumulativeTierCount: 6;
  };
  undistributedBps: {
    treasury: number;
    marketing: number;
    development: number;
    supplyReduction: number;
  };
  destinations: {
    creditPool: string;
    cukiePoolOriginal: string;
    cukiePoolSecondPlus: string;
    treasury: string;
    marketing: string;
    development: string;
    supplyReduction: string;
  };
  configHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RewardRuleState = {
  _id: typeof REWARD_RULE_SCOPE;
  scope: typeof REWARD_RULE_SCOPE;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistRewardRuleInput = Omit<RewardRule, "createdAt" | "updatedAt"> & {
  now: Date;
};

export type RewardAllocationStatus = "allocated" | "blocked";

export type RewardAllocation = {
  _id: string;
  allocationId: string;
  periodId: string;
  sourceId: string;
  walletNormalized: string;
  category: RewardCategory;
  amountRaw: string;
  sourceTotalRaw: string;
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  sourceSetHash: string;
  calculationJobRunId: string;
  calculationKind: "settlement" | "credit_pool" | "cukie_pool" | "system";
  calculationInputHash: string;
  calculationOutputHash: string;
  payloadHash: string;
  status: RewardAllocationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type RewardAllocationDraft = Pick<
  RewardAllocation,
  "walletNormalized" | "category" | "amountRaw"
>;

export type RewardAccrualDraft = {
  category: RewardAccrualCategory;
  amountRaw: string;
};

export type RewardPoolAccrual = {
  _id: string;
  accrualId: string;
  periodId: string;
  sourceId: string;
  category: RewardAccrualCategory;
  amountRaw: string;
  sourceTotalRaw: string;
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  sourceSetHash: string;
  calculationJobRunId: string;
  calculationKind: RewardAllocation["calculationKind"];
  calculationInputHash: string;
  calculationOutputHash: string;
  payloadHash: string;
  status: "accrued" | "blocked";
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Fence global de una fuente economica. Su `_id` es el `sourceId` canonico,
 * por lo que una partida/fuente solo puede pertenecer a un periodo aunque dos
 * workers intenten materializarla de forma concurrente.
 */
export type RewardSourceManifest = {
  _id: string;
  sourceId: string;
  periodId: string;
  sourceTotalRaw: string;
  claimableTotalRaw: string;
  accrualTotalRaw: string;
  allocationCount: number;
  accrualCount: number;
  sourceSetHash: string;
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  calculationJobRunId: string;
  calculationKind: RewardAllocation["calculationKind"];
  calculationInputHash: string;
  calculationOutputHash: string;
  payloadHash: string;
  status: RewardAllocationStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type RewardEmissionBudgetState = {
  _id: typeof REWARD_EMISSION_BUDGET_SCOPE;
  scope: typeof REWARD_EMISSION_BUDGET_SCOPE;
  programStartsAt: Date;
  dayBoundarySecondUtc: number;
  lateReservationGraceSeconds: number;
  unusedDailyCapacity: RewardEmissionBudgetConfig["unusedDailyCapacity"];
  overflowPolicy: RewardEmissionBudgetConfig["overflowPolicy"];
  lifetimeCapRaw: string;
  reservedLifetimeRaw: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RewardEmissionBudgetDay = {
  _id: string;
  dayId: string;
  startsAt: Date;
  endsAt: Date;
  reservationClosesAt: Date;
  reservedRaw: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type RewardEmissionBudgetReason =
  | "RESERVED"
  | "PROGRAM_NOT_STARTED"
  | "SOURCE_EFFECTIVE_AT_IN_FUTURE"
  | "DAY_CLOSED"
  | "DAILY_CAP_EXCEEDED"
  | "LIFETIME_CAP_EXCEEDED";

/**
 * Decision inmutable y global por source. Tambien actua como fence de replay:
 * una fuente rechazada no puede reaparecer con otra fecha, regla o reparto.
 */
export type RewardEmissionBudgetEvent = {
  _id: string;
  eventId: string;
  sourceId: string;
  periodId: string;
  dayId: string;
  dayStartsAt: Date;
  dayEndsAt: Date;
  reservationClosesAt: Date;
  sourceTotalRaw: string;
  status: "reserved" | "blocked";
  reason: RewardEmissionBudgetReason;
  previousDailyRaw: string;
  resultingDailyRaw: string;
  dailyCapRaw: string;
  previousLifetimeRaw: string;
  resultingLifetimeRaw: string;
  lifetimeCapRaw: string;
  programStartsAt: Date;
  dayBoundarySecondUtc: number;
  lateReservationGraceSeconds: number;
  unusedDailyCapacity: RewardEmissionBudgetConfig["unusedDailyCapacity"];
  overflowPolicy: RewardEmissionBudgetConfig["overflowPolicy"];
  ruleVersion: string;
  ruleConfigHash: string;
  ruleEffectiveAt: Date;
  sourceSetHash: string;
  calculationJobRunId: string;
  calculationKind: RewardAllocation["calculationKind"];
  calculationInputHash: string;
  calculationOutputHash: string;
  payloadHash: string;
  createdAt: Date;
};

export type CreditSourceKind = "own" | "pool";
export type CukieSourceKind = "own" | "pool_original" | "pool_second_plus";

export type SettlementRewardInput = {
  periodId: string;
  sourceId: string;
  playerWallet: string;
  grossConvertedRaw: string;
  /** Maximo convertible sellado por la regla GameEconomy (7.5 UKI raw). */
  maxConvertibleRaw: string;
  creditSource: CreditSourceKind;
  cukieSource: CukieSourceKind;
  /** Obligatorio solo con creditos del pool. */
  ranking: number | null;
  creditCostUnits: number;
  weeklyReserveUnits: number;
};

export type RewardAllocationSetInput = {
  periodId: string;
  sourceId: string;
  sourceTotalRaw: string;
  expectedRuleVersion: string;
  /** Fecha economica inmutable de la fuente; no es el reloj del worker. */
  ruleEffectiveAt: Date;
  allocations: RewardAllocationDraft[];
  accruals?: RewardAccrualDraft[];
  calculation: {
    jobRunId: string;
    kind: RewardAllocation["calculationKind"];
    inputHash: string;
    outputHash: string;
  };
  now: Date;
};

export type RewardIntegrityIncident = {
  _id: string;
  incidentId: string;
  periodId: string;
  sourceId: string;
  reasonCodes: string[];
  evidenceHash: string;
  status: "open";
  detectedAt: Date;
};

export type RewardPeriodSeal = {
  _id: string;
  sealId: string;
  periodId: string;
  expectedSourceIds: string[];
  periodAllocationHash: string;
  ruleVersion: string;
  ruleConfigHash: string;
  payloadHash: string;
  status: "sealed";
  sealedBy: string;
  createdAt: Date;
};

export type RewardPeriodState = {
  _id: string;
  periodId: string;
  status: "open" | "sealed";
  allocationRevision: number;
  revision: number;
  sealId?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type PersistRewardAllocationSetResult =
  | {
      status: "allocated";
      replayed: boolean;
      allocations: RewardAllocation[];
      accruals: RewardPoolAccrual[];
      sourceSetHash: string;
      emissionBudgetEvent: RewardEmissionBudgetEvent;
    }
  | {
      status: "blocked";
      replayed: boolean;
      allocations: RewardAllocation[];
      accruals: RewardPoolAccrual[];
      incident: RewardIntegrityIncident;
      sourceSetHash: string;
      emissionBudgetEvent: RewardEmissionBudgetEvent;
    }
  | {
      status: "budget_blocked";
      replayed: boolean;
      allocations: [];
      accruals: [];
      sourceSetHash: string;
      emissionBudgetEvent: RewardEmissionBudgetEvent;
    };

export type CreditPoolContributor = {
  walletAddress: string;
  credits: number;
};

export type CreditPoolDistributionInput = {
  sourcePoolRaw: string;
  fundingAvailableRaw: string;
  contributors: CreditPoolContributor[];
};

export type CukiePoolGeneration = "original" | "second_plus";

export type CukiePoolParticipant = {
  walletAddress: string;
  /** 0=Comun, 1=No Comun, 2=Raro, 3=Epico, 4=Legendario, 5=Goat. */
  rarityLevel: number;
  /** Permite varios Cukies equivalentes sin recurrir a floats. */
  units: number;
};

export type CukiePoolDistributionInput = {
  generation: CukiePoolGeneration;
  sourcePoolRaw: string;
  carryWallet: string;
  participants: CukiePoolParticipant[];
};

export type RewardClaimProof = {
  _id: string;
  proofId: string;
  batchId: `0x${string}`;
  periodId: string;
  walletAddress: string;
  walletNormalized: string;
  amountRaw: string;
  leaf: `0x${string}`;
  proof: `0x${string}`[];
  payloadHash: string;
  createdAt: Date;
};

export type RewardClaimBatch = {
  _id: string;
  draftKey: string;
  batchId: `0x${string}`;
  periodId: string;
  chainId: number;
  distributorAddress: string;
  metadata: string;
  metadataHash: `0x${string}`;
  merkleRoot: `0x${string}`;
  totalAllocatedRaw: string;
  allocationCount: number;
  sourceAllocationSetHash: string;
  periodSealId: string;
  ruleVersion: string;
  ruleConfigHash: string;
  sourceIds: string[];
  proofSetHash: string;
  proofCollection: "reward_claim_proofs";
  canonicalInputHash: `0x${string}`;
  status: "draft" | "published" | "closed";
  previewOnly: boolean;
  publishAuthorized: boolean;
  signature: null;
  transactionHash: string | null;
  createdAt: Date;
  updatedAt?: Date;
  publicationEventId?: string;
  publicationTransactionHash?: string;
  publicationBlockNumber?: number;
  publicationBlockHash?: string;
  publicationLogIndex?: number;
  publishedAt?: Date;
  publishedBatchId?: string;
  publishedMerkleRoot?: string;
  publishedInputHash?: string;
  publishedMetadataHash?: string;
  publishedTotalAllocatedRaw?: string;
  publishedProofSetHash?: string;
  publishedPeriodSealId?: string;
  startsAtRaw?: string;
  expiresAtRaw?: string;
  startsAt?: Date;
  expiresAt?: Date;
  totalClaimedRaw?: string;
  claimedCount?: number;
  closed?: boolean;
  closeEventId?: string;
  closeTransactionHash?: string;
  closeBlockNumber?: number;
  closeBlockHash?: string;
  closeLogIndex?: number;
  unclaimedAmountRaw?: string;
  closedAt?: Date;
};

export type RewardClaim = {
  _id: string;
  eventId: string;
  chain: "BSC";
  contractAddress: string;
  batchId: string;
  walletAddress: string;
  walletNormalized: string;
  amountRaw: string;
  transactionHash: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  indexedAt: Date;
  createdAt: Date;
};

export type DraftRewardClaimBatchInput = {
  periodId: string;
  expectedPeriodAllocationHash: string;
  chainId: number;
  distributorAddress: string;
  metadata: string;
  now: Date;
};

export type SealRewardPeriodInput = {
  periodId: string;
  expectedSourceIds: string[];
  expectedPeriodAllocationHash: string;
  expectedRuleVersion: string;
  sealedBy: string;
  now: Date;
};
