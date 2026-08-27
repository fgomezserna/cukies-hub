import 'server-only';

import { calculateTreasureHuntPrizePoolRaw } from '@/lib/treasure-hunt-prize-pool';

import {
  displayCompetitionAlias,
  isCompetitionWalletAddress,
  normalizeCompetitionWallet,
  multiplyByBps,
  parseUkiRaw,
  settleCompetition,
  type CompetitionConfig,
  type RankedCompetitionAttempt,
} from '..';

export type CompetitionRewardStatus =
  | 'estimated'
  | 'partial'
  | 'no_purchase'
  | 'pool_exhausted'
  | 'reward_rounds_to_zero'
  | 'draw_pending';

export interface CompetitionRewardPurchase {
  readonly eventId: string;
  readonly walletAddress: string;
  readonly asmPurchasedRaw: string;
  readonly ukiPurchasedRaw: string;
}

export interface CompetitionRewardSource {
  listPurchases(input: {
    readonly presaleContractAddress: string;
    readonly through: string;
  }): Promise<readonly CompetitionRewardPurchase[]>;
  getTotalStakedUkiRaw?(input: {
    readonly stakingContractAddress: string;
    readonly stakingChainId: number;
    readonly through: string;
  }): Promise<string>;
}

export interface CompetitionLeaderboardAllocationEntry extends RankedCompetitionAttempt {
  readonly reviewStatus: 'pending' | 'approved';
  readonly tickets?: number;
}

export interface CompetitionLeaderboardAllocationInput {
  readonly campaign: CompetitionConfig;
  readonly entries: readonly CompetitionLeaderboardAllocationEntry[];
}

function exactPool(input: {
  readonly purchases: readonly CompetitionRewardPurchase[];
  readonly poolBps: number;
}) {
  let totalAsmRaisedRaw = BigInt(0);
  let totalUkiSoldRaw = BigInt(0);
  const eventIds = new Set<string>();

  for (const purchase of input.purchases) {
    if (!purchase.eventId || eventIds.has(purchase.eventId)) {
      throw new Error('Competition reward purchases contain an invalid or duplicate event');
    }
    eventIds.add(purchase.eventId);
    if (!isCompetitionWalletAddress(purchase.walletAddress)) {
      throw new Error('Competition reward purchase contains an invalid wallet');
    }
    totalAsmRaisedRaw += parseUkiRaw(purchase.asmPurchasedRaw);
    totalUkiSoldRaw += parseUkiRaw(purchase.ukiPurchasedRaw);
  }

  return calculateTreasureHuntPrizePoolRaw({
    totalAsmRaisedRaw,
    totalUkiSoldRaw,
    poolBps: input.poolBps,
  });
}

function safePositiveInteger(value: number, fallback: number, maximum: number) {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, maximum)
    : fallback;
}

