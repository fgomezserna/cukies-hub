import { createHash } from 'node:crypto';

import { normalizeWalletAddress } from '@/lib/wallet-address';
import { economyCycleDelayMs, loadEconomyCycleCalendar } from './cycle-calendar';

import {
  CUKIE_MASTER_DAILY_CREDITS_PER_SLOT,
  CUKIE_MASTER_FIRST_CREDIT_DELAY_HOURS,
  CUKIE_MASTER_MAX_TOTAL_SLOTS_PER_WALLET,
  CUKIE_MASTER_ROUTE_RULES,
  CUKIE_MASTER_RULE_VERSION,
  calculateCukieMasterSlots,
} from './rules';

export type CukieMasterSnapshotInput = {
  walletAddress: string;
  periodId: string;
  eligibleUki: number;
  originalCukiePoints: number;
  calculatedAt?: Date;
  source?: {
    presaleVestedUki?: number;
    releasedOrStakedUki?: number;
    nftAssetIds?: string[];
    nftAssets?: CukieMasterNftAssetSnapshot[];
  };
};

export type CukieMasterNftAssetSnapshot = {
  assetId: string;
  tokenId: string | null;
  network: string;
  ownerNormalized: string | null;
  rarity: string;
  rarityPoints: number;
  generation: string;
  canonicalState: string;
  activeLocks: Array<{
    lockId: string | null;
    ownerNormalized: string | null;
    reason: string | null;
    state: string;
  }>;
  sourceRefs: Array<{
    source: string;
    collection: string;
    documentId: string | null;
    observedAt: string | null;
  }>;
};

export type CukieMasterRouteSnapshot = {
  slots: number;
  maxSlots: number;
  requirementPerSlot: number;
};

export type CukieMasterSnapshotDocument = {
  walletAddress: string;
  walletNormalized: string;
  periodId: string;
  ruleVersion: string;
  calculatedAt: Date;
  routes: {
    uki: CukieMasterRouteSnapshot & {
      eligibleUki: number;
      presaleVestedUki: number;
      releasedOrStakedUki: number;
    };
    nft: CukieMasterRouteSnapshot & {
      originalCukiePoints: number;
      nftAssetIds: string[];
      nftAssets: CukieMasterNftAssetSnapshot[];
    };
  };
  totalSlots: number;
  maxTotalSlots: number;
  dailyCreditsPreview: number;
  firstCreditDelayHours: number;
  snapshotHash: string;
  status: 'calculated';
};

function normalizeNftAssetIds(assetIds?: string[]) {
  return Array.from(new Set(assetIds ?? [])).sort((left, right) => left.localeCompare(right));
}

function normalizeNftAssets(assets?: CukieMasterNftAssetSnapshot[]) {
  return Array.from(new Map(
    (assets ?? [])
      .map((asset) => ({
        ...asset,
        assetId: asset.assetId.trim(),
        activeLocks: [...(asset.activeLocks ?? [])].sort((left, right) => (
          [
            left.lockId ?? '',
            left.ownerNormalized ?? '',
            left.reason ?? '',
            left.state,
          ].join(':').localeCompare([
            right.lockId ?? '',
            right.ownerNormalized ?? '',
            right.reason ?? '',
            right.state,
          ].join(':'))
        )),
        sourceRefs: [...(asset.sourceRefs ?? [])].sort((left, right) => (
          [
            left.source,
            left.collection,
            left.documentId ?? '',
            left.observedAt ?? '',
          ].join(':').localeCompare([
            right.source,
            right.collection,
            right.documentId ?? '',
            right.observedAt ?? '',
          ].join(':'))
        )),
      }))
      .filter((asset) => asset.assetId.length > 0)
      .map((asset) => [asset.assetId, asset] as const),
  ).values()).sort((left, right) => left.assetId.localeCompare(right.assetId));
}

