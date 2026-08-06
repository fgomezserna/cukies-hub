import type {
  NftAssetGeneration,
  NftAssetRarity,
  NormalizedNftAsset,
} from '@/lib/nft-inventory';

export type CukiePoolGeneration = Exclude<NftAssetGeneration, 'unknown'>;
export type CukiePoolRarity = Exclude<NftAssetRarity, 'unknown'>;

export type CukiePoolPositionStatus =
  | 'active'
  | 'assigned'
  | 'withdrawn'
  | 'exhausted'
  | 'invalidated';

export type CukiePoolPosition = {
  _id: string;
  positionId: string;
  assetId: string;
  tokenId: string;
  ownerNormalized: string;
  generation: CukiePoolGeneration;
  poolType: CukiePoolGeneration;
  poolPriority: 0 | 1;
  rarity: CukiePoolRarity;
  gamesQuota: number;
  gamesRemaining: number;
  status: CukiePoolPositionStatus;
  lifecycleOpen: boolean;
  stakedAt: Date;
  eligibleAt: Date;
  lockId: string;
  lockFencingToken: number;
  idempotencyKey: string;
  requestHash: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  assignmentSessionId?: string;
  assignmentExpiresAt?: Date;
  withdrawalRequestedAt?: Date;
  withdrawnAt?: Date;
  exhaustedAt?: Date;
  invalidatedAt?: Date;
  closeReason?: string;
};

export type CukiePoolAssignmentKind = 'pool_asset' | 'seiku';
export type CukiePoolAssignmentStatus =
  | 'active'
  | 'completed'
  | 'released'
  | 'expired';

export type CukiePoolAssignment = {
  _id: string;
  assignmentId: string;
  sessionId: string;
  kind: CukiePoolAssignmentKind;
  status: CukiePoolAssignmentStatus;
  assetId: string;
  tokenId: string | null;
  positionId: string | null;
  ownerNormalized: string | null;
  generation: CukiePoolGeneration;
  rarity: CukiePoolRarity;
  ownerRewardEligible: boolean;
  lockId: string | null;
  lockFencingToken: number | null;
  idempotencyKey: string;
  requestHash: string;
  assignedAt: Date;
  expiresAt: Date;
  revision: number;
  updatedAt: Date;
  releasedAt?: Date;
  releaseReason?: string;
};

export type CukiePoolEventOperation =
  | 'deposit'
  | 'request_withdrawal'
  | 'assign'
  | 'release'
  | 'expire'
  | 'invalidate';

export type CukiePoolEvent = {
  _id: string;
  eventId: string;
  operation: CukiePoolEventOperation;
  idempotencyKey: string;
  requestHash: string;
  positionId: string | null;
  assignmentId: string | null;
  resultingPosition: CukiePoolPosition | null;
  resultingAssignment: CukiePoolAssignment | null;
  createdAt: Date;
};

export type DepositCukiePoolPositionInput = {
  walletAddress: string;
  assetId: string;
  idempotencyKey: string;
  now?: Date;
};

export type RequestCukiePoolWithdrawalInput = {
  walletAddress: string;
  positionId: string;
  expectedRevision: number;
  idempotencyKey: string;
  now?: Date;
};

export type AssignCukiePoolSessionInput = {
  sessionId: string;
  expiresAt: Date;
  idempotencyKey: string;
  now?: Date;
};

export type ReleaseCukiePoolAssignmentInput = {
  sessionId: string;
  expectedRevision: number;
  consumeGame: boolean;
  reason: string;
  idempotencyKey: string;
  now?: Date;
};

export type ExpireCukiePoolAssignmentsInput = {
  now?: Date;
  limit?: number;
  actor?: string;
};

export type ExpireCukiePoolAssignmentsResult = {
  scanned: number;
  expired: number;
  skipped: number;
};

export type CukiePoolGameSessionLifecycle = {
  sessionId: string;
  status: string;
  revision: number;
  hasSettlementIntent: boolean;
  terminalIntentStatus: string | null;
  terminalStatus: string | null;
};

export type ReconcileCukiePoolPositionsInput = {
  now?: Date;
  limit?: number;
  afterPositionId?: string;
  actor?: string;
};

export type ReconcileCukiePoolPositionsResult = {
  scanned: number;
  invalidated: number;
  skipped: number;
  nextCursor: string | null;
};

export type CukiePoolAssignmentCursor = {
  poolPriority: 0 | 1;
  eligibleAt: Date;
  stakedAt: Date;
  documentId: string;
};

export type CukiePoolAssetSnapshot = NormalizedNftAsset;