export async function buildCompetitionLeaderboardWithRewards(input: {
  readonly allocation: CompetitionLeaderboardAllocationInput;
  readonly source: CompetitionRewardSource;
  readonly currentWalletAddress?: string | null;
  readonly page?: number;
  readonly pageSize?: number;
  readonly mineOnly?: boolean;
  readonly now?: Date;
}) {
  const calculatedAt = input.now ?? new Date();
  if (!Number.isFinite(calculatedAt.getTime())) {
    throw new TypeError('Competition reward preview time must be a valid date');
  }
  const campaign = input.allocation.campaign;
  const currentWallet = input.currentWalletAddress
    ? normalizeCompetitionWallet(input.currentWalletAddress)
    : null;
  if (campaign.eligibilityKind === 'uki_staking') {
    if (!campaign.stakingContractAddress || !input.source.getTotalStakedUkiRaw) {
      throw new Error('Staking competition reward source is not configured');
    }
    const totalStakedUkiRaw = parseUkiRaw(
      await input.source.getTotalStakedUkiRaw({
        stakingContractAddress: campaign.stakingContractAddress,
        stakingChainId: campaign.stakingChainId as number,
        through: new Date(Math.min(calculatedAt.getTime(), Date.parse(campaign.endsAt))).toISOString(),
      }),
    );
    const poolUkiRaw = parseUkiRaw(campaign.basePrizeUkiRaw)
      + multiplyByBps(totalStakedUkiRaw, campaign.stakePrizeBps);
    const allEntries = input.allocation.entries.map((attempt) => ({
      rank: attempt.rank,
      walletRank: attempt.walletRank,
      attemptId: attempt.attemptId,
      alias: displayCompetitionAlias(attempt.playerAlias),
      score: attempt.score,
      tickets: attempt.tickets ?? Math.floor(attempt.score / campaign.pointsPerTicket),
      gameTimeMs: attempt.gameTimeMs,
      finishedAt: attempt.finishedAt as string,
      reviewStatus: attempt.reviewStatus,
      isMe: currentWallet === attempt.walletAddress,
      estimatedRewardUkiRaw: '0',
      rewardStatus: 'draw_pending' as const,
    }));
    const myAttempts = currentWallet
      ? allEntries.filter((entry) => entry.isMe).length
      : 0;
    const filteredEntries = input.mineOnly
      ? allEntries.filter((entry) => entry.isMe)
      : allEntries;
    const pageSize = safePositiveInteger(input.pageSize ?? 20, 20, 100);
    const requestedPage = safePositiveInteger(input.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
    const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
    const page = Math.min(requestedPage, totalPages);
    return {
      campaignId: campaign.campaignId,
      calculatedAt: calculatedAt.toISOString(),
      poolUkiRaw: poolUkiRaw.toString(10),
      playerPoolUkiRaw: poolUkiRaw.toString(10),
      allocatedPlayerUkiRaw: '0',
      remainingPlayerPoolUkiRaw: poolUkiRaw.toString(10),
      totalRankedEntries: allEntries.length,
      myAttempts,
      pagination: {
        page,
        pageSize,
        totalEntries: filteredEntries.length,
        totalPages,
      },
      entries: filteredEntries.slice((page - 1) * pageSize, page * pageSize),
    } as const;
  }
  const throughMs = Math.min(calculatedAt.getTime(), Date.parse(campaign.endsAt));
  const purchases = await input.source.listPurchases({
    presaleContractAddress: campaign.presaleContractAddress,
    through: new Date(throughMs).toISOString(),
  });
  const poolUkiRaw = exactPool({ purchases, poolBps: campaign.poolBps });
  const settlement = settleCompetition({
    campaign,
    ranking: input.allocation.entries,
    purchases: purchases.map((purchase) => ({
      walletAddress: purchase.walletAddress,
      ukiPurchasedRaw: purchase.ukiPurchasedRaw,
    })),
    poolUkiRaw: poolUkiRaw.toString(),
  });
  const awardByAttemptId = new Map(
    settlement.awards.map((award) => [award.attemptId, award] as const),
  );
  const skipByAttemptId = new Map(
    settlement.skipped.map((skip) => [skip.attemptId, skip] as const),
  );
  const allEntries = input.allocation.entries.map((attempt) => {
    const award = awardByAttemptId.get(attempt.attemptId);
    const skip = skipByAttemptId.get(attempt.attemptId);
    const rewardStatus: CompetitionRewardStatus = award
      ? (award.partial ? 'partial' : 'estimated')
      : skip?.reason === 'no_purchase'
        ? 'no_purchase'
        : skip?.reason === 'reward_rounds_to_zero'
          ? 'reward_rounds_to_zero'
          : 'pool_exhausted';
    return {
      rank: attempt.rank,
      walletRank: attempt.walletRank,
      attemptId: attempt.attemptId,
      alias: displayCompetitionAlias(attempt.playerAlias),
      score: attempt.score,
      gameTimeMs: attempt.gameTimeMs,
      finishedAt: attempt.finishedAt as string,
      reviewStatus: attempt.reviewStatus,
      isMe: currentWallet === attempt.walletAddress,
      estimatedRewardUkiRaw: award?.playerRewardUkiRaw ?? '0',
      rewardStatus,
    };
  });
  const myAttempts = currentWallet
    ? allEntries.filter((entry) => entry.isMe).length
    : 0;
  const filteredEntries = input.mineOnly
    ? allEntries.filter((entry) => entry.isMe)
    : allEntries;
  const pageSize = safePositiveInteger(input.pageSize ?? 20, 20, 100);
  const requestedPage = safePositiveInteger(input.page ?? 1, 1, Number.MAX_SAFE_INTEGER);
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const pageEntries = filteredEntries.slice((page - 1) * pageSize, page * pageSize);
  const playerPoolUkiRaw = BigInt(settlement.playerPoolUkiRaw);
  const allocatedPlayerUkiRaw = BigInt(settlement.playerRewardsUkiRaw);

  return {
    campaignId: campaign.campaignId,
    calculatedAt: calculatedAt.toISOString(),
    poolUkiRaw: settlement.poolUkiRaw,
    playerPoolUkiRaw: settlement.playerPoolUkiRaw,
    allocatedPlayerUkiRaw: settlement.playerRewardsUkiRaw,
    remainingPlayerPoolUkiRaw: (playerPoolUkiRaw - allocatedPlayerUkiRaw).toString(),
    totalRankedEntries: allEntries.length,
    myAttempts,
    pagination: {
      page,
      pageSize,
      totalEntries: filteredEntries.length,
      totalPages,
    },
    entries: pageEntries,
  } as const;
}
