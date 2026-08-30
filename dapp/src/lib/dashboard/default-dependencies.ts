import 'server-only';

import { readWalletVestingStatus } from '@/lib/vesting-onchain';
import { getCompetitionService } from '@/lib/treasure-hunt-competition/server/default-service';
import { getCukieMasterWalletStatus } from '@/lib/uki-economy/cukie-master';
import { publicCukieMasterRouteStatus } from '@/lib/uki-economy/cukie-master/public-view';
import { listCukiePoolWalletPositions } from '@/lib/uki-economy/cukie-pool';
import { getCompetitionCreditWalletStatus } from '@/lib/uki-economy/credits';
import { listWalletRewardStatus } from '@/lib/uki-economy/rewards';
import { listUkiMarketplaceSellerInventory } from '@/lib/uki-marketplace/inventory';
import { listSellerUkiMarketplaceOrders } from '@/lib/uki-marketplace';

import type {
  DashboardLoaderResult,
  DashboardModulePayloads,
  DashboardSummaryDependencies,
} from './summary';

function routeSummary(route: ReturnType<typeof publicCukieMasterRouteStatus>) {
  return {
    allocatedSlots: route.position?.allocatedSlots ?? 0,
    desiredSlots: route.position?.desiredSlots ?? 0,
    sourceComplete: route.source.complete,
    projectionFresh: route.projectionFresh,
    synchronizing: route.synchronizing,
  };
}

function observedDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadCukieMaster(
  walletAddress: string,
): Promise<DashboardLoaderResult<DashboardModulePayloads['cukieMaster']>> {
  const status = await getCukieMasterWalletStatus(walletAddress);
  const uki = publicCukieMasterRouteStatus(status.routes.uki);
  const nft = publicCukieMasterRouteStatus(status.routes.nft);
  const routes = { uki: routeSummary(uki), nft: routeSummary(nft) };
  const healthy = Object.values(routes).every((route) => (
    route.sourceComplete && route.projectionFresh && !route.synchronizing
  ));
  return {
    data: {
      allocatedSlots: routes.uki.allocatedSlots + routes.nft.allocatedSlots,
      desiredSlots: routes.uki.desiredSlots + routes.nft.desiredSlots,
      maxPotentialSlots: 10,
      routes,
    },
    health: healthy ? 'healthy' : 'degraded',
    issues: Object.entries(routes).flatMap(([route, value]) => (
      value.sourceComplete && value.projectionFresh && !value.synchronizing
        ? []
        : [`${route.toUpperCase()}_ROUTE_NOT_FRESH`]
    )),
  };
}

async function loadCredits(
  walletAddress: string,
  now: Date,
): Promise<DashboardLoaderResult<DashboardModulePayloads['credits']>> {
  const status = await getCompetitionCreditWalletStatus(walletAddress, now);
  const healthy = status.grants.healthy
    && !status.balance.blocked
    && !status.pool.blocked;
  return {
    data: {
      availableCredits: status.balance.availableCredits,
      reservedCredits: status.balance.reservedCredits,
      spentCredits: status.balance.spentCredits,
      poolDepositedCredits: status.balance.poolDepositedCredits,
      poolAvailableCredits: status.pool.availableCredits,
      activeReservations: status.activeReservations,
    },
    health: healthy ? 'healthy' : 'degraded',
    sourceObservedAt: status.grants.sourceObservedThrough,
    issues: [
      ...(status.grants.healthy ? [] : ['CREDIT_GRANTS_NOT_FRESH']),
      ...(status.balance.blocked ? ['CREDIT_BALANCE_BLOCKED'] : []),
      ...(status.pool.blocked ? ['CREDIT_POOL_BLOCKED'] : []),
    ],
  };
}

async function loadCukiePool(
  walletAddress: string,
  now: Date,
): Promise<DashboardLoaderResult<DashboardModulePayloads['cukiePool']>> {
  const status = await listCukiePoolWalletPositions({ walletAddress, limit: 50, now });
  const activePositions = status.positions.filter((position) => position.status === 'active').length;
  const gamesRemaining = status.positions.reduce((total, position) => (
    total + ('gamesRemaining' in position ? position.gamesRemaining : 0)
  ), 0);
  return {
    data: { positions: status.positions.length, activePositions, gamesRemaining },
    health: status.sourceHealthy ? 'healthy' : 'degraded',
    issues: status.sourceHealthy ? [] : ['CUKIE_POOL_SOURCE_NOT_FRESH'],
  };
}