export function buildCukieMasterSnapshot(
  input: CukieMasterSnapshotInput,
): CukieMasterSnapshotDocument {
  const calculatedAt = input.calculatedAt ?? new Date();
  const walletNormalized = normalizeWalletAddress(input.walletAddress);
  const slotBreakdown = calculateCukieMasterSlots({
    eligibleUki: input.eligibleUki,
    originalCukiePoints: input.originalCukiePoints,
  });

  const nftAssetIds = normalizeNftAssetIds(input.source?.nftAssetIds);
  const nftAssets = normalizeNftAssets(input.source?.nftAssets);
  const snapshotWithoutHash = {
    walletAddress: input.walletAddress,
    walletNormalized,
    periodId: input.periodId,
    ruleVersion: CUKIE_MASTER_RULE_VERSION,
    calculatedAt,
    routes: {
      uki: {
        eligibleUki: input.eligibleUki,
        presaleVestedUki: input.source?.presaleVestedUki ?? 0,
        releasedOrStakedUki: input.source?.releasedOrStakedUki ?? 0,
        slots: slotBreakdown.ukiSlots,
        maxSlots: CUKIE_MASTER_ROUTE_RULES.uki.maxSlotsPerWallet,
        requirementPerSlot: CUKIE_MASTER_ROUTE_RULES.uki.requirementPerSlot,
      },
      nft: {
        originalCukiePoints: input.originalCukiePoints,
        nftAssetIds,
        nftAssets,
        slots: slotBreakdown.nftSlots,
        maxSlots: CUKIE_MASTER_ROUTE_RULES.nft.maxSlotsPerWallet,
        requirementPerSlot: CUKIE_MASTER_ROUTE_RULES.nft.requirementPerSlot,
      },
    },
    totalSlots: slotBreakdown.totalSlots,
    maxTotalSlots: CUKIE_MASTER_MAX_TOTAL_SLOTS_PER_WALLET,
    dailyCreditsPreview: slotBreakdown.totalSlots * CUKIE_MASTER_DAILY_CREDITS_PER_SLOT,
    firstCreditDelayHours: economyCycleDelayMs(CUKIE_MASTER_FIRST_CREDIT_DELAY_HOURS, loadEconomyCycleCalendar()) / 3_600_000,
    status: 'calculated',
  } satisfies Omit<CukieMasterSnapshotDocument, 'snapshotHash'>;

  return {
    ...snapshotWithoutHash,
    snapshotHash: cukieMasterSnapshotHash(snapshotWithoutHash),
  };
}

export function cukieMasterSnapshotId(snapshot: Pick<
  CukieMasterSnapshotDocument,
  'walletNormalized' | 'periodId' | 'ruleVersion'
>) {
  return `${snapshot.walletNormalized}:${snapshot.periodId}:${snapshot.ruleVersion}`;
}

export function cukieMasterSnapshotHash(snapshot: Pick<
  CukieMasterSnapshotDocument,
  'routes' | 'totalSlots' | 'maxTotalSlots' | 'dailyCreditsPreview' | 'firstCreditDelayHours'
>) {
  const material = JSON.stringify({
    routes: snapshot.routes,
    totalSlots: snapshot.totalSlots,
    maxTotalSlots: snapshot.maxTotalSlots,
    dailyCreditsPreview: snapshot.dailyCreditsPreview,
    firstCreditDelayHours: snapshot.firstCreditDelayHours,
  });
  return createHash('sha256').update(material).digest('hex');
}

export function cukieMasterSnapshotEventKey(snapshot: Pick<
  CukieMasterSnapshotDocument,
  'walletNormalized' | 'periodId' | 'ruleVersion' | 'snapshotHash'
>) {
  return `cukie-master-snapshot:${cukieMasterSnapshotId(snapshot)}:${snapshot.snapshotHash}`;
}

export {
  getCukieMasterWalletStatus,
  expandCukieMasterRouteCapacity,
  listCreditEligibleCukieMasterSlots,
  listCreditEligibleCukieMasterPositions,
  proposeRequirementIncrease,
  recalculateCukieMasterWallet,
} from './cukie-master/service';
export {
  activateMaturedCukieMasterPositions,
  closeRequirementGrace,
  closeRequirementGraceBatch,
  promoteCukieMasterWaitlist,
} from './cukie-master/jobs';
export type {
  CukieMasterPosition,
  CukieMasterPositionStatus,
  CukieMasterRequirement,
  CukieMasterRouteRound,
  CukieMasterSlot,
  CukieMasterWalletStatus,
} from './cukie-master/types';
export {
  getCukieMasterNftInventory,
  mutateCukieMasterNft,
} from './cukie-master/nft-operations';
export type {
  CukieMasterNftInventoryItem,
  CukieMasterNftOperation,
} from './cukie-master/nft-operations';
