import { stableCukieMasterHash } from './rules';
import type { CukieMasterRouteRound } from './types';

export const CUKIE_MASTER_RUNTIME_RUN_RETENTION_MS = 30 * 24 * 60 * 60_000;
export const CUKIE_MASTER_COMPLETED_JOB_RETENTION_MS = 7 * 24 * 60 * 60_000;

export type RuntimeRouteBinding = {
  roundId: string;
  revision: number;
  proposalEpoch: string;
};

export function runtimeRouteBinding(
  round: Pick<
    CukieMasterRouteRound,
    | 'roundId'
    | 'revision'
    | 'ruleVersion'
    | 'requirement'
    | 'pendingRequirement'
    | 'proposalIdempotencyKey'
    | 'graceEndsAt'
  >,
): RuntimeRouteBinding {
  return {
    roundId: round.roundId,
    revision: round.revision,
    proposalEpoch: stableCukieMasterHash({
      ruleVersion: round.ruleVersion,
      requirement: round.requirement,
      pendingRequirement: round.pendingRequirement,
      proposalIdempotencyKey: round.proposalIdempotencyKey,
      graceEndsAt: round.graceEndsAt,
    }),
  };
}

export function sameRuntimeRouteBinding(
  left: unknown,
  right: RuntimeRouteBinding,
) {
  if (!left || typeof left !== 'object') return false;
  const value = left as Record<string, unknown>;
  return value.roundId === right.roundId
    && value.revision === right.revision
    && value.proposalEpoch === right.proposalEpoch;
}

export type CukiesAssetLookup =
  | { kind: 'document'; documentId: string }
  | { kind: 'token'; network: 'BSC'; tokenId: string };

export function parseCukiesAssetLookup(assetId: string): CukiesAssetLookup | null {
  if (!assetId.startsWith('cukies:')) return null;
  const identity = assetId.slice('cukies:'.length).trim();
  if (!identity || identity === 'unknown') return null;
  const networkToken = /^(bsc):(.+)$/i.exec(identity);
  if (networkToken) {
    const tokenId = networkToken[2].trim();
    return tokenId ? { kind: 'token', network: 'BSC', tokenId } : null;
  }
  if (identity.includes(':')) return null;
  return { kind: 'document', documentId: identity };
}

export function cukiesAssetFilter(lookup: CukiesAssetLookup): Record<string, unknown> {
  if (lookup.kind === 'document') return { _id: lookup.documentId };
  return {
    network: { $in: ['BSC', 'bsc'] },
    tokenId: lookup.tokenId,
  };
}

export function canonicalCukiesAssetMatches(
  asset: Record<string, unknown>,
  lookup: CukiesAssetLookup,
) {
  const network = typeof asset.network === 'string' ? asset.network.toLowerCase() : null;
  const tokenId = typeof asset.tokenId === 'string' ? asset.tokenId : null;
  if (network !== 'bsc') return false;
  if (lookup.kind === 'document') {
    return String(asset._id) === lookup.documentId;
  }
  return tokenId === lookup.tokenId;
}

export const NFT_OWNERSHIP_CURSOR_SORT = { _id: 1 } as const;

export function nftOwnershipCursorFilter(afterId?: string) {
  return {
    status: 'active',
    ...(afterId ? { _id: { $gt: afterId } } : {}),
  };
}

export type NftOwnershipDecision =
  | { action: 'invalidate_integrity'; reason: string }
  | { action: 'invalidate_ownership'; ownerNormalized: string }
  | { action: 'keep' };

export function evaluateNftOwnership(input: {
  lookup: CukiesAssetLookup;
  assets: Record<string, unknown>[];
  lockOwnerNormalized: string;
}): NftOwnershipDecision {
  if (input.assets.length !== 1) {
    return {
      action: 'invalidate_integrity',
      reason: input.assets.length > 1 ? 'nft_lock_asset_ambiguous' : 'nft_lock_asset_missing',
    };
  }
  const asset = input.assets[0];
  if (!canonicalCukiesAssetMatches(asset, input.lookup)) {
    return { action: 'invalidate_integrity', reason: 'nft_lock_asset_missing' };
  }
  const owner = asset.ownerNormalized;
  if (typeof owner !== 'string' || !/^0x[0-9a-f]{40}$/i.test(owner)) {
    return { action: 'invalidate_integrity', reason: 'nft_lock_owner_missing' };
  }
  return owner.toLowerCase() === input.lockOwnerNormalized.toLowerCase()
    ? { action: 'keep' }
    : { action: 'invalidate_ownership', ownerNormalized: owner };
}

