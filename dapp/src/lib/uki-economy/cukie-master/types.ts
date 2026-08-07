import type { CukieMasterRoute } from '../rules';

export type CukieMasterPositionStatus =
  | 'qualifying'
  | 'active'
  | 'grace'
  | 'waitlisted'
  | 'inactive';

export type CukieMasterRequirement =
  | { route: 'uki'; ukiRaw: string }
  | { route: 'nft'; nftPoints: number };

export type CukieMasterSourceCompleteness = {
  complete: boolean;
  warnings: string[];
  presaleRaw: boolean;
  vestingRaw: boolean;
  stakingRaw: boolean;
  nftInventory: boolean;
  indexerHealth: boolean;
};

export type CukieMasterIndexerHealth = {
  healthy: boolean;
  warnings: string[];
  checkedAt: Date;
};

export type CukieMasterSourceRef = {
  source: string;
  collection: string;
  documentId: string | null;
  valueRaw?: string;
  observedAt?: string | null;
};

export type CukieMasterUkiSource = {
  route: 'uki';
  totalUkiRaw: string;
  presaleLockedRaw: string;
  stakedUkiRaw: string;
  refs: CukieMasterSourceRef[];
  completeness: CukieMasterSourceCompleteness;
  sourceHash: string;
};

export type CukieMasterSlotStatus = 'qualifying' | 'active' | 'grace' | 'inactive';

export type CukieMasterSlot = {
  _id: string;
  walletAddress: string;
  walletNormalized: string;
  route: CukieMasterRoute;
  ordinal: number;
  eligibilityEpoch: number;
  status: CukieMasterSlotStatus;
  qualifiedSince: Date;
  creditEligibleFrom: Date;
  inactiveAt?: Date;
  graceEndsAt?: Date;
  roundId: string;
  ruleVersion: string;
  sourceHash: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CukieMasterNftSourceAsset = {
  assetId: string;
  tokenId: string | null;
  rarity: string;
  rarityPoints: number;
  lockId: string | null;
  sourceRefs: CukieMasterSourceRef[];
};

export type CukieMasterNftSource = {
  route: 'nft';
  originalCukiePoints: number;
  nftAssetIds: string[];
  assets: CukieMasterNftSourceAsset[];
  refs: CukieMasterSourceRef[];
  completeness: CukieMasterSourceCompleteness;
  sourceHash: string;
};

export type CukieMasterRouteSource = CukieMasterUkiSource | CukieMasterNftSource;

export type CukieMasterRouteRound = {
  _id: string;
  roundId: string;
  route: CukieMasterRoute;
  status: 'active' | 'closed';
  ruleVersion: string;
  requirement: CukieMasterRequirement;
  pendingRequirement?: CukieMasterRequirement;
  requirementProposedAt?: Date;
  graceEndsAt?: Date;
  proposalIdempotencyKey?: string;
  gracePositionCount?: number;
  capacitySlots: number;
  revision: number;
  fenceToken?: number;
  lastFencedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
};

export type CukieMasterRouteCapacity = {
  _id: CukieMasterRoute;
  route: CukieMasterRoute;
  roundId: string;
  totalSlots: number;
  allocatedSlots: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CukieMasterPosition = {
  _id: string;
  walletAddress: string;
  walletNormalized: string;
  route: CukieMasterRoute;
  status: CukieMasterPositionStatus;
  desiredSlots: number;
  allocatedSlots: number;
  protectedSlots: number;
  qualifiedSince?: Date;
  activeFrom?: Date;
  waitlistedAt?: Date;
  inactiveAt?: Date;
  requirementSnapshot: CukieMasterRequirement;
  pendingRequirementSnapshot?: CukieMasterRequirement;
  graceEndsAt?: Date;
  source: CukieMasterRouteSource;
  sourceHash: string;
  ruleVersion: string;
  roundId: string;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
};

export type CukieMasterPositionEvent = {
  _id: string;
  eventId: string;
  idempotencyKey: string;
  requestIdempotencyKey: string;
  payloadHash: string;
  eventType:
    | 'position_recalculated'
    | 'position_activated'
    | 'position_grace_started'
    | 'slot_transitioned'
    | 'slot_activated'
    | 'requirement_proposed'
    | 'capacity_expanded'
    | 'grace_closed';
  walletNormalized: string | null;
  route: CukieMasterRoute;
  reason: string;
  sourceHash: string | null;
  previous: CukieMasterPosition | null;
  next: CukieMasterPosition | null;
  previousRound?: CukieMasterRouteRound;
  nextRound?: CukieMasterRouteRound;
  previousCapacity?: CukieMasterRouteCapacity;
  nextCapacity?: CukieMasterRouteCapacity;
  previousSlot?: CukieMasterSlot | null;
  nextSlot?: CukieMasterSlot | null;
  createdAt: Date;
};

export type CukieMasterWalletStatus = {
  walletAddress: string;
  walletNormalized: string;
  routes: Record<CukieMasterRoute, {
    position: CukieMasterPosition | null;
    slots: CukieMasterSlot[];
    nextSlotRequirement: CukieMasterRequirement;
    currentRequirement: CukieMasterRequirement;
    pendingRequirement: CukieMasterRequirement | null;
    requirementGraceEndsAt: Date | null;
    deficitToNextSlot: CukieMasterRequirement | null;
    deficitToPreserveSlots: CukieMasterRequirement | null;
    countdownEndsAt: Date | null;
    source: CukieMasterRouteSource;
    sourceCompleteness: CukieMasterSourceCompleteness;
  }>;
  totals: {
    desiredSlots: number;
    allocatedSlots: number;
    maxPotentialSlots: 10;
  };
};

export type CukieMasterRecalculationResult = {
  walletAddress: string;
  walletNormalized: string;
  positions: Record<CukieMasterRoute, CukieMasterPosition>;
};
