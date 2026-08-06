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
 * Quota de una tenencia canonica. No tiene recarga temporal: una transferencia
 * genera otro ownershipEventId y, por tanto, otro epoch inmutable.
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
  now?: Date;
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