export type FullReconciliationSource = {
  id: string;
  collection: string;
  walletField: string;
  filter?: Record<string, unknown>;
};

export const FULL_RECONCILIATION_SOURCES: readonly FullReconciliationSource[] = [
  {
    id: 'projected-positions',
    collection: 'cukie_master_positions',
    walletField: 'walletNormalized',
  },
  {
    id: 'staking-positions',
    collection: 'uki_staking_positions',
    walletField: 'walletNormalized',
  },
  {
    id: 'vesting-positions',
    collection: 'uki_vesting_positions',
    walletField: 'walletNormalized',
  },
  {
    id: 'presale-participants',
    collection: 'presale_participants',
    walletField: 'normalizedWalletAddress',
  },
  {
    id: 'presale-entitlements',
    collection: 'presale_purchases',
    walletField: 'buyerNormalized',
  },
  {
    id: 'nft-owners',
    collection: 'cukies',
    walletField: 'ownerNormalized',
    filter: { network: { $in: ['BSC', 'bsc'] } },
  },
  {
    id: 'nft-active-locks',
    collection: 'nft_asset_locks',
    walletField: 'ownerNormalized',
    filter: { status: 'active' },
  },
  {
    id: 'nft-custodial-positions',
    collection: 'cukie_master_nft_positions',
    walletField: 'beneficiaryNormalized',
    filter: { lifecycleOpen: true },
  },
] as const;

export type FullReconciliationCursor = {
  sourceIndex: number;
  afterWallet?: string;
  afterId?: unknown;
};

export function fullReconciliationCycleId(now: Date) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('now no es una fecha valida para el periodo de reconciliacion.');
  }
  return now.toISOString().slice(0, 10);
}

export function fullReconciliationJobId(cycleId: string, walletNormalized: string) {
  return `full-reconciliation:${cycleId}:${walletNormalized.toLowerCase()}`;
}

export function fullReconciliationSourceFilter(
  source: FullReconciliationSource,
  cursor: Pick<FullReconciliationCursor, 'afterWallet' | 'afterId'>,
) {
  const base = source.filter ?? {};
  if (!cursor.afterWallet) return base;
  const continuation = cursor.afterId === undefined
    ? { [source.walletField]: { $gt: cursor.afterWallet } }
    : {
        $or: [
          { [source.walletField]: { $gt: cursor.afterWallet } },
          {
            [source.walletField]: cursor.afterWallet,
            _id: { $gt: cursor.afterId },
          },
        ],
      };
  return Object.keys(base).length > 0 ? { $and: [base, continuation] } : continuation;
}

export function normalizedWalletsFromSourcePage(
  documents: Record<string, unknown>[],
  walletField: string,
) {
  return [...new Set(documents.flatMap((document) => {
    const value = document[walletField];
    if (typeof value !== 'string') return [];
    const wallet = value.trim().toLowerCase();
    return /^0x[0-9a-f]{40}$/.test(wallet) ? [wallet] : [];
  }))].sort();
}

export function schedulerHeartbeatHealthy(input: {
  now: Date;
  maxLagMs: number;
  maxConsecutiveFailures: number;
  heartbeat: {
    lastAttemptAt?: unknown;
    lastSuccessAt?: unknown;
    consecutiveFailures?: unknown;
  } | null;
}) {
  const { heartbeat } = input;
  if (
    !heartbeat
    || !(heartbeat.lastAttemptAt instanceof Date)
    || !(heartbeat.lastSuccessAt instanceof Date)
    || !Number.isSafeInteger(heartbeat.consecutiveFailures)
  ) return false;
  return input.now.getTime() - heartbeat.lastAttemptAt.getTime() <= input.maxLagMs
    && input.now.getTime() - heartbeat.lastSuccessAt.getTime() <= input.maxLagMs
    && Number(heartbeat.consecutiveFailures) < input.maxConsecutiveFailures;
}
