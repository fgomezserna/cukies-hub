export const GAME_ECONOMY_RULE_SCOPE = "game_economy" as const;

export const GAME_ECONOMY_SESSION_STATUSES = [
  "created",
  "resources_reserved",
  "started",
  "submitted",
  "validated",
  "settled",
  "forfeited",
  "expired",
  "rejected",
] as const;

export type GameEconomySessionStatus =
  (typeof GAME_ECONOMY_SESSION_STATUSES)[number];

export type GameEconomyResourceState =
  | "not_required"
  | "pending"
  | "active"
  | "consumed"
  | "released";

export type GameEconomyResourceKind = "credit" | "cukie";

export type GameEconomyResourceRule = {
  required: boolean;
  consumeOnSettle: boolean;
};

export type GameEconomyCreditRule = GameEconomyResourceRule & {
  costCode: string;
  creditRuleVersion: string;
  creditRuleConfigHash: string;
};

export type GameEconomyRewardRule = {
  /** Version inmutable de rewards que debe liquidar la sesion. */
  rewardRuleVersion: string;
  /** Hash exacto de la configuracion de rewards; evita resolver por version solamente. */
  rewardRuleConfigHash: string;
  /** Maximo convertible por partida, en raw UKI (7.5 UKI con 18 decimales). */
  maxConvertibleRaw: string;
};

export type GameEconomyCukieSelectionPolicy =
  | "pool_only_v1"
  | "owned_bsc_quota_then_pool_v1"
  | "legacy_client_assets_v1";

export type GameEconomyCukieRule = GameEconomyResourceRule & {
  minAssets: number;
  maxAssets: number;
  role: string;
  selectionPolicy: GameEconomyCukieSelectionPolicy;
};

export type GameEconomyCalculationRule = {
  scoreCapRaw: string;
  weightNumeratorRaw: string;
  weightDenominatorRaw: string;
};

export type GameEconomyRuleSnapshot = {
  gameId: string;
  version: string;
  configHash: string;
  sessionTtlMs: number;
  operationLeaseMs: number;
  credit: GameEconomyCreditRule;
  reward: GameEconomyRewardRule;
  cukie: GameEconomyCukieRule;
  calculation: GameEconomyCalculationRule;
};

export type GameEconomyRule = GameEconomyRuleSnapshot & {
  _id: string;
  scope: typeof GAME_ECONOMY_RULE_SCOPE;
  active: boolean;
  activeFrom: Date;
  activeUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type GameEconomyResource = {
  kind: GameEconomyResourceKind;
  state: GameEconomyResourceState;
  reservationId: string | null;
  evidenceHash: string | null;
  operationIdempotencyKey: string;
  reservationRequestHash: string;
  reservationResultHash: string | null;
  updatedAt: Date;
};

export type GameEconomyCommandIntent = {
  idempotencyKey: string;
  requestHash: string;
  decidedAt: Date;
};

export type GameEconomyResourceAction = "consume" | "release";

export type GameEconomyResourceActions = {
  credit: GameEconomyResourceAction;
  cukie: GameEconomyResourceAction;
};

export type GameEconomySettlementIntent = GameEconomyCommandIntent & {
  /** Ausente solo en intents v2 historicos, cuyo hash era SHA256({sessionId}). */
  resourceActions?: GameEconomyResourceActions;
};

export type GameEconomyTerminalIntent = GameEconomyCommandIntent & {
  status: "expired" | "rejected" | "forfeited";
  reasonCode: string;
};

export type GameEconomyCommandReceipt = {
  idempotencyKey: string;
  requestHash: string;
  completedAt: Date;
  resultingRevision: number;
};

export type GameEconomyOperationKind =
  | "reserve"
  | "compensate"
  | "validate"
  | "settle"
  | "release";

export type GameEconomyOperationLease = {
  kind: GameEconomyOperationKind;
  owner: string;
  fenceToken: number;
  acquiredAt: Date;
  leaseExpiresAt: Date;
};

export type GameEconomySubmission = {
  evidenceReference: string;
  payloadHash: string;
  submittedAt: Date;
  command: GameEconomyCommandReceipt;
};

export type GameEconomyValidation = {
  evidenceId: string;
  evidenceHash: string;
  scoreRaw: string;
  cappedScoreRaw: string;
  weightRaw: string;
  resultHash: string;
  verifiedAt: Date;
  verifier: "server_authorized";
  command: GameEconomyCommandReceipt;
};

export type GameEconomyTerminal = {
  reasonCode: string;
  terminalAt: Date;
  command: GameEconomyCommandReceipt;
};

export type GameEconomySession = {
  _id: string;
  sessionId: string;
  walletNormalized: string;
  gameId: string;
  expectedRuleVersion: string | null;
  status: GameEconomySessionStatus;
  rule: GameEconomyRuleSnapshot;
  cukieAssetIds: string[];
  credit: GameEconomyResource;
  cukie: GameEconomyResource;
  reservationPhase: "reserving" | "compensating" | "ready";
  createCommand: GameEconomyCommandReceipt;
  startCommand?: GameEconomyCommandReceipt;
  submission?: GameEconomySubmission;
  validation?: GameEconomyValidation;
  settlementIntent?: GameEconomySettlementIntent;
  terminalIntent?: GameEconomyTerminalIntent;
  settlementCommand?: GameEconomyCommandReceipt;
  terminal?: GameEconomyTerminal;
  operation?: GameEconomyOperationLease;
  revision: number;
  fenceToken: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  settledAt?: Date;
};

export type GameEconomyEvent = {
  _id: string;
  eventId: string;
  sessionId: string;
  fromRevision: number | null;
  toRevision: number;
  fromStatus: GameEconomySessionStatus | null;
  toStatus: GameEconomySessionStatus;
  creditState: GameEconomyResourceState;
  cukieState: GameEconomyResourceState;
  fenceToken: number;
  payloadHash: string;
  createdAt: Date;
};

export type GameScoreResult = {
  scoreRaw: string;
  cappedScoreRaw: string;
  weightRaw: string;
};

export type GameDistributionParticipant = {
  participantId: string;
  weightRaw: string;
};

export type GameDistributionAllocation = {
  participantId: string;
  amountRaw: string;
};
