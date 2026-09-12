import type {
  NftAssetGeneration,
  NftAssetRarity,
  NormalizedNftAsset,
} from "@/lib/nft-inventory";

export type OwnCukieGeneration = Exclude<NftAssetGeneration, "unknown">;
export type OwnCukieRarity = Exclude<NftAssetRarity, "unknown">;

export type OwnCukieEpochStatus =
  | "active"
  | "assigned"
  | "exhausted"
  | "invalidated";

/**
 * Quota ligada a una identidad canónica. Los documentos legacy omiten
 * `periodId` y conservan su semántica lifetime; los ledgers nuevos incluyen
 * periodo/política y son estables ante cambios de propietario.
 */
export type OwnCukieEpoch = {
  _id: string;
  epochId: string;
  assetId: string;
  tokenId: string;
  ownerNormalized: string;
  ownershipEventId: string;
  generation: OwnCukieGeneration;
  rarity: OwnCukieRarity;
  gamesQuota: number;
  gamesRemaining: number;
  status: OwnCukieEpochStatus;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  /**
   * Daily ledgers are stored with a stable asset/period identity. Legacy
   * ownership epochs intentionally omit these fields and keep their original
   * lifetime semantics.
   */
  periodId?: string;
  periodStartsAt?: Date;
  periodEndsAt?: Date;
  quotaPolicyVersion?: string;
  assignmentSessionId?: string;
  assignmentExpiresAt?: Date;
  invalidatedAt?: Date;
  invalidationReason?: string;
};

export type OwnCukieAssignmentStatus =
  | "active"
  | "completed"
  | "released"
  | "invalidated";

export type OwnCukieAssignment = {
  _id: string;
  assignmentId: string;
  sessionId: string;
  status: OwnCukieAssignmentStatus;
  epochId: string;
  assetId: string;
  tokenId: string;
  ownerNormalized: string;
  ownershipEventId: string;
  generation: OwnCukieGeneration;
  rarity: OwnCukieRarity;
  lockId: string;
  lockFencingToken: number;
  restoreSoftStake: boolean;
  idempotencyKey: string;
  requestHash: string;
  assignedAt: Date;
  expiresAt: Date;
  revision: number;
  updatedAt: Date;
  /** Present for period-scoped reservations; absent on legacy reservations. */
  periodId?: string;
  periodStartsAt?: Date;
  periodEndsAt?: Date;
  quotaPolicyVersion?: string;
  terminalAt?: Date;
  terminalReason?: string;
};

export type OwnCukieEventOperation =
  | "assign"
  | "consume"
  | "release"
  | "invalidate";

export type OwnCukieEvent = {
  _id: string;
  eventId: string;
  operation: OwnCukieEventOperation;
  idempotencyKey: string;
  requestHash: string;
  sessionId: string;
  epochId: string;
  assignmentId: string;
  resultingEpoch: OwnCukieEpoch;
  resultingAssignment: OwnCukieAssignment;
  createdAt: Date;
};

export type OwnCukieAssetSnapshot = NormalizedNftAsset & {
  ownershipEventId: string;
};

export type ReserveOwnCukieInput = {
  sessionId: string;
  walletAddress: string;
  selectionPolicy: "owned_bsc_quota_then_pool_v1";
  idempotencyKey: string;
  requestHash: string;
  expiresAt: Date;
  quotaPeriod?: OwnCukieQuotaPeriod;
  now?: Date;
};

export type OwnCukieQuotaPeriod = {
  periodId: string;
  startsAt: Date;
  endsAt: Date;
  policyVersion: string;
};

export type OwnCukieAvailability = {
  /** `partial` exposes confirmed capacity while some assets remain unresolved. */
  status: "ready" | "partial" | "unknown";
  /** Null when the calendar itself could not be resolved safely. */
  periodId: string | null;
  periodStartsAt: Date | null;
  periodEndsAt: Date | null;
  /** On `partial`, these are confirmed lower-bound totals only. */
  totalGamesRemaining: number | null;
  eligibleCukies: number | null;
  unknownCukies: number;
};

export type FinishOwnCukieInput = {
  sessionId: string;
  assignmentId?: string;
  reservationIdempotencyKey: string;
  idempotencyKey: string;
  consumeGame: boolean;
  reason: string;
  now?: Date;
};
