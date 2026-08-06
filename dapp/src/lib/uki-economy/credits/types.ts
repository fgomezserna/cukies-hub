import type { CukieMasterSlot } from "../cukie-master/types";

export const CREDIT_SCHEMA_VERSION = 2 as const;
export const CREDIT_RULE_SCOPE = "competition_credits" as const;
export const CREDIT_SOURCE_WATERMARK_ID = "cukie-master-slots" as const;
export const CREDITS_PER_MATURE_SLOT = 100 as const;
export const MAX_CREDIT_RESERVATION_ALLOCATIONS = 1_000 as const;

export type CreditBucket = "own" | "pool";
export type CreditLotState = "available" | "reserved" | "spent" | "expired";
export type CreditRunStatus = "snapshotted" | "processing" | "open" | "blocked";

export type CompetitionCreditCostRule = {
  costCode: string;
  credits: number;
  active: boolean;
};

export type CreditSourceContractAlias =
  | "UKI_STAKING"
  | "VESTING_VAULT"
  | "TOKEN"
  | "MARKETPLACE"
  | "BRIDGE";

export type CreditVerifiedContractIdentity = {
  runtimeCodeHash: string;
  configHash: string;
  deploymentBlock: number;
};

export type CompetitionCreditRule = {
  _id: string;
  scope: typeof CREDIT_RULE_SCOPE;
  version: string;
  active: boolean;
  activeFrom: Date;
  activeUntil?: Date;
  cutoffHourUtc: number;
  cutoffMinuteUtc: number;
  maxSnapshotLatenessMs: number;
  sourceFreshnessMs: number;
  expectedBscChainId: 56 | 97;
  sourceContractAddresses: Record<CreditSourceContractAlias, string>;
  verifiedSourceIdentities: Record<
    "UKI_STAKING" | "VESTING_VAULT",
    CreditVerifiedContractIdentity
  >;
  creditsPerSlot: typeof CREDITS_PER_MATURE_SLOT;
  maxSnapshotSlots: number;
  maxBatchSize: number;
  leaseDurationMs: number;
  reservationTtlMs: number;
  costs: CompetitionCreditCostRule[];
  configHash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CompetitionCreditPeriod = {
  periodId: string;
  cutoff: Date;
  nextCutoff: Date;
  ruleVersion: string;
  ruleConfigHash: string;
};

export type CreditSourceWatermark = {
  _id: typeof CREDIT_SOURCE_WATERMARK_ID;
  status: "healthy" | "unhealthy";
  observedThrough: Date;
  sourceRuleVersions: Record<"uki" | "nft", string>;
  sourceHash: string;
  slotCount: number;
  healthEvidenceHash: string;
  updatedAt: Date;
};

export type CreditSourceHealth = {
  healthy: boolean;
  warnings: string[];
  observedThrough: Date | null;
  sourceRuleVersions: Record<"uki" | "nft", string> | null;
  evidenceHash: string;
  checkedAt: Date;
};

export type CreditSnapshotGate = {
  schemaReady: boolean;
  activeRuleMatches: boolean;
  sourceWatermark: CreditSourceWatermark | null;
  openIntegrityIncidents: number;
  maturedQualifyingSlots: number;
};

export type CreditSnapshotSlot = Pick<
  CukieMasterSlot,
  | "_id"
  | "walletNormalized"
  | "route"
  | "ordinal"
  | "eligibilityEpoch"
  | "status"
  | "qualifiedSince"
  | "creditEligibleFrom"
  | "inactiveAt"
  | "graceEndsAt"
  | "roundId"
  | "ruleVersion"
  | "sourceHash"
  | "revision"
  | "createdAt"
  | "updatedAt"
>;

export type CreditPoolConfiguration = {
  _id: string;
  configId: string;
  walletNormalized: string;
  slotId: string;
  eligibilityEpoch: number;
  poolCreditsPerSlot: number;
  requestedAt: Date;
  effectiveCutoff: Date;
  ruleVersion: string;
  ruleConfigHash: string;
  idempotencyKey: string;
  requestHash: string;
  payloadHash: string;
  createdAt: Date;
};

export type CreditRunItem = {
  _id: string;
  itemId: string;
  runId: string;
  periodId: string;
  walletNormalized: string;
  slotId: string;
  slotRoute: CreditSnapshotSlot["route"];
  slotOrdinal: number;
  eligibilityEpoch: number;
  slotRuleVersion: string;
  slotRoundId: string;
  slotSourceHash: string;
  slotRevision: number;
  creditEligibleFrom: Date;
  graceEndsAt?: Date;
  grantCredits: typeof CREDITS_PER_MATURE_SLOT;
  ownCredits: number;
  poolCredits: number;
  poolConfigId: string | null;
  payloadHash: string;
  status: "pending" | "applied";
  appliedAt?: Date;
  createdAt: Date;
};

export type CompetitionCreditRun = {
  _id: string;
  runId: string;
  period: CompetitionCreditPeriod;
  status: CreditRunStatus;
  expectedItemCount: number;
  expectedGrantCredits: number;
  expectedOwnCredits: number;
  expectedPoolCredits: number;
  sourceWatermark: CreditSourceWatermark;
  snapshotHash: string;
  fenceToken: number;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
  blockedReason?: string;
  createdAt: Date;
  updatedAt: Date;
  openedAt?: Date;
};

export type CreditLedgerOperation =
  | "grant"
  | "pool_deposit"
  | "reserve"
  | "release"
  | "spend"
  | "expire";

export type CompetitionCreditLedgerEntry = {
  _id: string;
  ledgerId: string;
  idempotencyKey: string;
  payloadHash: string;
  operation: CreditLedgerOperation;
  bucket: CreditBucket;
  amountCredits: number;
  walletNormalized: string | null;
  periodId: string;
  runId: string | null;
  runItemId: string | null;
  lotId: string | null;
  reservationId: string | null;
  sessionId: string | null;
  fromState: CreditLotState | null;
  toState: CreditLotState | null;
  createdAt: Date;
};

export type CreditLot = {
  _id: string;
  lotId: string;
  bucket: CreditBucket;
  walletNormalized: string | null;
  periodId: string;
  runId: string;
  runItemId: string;
  sourceSlotId: string;
  eligibilityEpoch: number;
  totalCredits: number;
  poolDepositedCredits: number;
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  expiredCredits: number;
  expiresAt: Date;
  revision: number;
  blocked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditLotFifoCursor = {
  expiresAt: Date;
  createdAt: Date;
  lotId: string;
};

export type CreditPoolPosition = {
  _id: string;
  positionId: string;
  walletNormalized: string;
  periodId: string;
  runId: string;
  runItemId: string;
  sourceSlotId: string;
  eligibilityEpoch: number;
  credits: number;
  status: "pending_run" | "open" | "blocked";
  createdAt: Date;
  updatedAt: Date;
};

export type CreditAccountPeriod = {
  _id: string;
  walletNormalized: string;
  periodId: string;
  grantedCredits: number;
  poolDepositedCredits: number;
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  expiredCredits: number;
  blocked: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditPoolPeriod = {
  _id: string;
  periodId: string;
  contributedCredits: number;
  availableCredits: number;
  reservedCredits: number;
  spentCredits: number;
  expiredCredits: number;
  blocked: boolean;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CreditReservationAllocation = {
  lotId: string;
  amountCredits: number;
  lotRevision: number;
  lotExpiresAt: Date;
};

export type CreditReservation = {
  _id: string;
  reservationId: string;
  sessionId: string;
  walletNormalized: string;
  periodId: string;
  costCode: string;
  expectedRuleVersion: string | null;
  expectedRuleConfigHash: string | null;
  ruleVersion: string;
  ruleConfigHash: string;
  amountCredits: number;
  bucket: CreditBucket;
  allocations: CreditReservationAllocation[];
  status: "active" | "consumed" | "released" | "expired";
  expiresAt: Date;
  expiresAtCap?: Date;
  revision: number;
  idempotencyKey: string;
  requestHash: string;
  payloadHash: string;
  createdAt: Date;
  updatedAt: Date;
  terminalAt?: Date;
  terminalCommittedAt?: Date;
  terminalIdempotencyKey?: string;
  terminalPayloadHash?: string;
};

export type CreditIntegrityIncident = {
  _id: string;
  incidentId: string;
  type: "credit_reconciliation_mismatch";
  status: "open" | "resolved";
  runId: string;
  periodId: string;
  walletNormalized: string | null;
  reasonCodes: string[];
  evidenceHash: string;
  detectedAt: Date;
  updatedAt: Date;
};

export type CreditReconciliationSnapshot = {
  run: CompetitionCreditRun;
  items: CreditRunItem[];
  ownLots: CreditLot[];
  poolLots: CreditLot[];
  poolPositions: CreditPoolPosition[];
  reservations: CreditReservation[];
  ledger: CompetitionCreditLedgerEntry[];
  accounts: CreditAccountPeriod[];
  poolPeriod: CreditPoolPeriod | null;
  collectionCounts: {
    items: number;
    ownLots: number;
    poolLots: number;
    poolPositions: number;
    reservations: number;
    ledger: number;
    accounts: number;
  };
};

export type CreditReconciliationResult = {
  ok: boolean;
  reasonCodes: string[];
  evidenceHash: string;
};