async function loadRewards(
  walletAddress: string,
): Promise<DashboardLoaderResult<DashboardModulePayloads['rewards']>> {
  const status = await listWalletRewardStatus({ walletAddress, limit: 50 });
  return {
    data: {
      claimableRaw: status.claimableRaw,
      allocations: status.allocations.length,
      claims: status.claims.length,
      claimPublished: status.claimPublished,
      blockedAllocations: status.blockedAllocations,
    },
    health: status.healthy ? 'healthy' : 'degraded',
    issues: [
      ...(status.openIncidents > 0 ? ['REWARD_INTEGRITY_INCIDENT'] : []),
      ...(status.blockedAllocations > 0 ? ['REWARD_ALLOCATION_BLOCKED'] : []),
    ],
  };
}

async function loadMarketplace(
  walletAddress: string,
): Promise<DashboardLoaderResult<DashboardModulePayloads['marketplace']>> {
  const [inventory, orders] = await Promise.all([
    listUkiMarketplaceSellerInventory({ walletAddress }),
    listSellerUkiMarketplaceOrders({ walletAddress, limit: 50 }),
  ]);
  const listingEligible = inventory.filter((item) => item.listingEligible).length;
  const activeListings = orders.filter((order) => order.status === 'active').length;
  const attentionListings = orders.filter((order) => order.status === 'requires_attention').length;
  return {
    data: {
      inventory: inventory.length,
      listingEligible,
      activeListings,
      attentionListings,
    },
    health: attentionListings === 0 ? 'healthy' : 'degraded',
    issues: attentionListings === 0 ? [] : ['MARKETPLACE_LISTING_REQUIRES_ATTENTION'],
  };
}

async function loadVesting(
  walletAddress: string,
): Promise<DashboardLoaderResult<DashboardModulePayloads['vesting']>> {
  const status = await readWalletVestingStatus(walletAddress);
  if (status.chainId !== 97) throw new TypeError('DASHBOARD_VESTING_CHAIN_MISMATCH');
  return {
    data: {
      chainId: status.chainId,
      configFrozen: status.configFrozen,
      hasPosition: status.hasPosition,
      totalAmountRaw: status.totalAmountRaw,
      releasedAmountRaw: status.releasedAmountRaw,
      releasableRaw: status.releasableRaw,
      lockedAmountRaw: status.lockedAmountRaw,
      progressBps: status.progressBps,
    },
    health: status.configFrozen ? 'healthy' : 'degraded',
    issues: status.configFrozen ? [] : ['VESTING_CONFIG_NOT_FROZEN'],
  };
}

async function loadGame(
  walletAddress: string,
): Promise<DashboardLoaderResult<DashboardModulePayloads['game']>> {
  const service = getCompetitionService();
  const runtime = service.getRuntime();
  if (!runtime.campaign) {
    return {
      data: {
        configured: runtime.configured,
        enabled: runtime.enabled,
        phase: runtime.phase,
        campaignId: null,
        eligibilityKind: null,
        attemptsGranted: null,
        attemptsUsed: null,
        attemptsRemaining: null,
        bestRank: null,
        totalTickets: null,
      },
      health: 'degraded',
      issues: ['COMPETITION_NOT_CONFIGURED'],
    };
  }
  const [eligibility, leaderboard] = await Promise.all([
    runtime.campaign.eligibilityKind === 'uki_staking'
      ? service.getStakingEligibility(walletAddress)
      : Promise.resolve(null),
    service.getLeaderboard(walletAddress, 100),
  ]);
  const mine = leaderboard.entries.filter((entry) => entry.isMe);
  const bestRank = mine.length > 0
    ? Math.min(...mine.map((entry) => entry.rank))
    : null;
  const healthy = eligibility === null || eligibility.ready;
  return {
    data: {
      configured: runtime.configured,
      enabled: runtime.enabled,
      phase: runtime.phase,
      campaignId: runtime.campaign.campaignId,
      eligibilityKind: runtime.campaign.eligibilityKind,
      attemptsGranted: eligibility?.attemptsGranted ?? null,
      attemptsUsed: eligibility?.attemptsUsed ?? null,
      attemptsRemaining: eligibility?.attemptsRemaining ?? null,
      bestRank,
      totalTickets: eligibility?.totalTickets ?? null,
    },
    health: healthy ? 'healthy' : 'degraded',
    sourceObservedAt: observedDate(eligibility?.indexedAt),
    issues: [...(eligibility?.issues ?? [])],
  };
}

export function dashboardSummaryDependencies(): DashboardSummaryDependencies {
  return {
    now: () => new Date(),
    loadCukieMaster,
    loadCredits,
    loadCukiePool,
    loadRewards,
    loadMarketplace,
    loadVesting,
    loadGame,
  };
}
